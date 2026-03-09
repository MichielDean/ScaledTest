/**
 * Invitation helpers — token generation, hashing, and DB operations.
 *
 * Invitation flow:
 *   1. Maintainer or owner calls POST /api/admin/invitations → generates token, stores hash.
 *   2. Invitee receives email with the raw token embedded in a link.
 *   3. Invitee visits GET /api/admin/invitations/[token] — shows email/role preview.
 *   4. Invitee submits POST /api/admin/invitations/[token] with name + password → account created.
 *   5. RBAC role is assigned; invitation marked accepted atomically.
 *
 * Security contract:
 *   - Only the SHA-256 hash of the token is stored in the DB.
 *   - The raw token is returned to the caller exactly once (at creation).
 *   - tokenHash is never returned to any API consumer.
 *   - Invitations expire after INVITE_EXPIRY_DAYS (default 3 days, max 7).
 *   - Once accepted or revoked an invitation is permanently invalid (410 Gone).
 *   - Emails are normalised to lowercase before storage and comparison.
 *   - Acceptance is gated on an atomic conditional UPDATE to prevent TOCTOU races.
 */

import { createHash, randomBytes } from 'crypto';
import { getDbPool } from './teamManagement';

// ── Constants ─────────────────────────────────────────────────────────────────

/** All invitation tokens start with this prefix for easy identification. */
export const INVITE_TOKEN_PREFIX = 'inv_';

/**
 * Entropy bytes for the token secret.
 * 32 bytes = 256 bits, hex-encoded → 64 chars.
 */
const INVITE_TOKEN_ENTROPY_BYTES = 32;

/**
 * Default invitation lifetime in days.
 * Can be overridden via INVITE_EXPIRY_DAYS environment variable.
 * Default is intentionally conservative (3 days); 7 is the absolute max we allow.
 */
const DEFAULT_EXPIRY_DAYS = 3;
const MAX_EXPIRY_DAYS = 7;

// ── DB pool ───────────────────────────────────────────────────────────────────
// Delegated to the shared pool in teamManagement to avoid connection exhaustion
// from multiple independent pools targeting the same database URL.

/** Get the shared DB pool for invitation queries. */
export function getInvitationPool() {
  return getDbPool();
}

// ── Token helpers ─────────────────────────────────────────────────────────────

/**
 * Generate a new invitation token.
 * Returns the raw secret — this is the only time it will ever be visible.
 */
export function generateInviteToken(): string {
  const secret = randomBytes(INVITE_TOKEN_ENTROPY_BYTES).toString('hex');
  return `${INVITE_TOKEN_PREFIX}${secret}`;
}

/**
 * Compute the SHA-256 hex digest of a raw invitation token.
 * This is what we store in the database — never the raw token.
 */
export function hashInviteToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

/**
 * Normalise an email address: trim whitespace and lowercase.
 * All emails entering the invitation system must pass through this function.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Compute the invitation expiry date from now.
 * Defaults to DEFAULT_EXPIRY_DAYS; overridable via INVITE_EXPIRY_DAYS env var.
 * Capped at MAX_EXPIRY_DAYS to limit attack surface.
 */
function computeExpiryDate(): Date {
  const raw = parseInt(process.env.INVITE_EXPIRY_DAYS ?? String(DEFAULT_EXPIRY_DAYS), 10);
  const days =
    Number.isFinite(raw) && raw > 0 ? Math.min(raw, MAX_EXPIRY_DAYS) : DEFAULT_EXPIRY_DAYS;
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + days);
  return expiry;
}

// ── Password validation ───────────────────────────────────────────────────────

const MIN_PASSWORD_LENGTH = 8;

/**
 * Validate password strength.
 * Returns an error message if invalid, or null if acceptable.
 */
export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  // Require at least one letter and one non-letter character (digit or symbol)
  if (!/[a-zA-Z]/.test(password)) {
    return 'Password must contain at least one letter';
  }
  if (!/[^a-zA-Z]/.test(password)) {
    return 'Password must contain at least one digit or symbol';
  }
  return null;
}

// ── Types ─────────────────────────────────────────────────────────────────────

/** The invitation row as returned by DB queries. */
export interface Invitation {
  id: string;
  /** Normalised (lowercased) email address. */
  email: string;
  /** Role to assign on acceptance. */
  role: string;
  /** SHA-256 hash of the raw token — never returned to API consumers. */
  tokenHash: string;
  /** Short display prefix for identification (not secret). */
  tokenPrefix: string;
  invitedByUserId: string;
  teamId: string | null;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

/** DB row shape (snake_case from postgres). */
interface InvitationRow {
  id: string;
  email: string;
  role: string;
  token_hash: string;
  token_prefix: string;
  invited_by_user_id: string;
  team_id: string | null;
  expires_at: Date;
  accepted_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
}

function rowToInvitation(row: InvitationRow): Invitation {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    tokenHash: row.token_hash,
    tokenPrefix: row.token_prefix,
    invitedByUserId: row.invited_by_user_id,
    teamId: row.team_id,
    expiresAt: new Date(row.expires_at),
    acceptedAt: row.accepted_at ? new Date(row.accepted_at) : null,
    revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
    createdAt: new Date(row.created_at),
  };
}

// ── DB operations ─────────────────────────────────────────────────────────────

/**
 * Create a new invitation record.
 *
 * Caller is responsible for generating and hashing the token before calling
 * this function — the raw token must never touch the DB.
 * Email must be normalised (lowercased) before calling.
 */
