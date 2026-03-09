/**
 * Invitation helpers — token generation, hashing, and DB operations.
 *
 * Invitation flow:
 *   1. Maintainer or owner calls POST /api/admin/invitations → generates token, stores hash.
 *   2. Invitee receives email with the raw token embedded in a link.
 *   3. Invitee visits GET /api/admin/invitations/[token] — shows email/role preview.
 *   4. Invitee submits POST /api/admin/invitations/[token] with name + password → account created.
 *   5. RBAC role is assigned atomically; invitation marked accepted.
 *
 * Security contract:
 *   - Only the SHA-256 hash of the token is stored in the DB.
 *   - The raw token is returned to the caller exactly once (at creation).
 *   - tokenHash is never returned to any API consumer.
 *   - Invitations expire after 7 days (configurable via INVITE_EXPIRY_DAYS).
 *   - Once accepted or revoked an invitation is permanently invalid (410 Gone).
 */

import { createHash, randomBytes } from 'crypto';
import { Pool } from 'pg';
import { dbLogger } from '../logging/logger';
import { getRequiredEnvVar } from '../environment/env';

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
 */
const DEFAULT_EXPIRY_DAYS = 7;

// ── DB pool ───────────────────────────────────────────────────────────────────

let invitationPool: Pool | null = null;

/** Get (or lazily create) the singleton DB pool for invitations queries. */
export function getInvitationPool(): Pool {
  if (!invitationPool) {
    invitationPool = new Pool({
      connectionString: getRequiredEnvVar(
        'TIMESCALE_DATABASE_URL',
        'Invitation management requires a database connection'
      ),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    invitationPool.on('error', err => {
      dbLogger.error({ error: err.message }, 'invitations pool error');
    });
  }
  return invitationPool;
}

/** Override the pool — for tests and DI only. */
export function setInvitationPool(pool: Pool | null): void {
  invitationPool = pool;
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
 * Compute the invitation expiry date from now.
 * Defaults to 7 days; override with INVITE_EXPIRY_DAYS env var.
 */
function computeExpiryDate(): Date {
  const days = parseInt(process.env.INVITE_EXPIRY_DAYS ?? String(DEFAULT_EXPIRY_DAYS), 10);
  const expiryDays = Number.isFinite(days) && days > 0 ? days : DEFAULT_EXPIRY_DAYS;
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + expiryDays);
  return expiry;
}

// ── Types ─────────────────────────────────────────────────────────────────────

/** The invitation row as returned by DB queries. */
export interface Invitation {
  id: string;
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

/** DB row shape. */
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
 * Returns true if the invitation was found and updated, false otherwise.
 */
export async function revokeInvitation(rawToken: string): Promise<boolean> {
  const pool = getInvitationPool();
  const hash = hashInviteToken(rawToken);

  const result = await pool.query(
    `UPDATE invitations
     SET revoked_at = NOW()
     WHERE token_hash = $1
       AND revoked_at IS NULL
       AND accepted_at IS NULL`,
    [hash]
  );

  return (result.rowCount ?? 0) > 0;
}

/**
 * Mark an invitation as accepted.
 * Called after the user account has been successfully created.
 *
 * @param invitationId — the UUID primary key of the invitation row.
 */
export async function markInvitationAccepted(invitationId: string): Promise<void> {
  const pool = getInvitationPool();

  await pool.query(
    `UPDATE invitations
     SET accepted_at = NOW()
     WHERE id = $1`,
    [invitationId]
  );
}
