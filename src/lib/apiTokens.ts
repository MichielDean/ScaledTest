/**
 * API token helpers — generation, hashing, and validation.
 *
 * Tokens are long-lived Bearer credentials for CI pipelines and worker pods.
 * They are scoped to a team and created by an authenticated user.
 *
 * Token format:  sct_<64 hex chars>
 *   "sct" = ScaledTest CI Token
 *
 * Only the SHA-256 hash of the token is stored in the database.
 * The raw token is returned to the caller exactly once, at creation time.
 */

import { createHash, randomBytes } from 'crypto';
import { Pool } from 'pg';
import { dbLogger } from '../logging/logger';
import { getRequiredEnvVar } from '../environment/env';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Prefix for all API tokens — makes them easy to identify in logs/configs. */
export const TOKEN_PREFIX = 'sct_';

/**
 * Number of random bytes used for the token secret.
 * 32 bytes = 256 bits of entropy, represented as 64 hex characters.
 */
const TOKEN_ENTROPY_BYTES = 32;

/**
 * Number of characters from the raw token shown in the "tokenPrefix" display field.
 * Includes the "sct_" prefix so CI teams can identify which token is which
 * without exposing the secret.
 *
 * Example stored prefix: "sct_a1b2c3d4"
 */
const TOKEN_DISPLAY_PREFIX_LENGTH = 12;

// ── DB pool ───────────────────────────────────────────────────────────────────

let apiTokenPool: Pool | null = null;

/**
 * Get (or lazily create) the singleton DB pool for api_tokens queries.
 * Uses the main application database (TIMESCALE_DATABASE_URL).
 */
export function getApiTokenPool(): Pool {
  if (!apiTokenPool) {
    apiTokenPool = new Pool({
      connectionString: getRequiredEnvVar(
        'TIMESCALE_DATABASE_URL',
        'API token management requires a database connection'
      ),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    apiTokenPool.on('error', err => {
      dbLogger.error({ error: err.message }, 'api_tokens pool error');
    });
  }
  return apiTokenPool;
}

/** Override the pool — for tests and DI only. */
export function setApiTokenPool(pool: Pool | null): void {
  apiTokenPool = pool;
}

// ── Token generation and hashing ──────────────────────────────────────────────

/**
 * Generate a new API token.
 * Returns the raw secret — this is the only time it will ever be visible.
 */
export function generateToken(): string {
  const secret = randomBytes(TOKEN_ENTROPY_BYTES).toString('hex');
  return `${TOKEN_PREFIX}${secret}`;
}

/**
 * Return the display prefix for a raw token.
 * This is a short, non-secret prefix stored in the DB to help users
 * identify which token is which without exposing the full secret.
 */
export function getTokenDisplayPrefix(rawToken: string): string {
  return rawToken.substring(0, TOKEN_DISPLAY_PREFIX_LENGTH);
}

/**
 * Compute the SHA-256 hex digest of a raw token.
 * This is what we store in the database.
 */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

// ── DB operations ─────────────────────────────────────────────────────────────

/** Shape stored in and returned from the api_tokens table. */
export interface ApiToken {
  id: string;
  name: string;
  tokenPrefix: string;
  teamId: string;
  createdByUserId: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
}

/** Full token row including hash (only used during auth lookups). */
interface ApiTokenRow {
  id: string;
  name: string;
  token_hash: string;
  token_prefix: string;
  team_id: string;
  created_by_user_id: string;
  created_at: Date;
  last_used_at: Date | null;
  expires_at: Date | null;
}

function rowToApiToken(row: ApiTokenRow): ApiToken {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.token_prefix,
    teamId: row.team_id,
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(row.created_at),
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : null,
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
  };
}

/**
 * Create an API token record in the database.
 *
 * Caller is responsible for generating and hashing the token before calling
 * this function — the raw token must never touch the DB.
 */
export async function createApiToken(opts: {
  name: string;
  tokenHash: string;
  tokenPrefix: string;
  teamId: string;
  createdByUserId: string;
  expiresAt?: Date | null;
}): Promise<ApiToken> {
  const pool = getApiTokenPool();

  const result = await pool.query<ApiTokenRow>(
    `INSERT INTO api_tokens
       (name, token_hash, token_prefix, team_id, created_by_user_id, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING
       id, name, token_hash, token_prefix, team_id,
       created_by_user_id, created_at, last_used_at, expires_at`,
    [
      opts.name,
      opts.tokenHash,
      opts.tokenPrefix,
      opts.teamId,
      opts.createdByUserId,
      opts.expiresAt ?? null,
    ]
  );

  if (result.rows.length === 0) {
    throw new Error('Failed to create API token — no row returned');
  }

  return rowToApiToken(result.rows[0]);
}

/**
 * List all non-expired API tokens for a team.
 * Does NOT return the token hash.
 */
export async function listApiTokens(teamId: string): Promise<ApiToken[]> {
  const pool = getApiTokenPool();

  const result = await pool.query<ApiTokenRow>(
    `SELECT id, name, token_hash, token_prefix, team_id,
            created_by_user_id, created_at, last_used_at, expires_at
     FROM api_tokens
     WHERE team_id = $1
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY created_at DESC`,
    [teamId]
  );

  return result.rows.map(rowToApiToken);
}

/**
 * Delete an API token by id, scoped to a team.
 * Returns true if a row was deleted, false if not found.
 */
export async function revokeApiToken(tokenId: string, teamId: string): Promise<boolean> {
  const pool = getApiTokenPool();

  const result = await pool.query(`DELETE FROM api_tokens WHERE id = $1 AND team_id = $2`, [
    tokenId,
    teamId,
  ]);

  return (result.rowCount ?? 0) > 0;
}

/**
 * Validate an incoming Bearer token against the api_tokens table.
 *
 * Returns the token record if valid and not expired, or null.
 * Also updates last_used_at as a side effect (fire-and-forget).
 */
export async function validateApiToken(rawToken: string): Promise<ApiToken | null> {
  if (!rawToken.startsWith(TOKEN_PREFIX)) {
    return null;
  }

  const pool = getApiTokenPool();
  const hash = hashToken(rawToken);

  const result = await pool.query<ApiTokenRow>(
    `SELECT id, name, token_hash, token_prefix, team_id,
            created_by_user_id, created_at, last_used_at, expires_at
     FROM api_tokens
     WHERE token_hash = $1
       AND (expires_at IS NULL OR expires_at > NOW())`,
    [hash]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const token = rowToApiToken(result.rows[0]);

  // Update last_used_at asynchronously — don't block the request
  pool
    .query('UPDATE api_tokens SET last_used_at = NOW() WHERE id = $1', [token.id])
    .catch(err =>
      dbLogger.warn({ error: err, tokenId: token.id }, 'Failed to update last_used_at')
    );

  return token;
}