export async function createInvitation(opts: {
  email: string;
  role: string;
  tokenHash: string;
  tokenPrefix: string;
  invitedByUserId: string;
  teamId?: string | null;
}): Promise<Invitation> {
  const pool = getInvitationPool();
  const expiresAt = computeExpiryDate();

  const result = await pool.query<InvitationRow>(
    `INSERT INTO invitations
       (email, role, token_hash, token_prefix, invited_by_user_id, team_id, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING
       id, email, role, token_hash, token_prefix,
       invited_by_user_id, team_id, expires_at,
       accepted_at, revoked_at, created_at`,
    [
      opts.email,
      opts.role,
      opts.tokenHash,
      opts.tokenPrefix,
      opts.invitedByUserId,
      opts.teamId ?? null,
      expiresAt,
    ]
  );

  if (result.rows.length === 0) {
    throw new Error('Failed to create invitation — no row returned');
  }

  return rowToInvitation(result.rows[0]);
}

/**
 * Look up an invitation by its raw token.
 * Hashes the token internally and queries by hash.
 *
 * Returns null if no matching invitation exists.
 * Does NOT filter by validity — caller checks expiry/accepted/revoked.
 */
export async function getInvitationByToken(rawToken: string): Promise<Invitation | null> {
  const pool = getInvitationPool();
  const hash = hashInviteToken(rawToken);

  const result = await pool.query<InvitationRow>(
    `SELECT id, email, role, token_hash, token_prefix,
            invited_by_user_id, team_id, expires_at,
            accepted_at, revoked_at, created_at
     FROM invitations
     WHERE token_hash = $1`,
    [hash]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return rowToInvitation(result.rows[0]);
}

/**
 * Atomically claim an invitation for acceptance.
 *
 * Uses a conditional UPDATE (not a SELECT then UPDATE) to prevent TOCTOU races
 * where two concurrent requests both pass the validity check, then both create
 * user accounts from the same invitation.
 *
 * Returns the invitation row if the claim succeeded (the UPDATE matched a valid,
 * unaccepted, unrevoked, unexpired row), or null if the invitation is not claimable
 * (already accepted, revoked, expired, or not found).
 *
 * ⚠️ The caller must call markInvitationAccepted() after user creation succeeds.
 *    This function locks the invitation by setting accepted_at = NOW() as a sentinel.
 *    markInvitationAccepted() then re-sets accepted_at to the real acceptance time.
 */
export async function claimInvitationForAcceptance(rawToken: string): Promise<Invitation | null> {
  const pool = getInvitationPool();
  const hash = hashInviteToken(rawToken);

  // This UPDATE is the TOCTOU guard. Only one concurrent request can win the race:
  // the second request will find accepted_at IS NOT NULL and return 0 rows.
  // We set a sentinel accepted_at value here; markInvitationAccepted() will re-set it
  // to NOW() (same effect, ensures the column is set even if the second call is skipped).
  const result = await pool.query<InvitationRow>(
    `UPDATE invitations
     SET accepted_at = NOW()
     WHERE token_hash = $1
       AND accepted_at IS NULL
       AND revoked_at IS NULL
       AND expires_at > NOW()
     RETURNING
       id, email, role, token_hash, token_prefix,
       invited_by_user_id, team_id, expires_at,
       accepted_at, revoked_at, created_at`,
    [hash]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return rowToInvitation(result.rows[0]);
}

/**
 * List all invitations, newest first.
 * Optionally filter by team.
 */
export async function listInvitations(teamId?: string | null): Promise<Invitation[]> {
  const pool = getInvitationPool();

  let query = `SELECT id, email, role, token_hash, token_prefix,
                      invited_by_user_id, team_id, expires_at,
                      accepted_at, revoked_at, created_at
               FROM invitations`;

  const params: (string | null)[] = [];

  if (teamId !== undefined && teamId !== null) {
    query += ' WHERE team_id = $1';
    params.push(teamId);
  }

  query += ' ORDER BY created_at DESC';

  const result = await pool.query<InvitationRow>(query, params);
  return result.rows.map(rowToInvitation);
}

/**
 * Revoke an invitation by its raw token.
 * Sets revoked_at to NOW() so the token is permanently invalidated.
 *
 * Returns the revoked invitation's UUID on success, or null if the invitation
 * was not found, already revoked, or already accepted.
 */
export async function revokeInvitation(rawToken: string): Promise<string | null> {
  const pool = getInvitationPool();
  const hash = hashInviteToken(rawToken);

  const result = await pool.query<{ id: string }>(
    `UPDATE invitations
     SET revoked_at = NOW()
     WHERE token_hash = $1
       AND revoked_at IS NULL
       AND accepted_at IS NULL
     RETURNING id`,
    [hash]
  );

  return result.rows.length > 0 ? result.rows[0].id : null;
}

/**
 * Mark an invitation's accepted_at timestamp.
 * This is a no-op if accepted_at was already set by claimInvitationForAcceptance().
 * Called after the user account has been successfully created and the role assigned.
 *
 * @param invitationId — the UUID primary key of the invitation row.
 */
export async function markInvitationAccepted(invitationId: string): Promise<void> {
  const pool = getInvitationPool();

  await pool.query(
    `UPDATE invitations
     SET accepted_at = COALESCE(accepted_at, NOW())
     WHERE id = $1`,
    [invitationId]
  );
}

/**
 * Undo the atomic claim made by claimInvitationForAcceptance().
 * Called when user creation or role assignment fails after the claim was made.
 * Resets accepted_at to NULL so the invitation can be used again.
 *
 * @param invitationId — the UUID primary key of the invitation row.
 */
export async function unclaimInvitation(invitationId: string): Promise<void> {
  const pool = getInvitationPool();

  await pool.query(
    `UPDATE invitations
     SET accepted_at = NULL
     WHERE id = $1`,
    [invitationId]
  );
}
