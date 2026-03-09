import { PoolClient } from 'pg';
import { getTimescalePool, getLinkedReportIds } from './timescaledb';
import { dbLogger as logger, logError } from '../logging/logger';

export type ExecutionStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface TestExecution {
  id: string;
  status: ExecutionStatus;
  dockerImage: string;
  testCommand: string;
  parallelism: number;
  environmentVars: Record<string, string>;
  resourceLimits: { cpu?: string; memory?: string };
  requestedBy: string | null;
  teamId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  kubernetesJobName: string | null;
  kubernetesNamespace: string;
  errorMessage: string | null;
  totalPods: number;
  completedPods: number;
  failedPods: number;
}

/**
 * Extended execution detail returned by GET /api/v1/executions/:id (SCA-10).
 * Adds derived `activePods` count and the list of linked CTRF report IDs.
 */
export interface ExecutionDetail extends TestExecution {
  /**
   * Derived from totalPods - completedPods - failedPods.
   * Represents pods that are currently running (not yet done or failed).
   * Always >= 0 (floored at 0 to guard against inconsistent DB state).
   */
  activePods: number;
  /** IDs of CTRF reports submitted by worker pods for this execution. */
  linkedReportIds: string[];
}

export interface CreateExecutionInput {
  dockerImage: string;
  testCommand: string;
  parallelism?: number;
  environmentVars?: Record<string, string>;
  resourceLimits?: { cpu?: string; memory?: string };
  requestedBy: string;
  teamId?: string;
}

export interface ExecutionFilters {
  status?: ExecutionStatus;
  teamId?: string;
  requestedBy?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  size?: number;
}

function rowToExecution(row: Record<string, unknown>): TestExecution {
  return {
    id: row.id as string,
    status: row.status as ExecutionStatus,
    dockerImage: row.docker_image as string,
    testCommand: row.test_command as string,
    parallelism: row.parallelism as number,
    environmentVars:
      typeof row.environment_vars === 'string'
        ? (JSON.parse(row.environment_vars as string) as Record<string, string>)
        : ((row.environment_vars as Record<string, string>) ?? {}),
    resourceLimits:
      typeof row.resource_limits === 'string'
        ? (JSON.parse(row.resource_limits as string) as { cpu?: string; memory?: string })
        : ((row.resource_limits as { cpu?: string; memory?: string }) ?? {}),
    requestedBy: row.requested_by as string | null,
    teamId: row.team_id as string | null,
    startedAt: row.started_at ? (row.started_at as Date).toISOString() : null,
    completedAt: row.completed_at ? (row.completed_at as Date).toISOString() : null,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
    kubernetesJobName: row.kubernetes_job_name as string | null,
    kubernetesNamespace: row.kubernetes_namespace as string,
    errorMessage: row.error_message as string | null,
    totalPods: row.total_pods as number,
    completedPods: row.completed_pods as number,
    failedPods: row.failed_pods as number,
  };
}

