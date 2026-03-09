/**
 * Audit log library — append-only recording of user actions.
 *
 * Design rules:
 *   1. APPEND-ONLY.  Never update or delete rows.
 *   2. Non-blocking.  appendAuditLog() catches its own errors and logs them;
 *      a failure to write to the audit log must never fail the caller's request.
 *   3. Typed actions.  All valid action strings are defined in AuditAction below.
 *      Callers import the constant and cannot supply arbitrary strings at the call site.
 *   4. Minimal coupling.  This module takes raw primitives from callers — it does not
 *      import from API handlers or auth middleware.
 */

import { dbLogger as logger } from '../logging/logger';
import { getTimescalePool } from './timescaledb';

// ── Action constants ──────────────────────────────────────────────────────────

export const AuditAction = {
  // Report operations
  REPORT_SUBMITTED: 'report.submitted',
  REPORT_DELETED: 'report.deleted',

  // Execution lifecycle
  EXECUTION_CREATED: 'execution.created',
  EXECUTION_CANCELLED: 'execution.cancelled',
  EXECUTION_COMPLETED: 'execution.completed',
  EXECUTION_FAILED: 'execution.failed',

  // Admin operations
  ADMIN_ROLE_CHANGED: 'admin.role_changed',
  ADMIN_USER_DELETED: 'admin.user_deleted',
  ADMIN_USER_INVITED: 'admin.user_invited',

  // Team membership
  TEAM_MEMBER_ADDED: 'team.member_added',
  TEAM_MEMBER_REMOVED: 'team.member_removed',
} as const;

export type AuditActionValue = (typeof AuditAction)[keyof typeof AuditAction];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AppendAuditLogInput {
  /** Better Auth user id or "api-token:<tokenId>".  Pass null for system actions. */
  actorId: string | null;
  /** Denormalised actor email for readability.  Pass null if unavailable. */
  actorEmail: string | null;
  /** One of the AuditAction constants. */
  action: AuditActionValue;
  /** The kind of resource being acted on, e.g. "execution", "report", "user". */
  resourceType: string;
  /** The id of the resource, or null if not applicable. */
  resourceId: string | null;
  /** Team scope, or null for org-wide / admin actions. */
  teamId: string | null;
  /** Arbitrary structured context.  Keep it small — this goes into JSONB. */
  metadata?: Record<string, unknown>;
  /** HTTP request IP address, or null if not available. */
  ipAddress?: string | null;
}

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  teamId: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
}

export interface ListAuditLogOptions {
  /** Filter to a single actor. */
  actorId?: string;
  /** Filter by action prefix, e.g. "execution" matches all "execution.*" actions. */
  actionPrefix?: string;
  /** Filter by resource type. */
  resourceType?: string;
  /** Filter by team. */
  teamId?: string;
  /** ISO8601 lower bound (inclusive). */
  dateFrom?: string;
  /** ISO8601 upper bound (inclusive). */
  dateTo?: string;
  /** 1-indexed page number. */
  page?: number;
  /** Rows per page (max 200). */
  size?: number;
}

export interface ListAuditLogResult {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  size: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// ── Core append function ──────────────────────────────────────────────────────

/**
 * Append one entry to the audit log.
 *
 * This function swallows its own errors: a write failure must never propagate
 * to the caller.  The error is logged at the error level so it shows up in
 * monitoring, but the caller's response is not affected.
 */
export async function appendAuditLog(input: AppendAuditLogInput): Promise<void> {
  try {
    const pool = getTimescalePool();
    await pool.query(
      `INSERT INTO audit_log
         (actor_id, actor_email, action, resource_type, resource_id, team_id, metadata, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [
        input.actorId ?? null,
        input.actorEmail ?? null,
        input.action,
        input.resourceType,
        input.resourceId ?? null,
        input.teamId ?? null,
        JSON.stringify(input.metadata ?? {}),
        input.ipAddress ?? null,
      ]
    );
  } catch (error) {
    // Never throw — audit log failures must not break the calling request.
    logger.error({ error, action: input.action }, 'Failed to append audit log entry');
  }
}

// ── Query function ────────────────────────────────────────────────────────────

/**
 * List audit log entries with optional filters and pagination.
 * Intended for the admin UI and is restricted to owners at the API layer.
 */
export async function listAuditLog(options: ListAuditLogOptions = {}): Promise<ListAuditLogResult> {
  const {
    actorId,
    actionPrefix,
    resourceType,
    teamId,
    dateFrom,
    dateTo,
    page: rawPage,
    size: rawSize,
  } = options;

  const page = Math.max(1, rawPage ?? 1);
  const size = Math.min(Math.max(1, rawSize ?? 50), 200);
  const offset = (page - 1) * size;

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (actorId) {
    params.push(actorId);
    conditions.push(`actor_id = $${params.length}`);
  }

  if (actionPrefix) {
    // Match "execution" -> "execution.%" to catch all execution.* events.
    // Also match exact action if it already contains a dot.
    params.push(`${actionPrefix.replace(/%/g, '\\%').replace(/_/g, '\\_')}.%`);
    params.push(actionPrefix);
    conditions.push(
      `(action LIKE $${params.length - 1} ESCAPE '\\' OR action = $${params.length})`
    );
  }

  if (resourceType) {
    params.push(resourceType);
    conditions.push(`resource_type = $${params.length}`);
  }

  if (teamId) {
    params.push(teamId);
    conditions.push(`team_id = $${params.length}`);
  }

  if (dateFrom) {
    params.push(dateFrom);
    conditions.push(`created_at >= $${params.length}`);
  }

  if (dateTo) {
    params.push(dateTo);
    conditions.push(`created_at <= $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const pool = getTimescalePool();

  // Count query — uses the same WHERE clause
  const countResult = await pool.query(`SELECT COUNT(*) AS total FROM audit_log ${where}`, params);
  const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

  // Data query — newest first
  params.push(size, offset);
  const dataResult = await pool.query(
    `SELECT id, actor_id, actor_email, action, resource_type, resource_id,
            team_id, metadata, ip_address, created_at
     FROM audit_log
     ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const entries: AuditLogEntry[] = dataResult.rows.map(row => ({
    id: row.id,
    actorId: row.actor_id,
    actorEmail: row.actor_email,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    teamId: row.team_id,
    metadata: row.metadata ?? {},
    ipAddress: row.ip_address,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  }));

  const totalPages = Math.ceil(total / size);

  return {
    entries,
    total,
    page,
    size,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}