export async function createExecution(input: CreateExecutionInput): Promise<TestExecution> {
  let client: PoolClient | null = null;
  try {
    const pool = getTimescalePool();
    client = await pool.connect();
    const result = await client.query(
      `INSERT INTO test_executions (
        docker_image, test_command, parallelism, environment_vars, resource_limits,
        requested_by, team_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        input.dockerImage,
        input.testCommand,
        input.parallelism ?? 1,
        JSON.stringify(input.environmentVars ?? {}),
        JSON.stringify(input.resourceLimits ?? {}),
        input.requestedBy,
        input.teamId ?? null,
      ]
    );
    logger.info({ executionId: result.rows[0].id }, 'Execution created');
    return rowToExecution(result.rows[0] as Record<string, unknown>);
  } catch (error) {
    logError(logger, 'Failed to create execution', error);
    throw error;
  } finally {
    client?.release();
  }
}

export async function getExecution(id: string): Promise<TestExecution | null> {
  let client: PoolClient | null = null;
  try {
    const pool = getTimescalePool();
    client = await pool.connect();
    const result = await client.query('SELECT * FROM test_executions WHERE id = $1', [id]);
    return result.rows[0] ? rowToExecution(result.rows[0] as Record<string, unknown>) : null;
  } catch (error) {
    logError(logger, 'Failed to get execution', error, { id });
    throw error;
  } finally {
    client?.release();
  }
}

/**
 * Returns execution detail for GET /api/v1/executions/:id (SCA-10).
 *
 * Enriches the base TestExecution record with:
 *   - `activePods`: derived as max(0, totalPods - completedPods - failedPods)
 *   - `linkedReportIds`: report_ids from test_reports where execution_id = id
 *
 * Returns null if the execution does not exist.
 */
export async function getExecutionDetail(id: string): Promise<ExecutionDetail | null> {
  try {
    const execution = await getExecution(id);
    if (!execution) return null;

    const linkedReportIds = await getLinkedReportIds(id);

    // activePods: pods still running — floored at 0 to guard against counter drift
    const activePods = Math.max(
      0,
      execution.totalPods - execution.completedPods - execution.failedPods
    );

    return { ...execution, activePods, linkedReportIds };
  } catch (error) {
    logError(logger, 'Failed to get execution detail', error, { id });
    throw error;
  }
}

export async function listExecutions(
  filters: ExecutionFilters = {}
): Promise<{ executions: TestExecution[]; total: number }> {
  let client: PoolClient | null = null;
  try {
    const pool = getTimescalePool();
    client = await pool.connect();

    const { page = 1, size = 20, status, teamId, requestedBy, dateFrom, dateTo } = filters;
    // Sanitize page/size defensively — callers outside the API layer may pass unclamped values
    const normalizedPage = page > 0 ? page : 1;
    const normalizedSize = size > 0 ? size : 20;
    const limit = Math.min(normalizedSize, 100);
    const offset = (normalizedPage - 1) * limit;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let p = 1;

    if (status) {
      conditions.push(`status = $${p++}`);
      values.push(status);
    }
    if (teamId) {
      conditions.push(`team_id = $${p++}`);
      values.push(teamId);
    }
    if (requestedBy) {
      conditions.push(`requested_by = $${p++}`);
      values.push(requestedBy);
    }
    if (dateFrom) {
      conditions.push(`created_at >= $${p++}`);
      values.push(dateFrom);
    }
    if (dateTo) {
      conditions.push(`created_at <= $${p++}`);
      values.push(dateTo);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await client.query(
      `SELECT COUNT(*) as total FROM test_executions ${where}`,
      values
    );
    const total = parseInt((countResult.rows[0] as { total: string }).total, 10);

    const dataResult = await client.query(
      `SELECT * FROM test_executions ${where} ORDER BY created_at DESC LIMIT $${p} OFFSET $${p + 1}`,
      [...values, limit, offset]
    );

    return {
      executions: dataResult.rows.map(row => rowToExecution(row as Record<string, unknown>)),
      total,
    };
  } catch (error) {
    logError(logger, 'Failed to list executions', error);
    throw error;
  } finally {
    client?.release();
  }
}

export async function updateExecutionStatus(
  id: string,
  status: ExecutionStatus,
  extra: Partial<
    Pick<
      TestExecution,
      | 'errorMessage'
      | 'startedAt'
      | 'completedAt'
      | 'kubernetesJobName'
      | 'completedPods'
      | 'failedPods'
      | 'totalPods'
    >
  > = {}
): Promise<TestExecution | null> {
  let client: PoolClient | null = null;
  try {
    const pool = getTimescalePool();
    client = await pool.connect();

    const sets: string[] = ['status = $1', 'updated_at = now()'];
    const values: unknown[] = [status];
    let p = 2;

    if (extra.errorMessage !== undefined) {
      sets.push(`error_message = $${p++}`);
      values.push(extra.errorMessage);
    }
    if (extra.startedAt !== undefined) {
      sets.push(`started_at = $${p++}`);
      values.push(extra.startedAt);
    }
    if (extra.completedAt !== undefined) {
      sets.push(`completed_at = $${p++}`);
      values.push(extra.completedAt);
    }
    if (extra.kubernetesJobName !== undefined) {
      sets.push(`kubernetes_job_name = $${p++}`);
      values.push(extra.kubernetesJobName);
    }
    if (extra.totalPods !== undefined) {
      sets.push(`total_pods = $${p++}`);
      values.push(extra.totalPods);
    }
    if (extra.completedPods !== undefined) {
      sets.push(`completed_pods = $${p++}`);
      values.push(extra.completedPods);
    }
    if (extra.failedPods !== undefined) {
      sets.push(`failed_pods = $${p++}`);
      values.push(extra.failedPods);
    }

    values.push(id);
    const result = await client.query(
      `UPDATE test_executions SET ${sets.join(', ')} WHERE id = $${p} RETURNING *`,
      values
    );
    return result.rows[0] ? rowToExecution(result.rows[0] as Record<string, unknown>) : null;
  } catch (error) {
    logError(logger, 'Failed to update execution status', error, { id, status });
    throw error;
  } finally {
    client?.release();
  }
}

export interface CancelExecutionResult {
  execution: TestExecution;
  /** The actual status the execution had before cancellation (e.g. 'queued' or 'running'). */
  previousStatus: ExecutionStatus;
}

export async function cancelExecution(id: string): Promise<CancelExecutionResult | null> {
  let client: PoolClient | null = null;
  try {
    const pool = getTimescalePool();
    client = await pool.connect();

    // Atomic compare-and-swap: only cancel if currently 'queued'.
    // Uses a CTE to capture the previous status before the UPDATE so the audit log
    // records what actually happened rather than hardcoding 'queued'.
    // When PR #65 (z8c) widens the WHERE clause to IN ('queued', 'running'), the
    // previous_status column will correctly reflect whichever state was cancelled.
    const result = await client.query(
      `WITH prev AS (
         SELECT status FROM test_executions WHERE id = $1
       )
       UPDATE test_executions
       SET status = 'cancelled', updated_at = now()
       WHERE id = $1 AND status = 'queued'
       RETURNING *, (SELECT status FROM prev) AS previous_status`,
      [id]
    );

    if (result.rowCount === 0) {
      // Either id doesn't exist, or execution is not in queued state.
      // Distinguish the two to give callers a useful error.
      const existing = await client.query('SELECT status FROM test_executions WHERE id = $1', [id]);
      if (existing.rowCount === 0) return null;
      throw new Error(
        `Cannot cancel execution in status: ${(existing.rows[0] as { status: string }).status}`
      );
    }

    return {
      execution: rowToExecution(result.rows[0] as Record<string, unknown>),
      previousStatus: (result.rows[0] as Record<string, unknown>).previous_status as ExecutionStatus,
    };
  } catch (error) {
    // Re-throw business logic errors as-is; wrap DB errors
    if (error instanceof Error && error.message.startsWith('Cannot cancel')) throw error;
    logError(logger, 'Failed to cancel execution', error, { id });
    throw error;
  } finally {
    client?.release();
  }
}

/**
 * Atomically increment completedPods for an execution.
 * If completedPods reaches totalPods after the increment, marks the execution as 'completed'
 * and sets completedAt.
 *
 * Returns the updated execution row, or null if the execution is already in a terminal state
 * (completed / failed / cancelled) — duplicate callbacks from pods are silently ignored.
 *
 * Race-condition mitigations (Copilot SCA-9 review):
 *   1. LEAST(completed_pods + 1, total_pods) — saturates the counter so concurrent duplicate
 *      callbacks cannot push completed_pods beyond total_pods.
 *   2. COALESCE(completed_at, now()) — preserves the first completed_at timestamp; subsequent
 *      updates do not overwrite it.
 *   3. WHERE NOT status = ANY(...) guard — skips the UPDATE entirely for terminal executions,
 *      making duplicate callbacks idempotent without touching the row.
 *
 * Used by the worker result callback endpoint (SCA-9).
 */
export async function recordExecutionResult(id: string): Promise<TestExecution | null> {
  let client: PoolClient | null = null;
  try {
    const pool = getTimescalePool();
    client = await pool.connect();

    // Single atomic UPDATE — no separate read required.
    // The WHERE clause skips terminal executions so duplicate callbacks are no-ops.
    const result = await client.query(
      `UPDATE test_executions
       SET
         -- Saturate at total_pods to prevent over-counting from duplicate callbacks
         completed_pods = LEAST(completed_pods + 1, total_pods),
         status = CASE
           WHEN LEAST(completed_pods + 1, total_pods) >= total_pods THEN 'completed'
           ELSE status
         END,
         -- COALESCE preserves the first completed_at; duplicate callbacks don't overwrite it
         completed_at = CASE
           WHEN LEAST(completed_pods + 1, total_pods) >= total_pods
             THEN COALESCE(completed_at, now())
           ELSE completed_at
         END,
         updated_at = now()
       WHERE id = $1
         AND NOT status = ANY(ARRAY['completed','failed','cancelled']::text[])
       RETURNING *`,
      [id]
    );

    // No row returned means either:
    //   a) the execution doesn't exist (caller already did 404 check), or
    //   b) it was already in a terminal state — duplicate callback, silently ignore.
    if (!result.rows[0]) {
      return null;
    }

    return rowToExecution(result.rows[0] as Record<string, unknown>);
  } catch (error) {
    logError(logger, 'Failed to record execution result', error, { id });
    throw error;
  } finally {
    client?.release();
  }
}
