import { PoolClient } from 'pg';
import { getTimescalePool } from './timescaledb';
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

export async function listExecutions(
  filters: ExecutionFilters = {}
): Promise<{ executions: TestExecution[]; total: number }> {
  let client: PoolClient | null = null;
  try {
    const pool = getTimescalePool();
    client = await pool.connect();

    const { page = 1, size = 20, status, teamId, requestedBy, dateFrom, dateTo } = filters;
    const offset = (page - 1) * Math.min(size, 100);
    const limit = Math.min(size, 100);

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

export async function cancelExecution(id: string): Promise<TestExecution | null> {
  const execution = await getExecution(id);
  if (!execution) return null;
  if (execution.status !== 'queued') {
    throw new Error(`Cannot cancel execution in status: ${execution.status}`);
  }
  return updateExecutionStatus(id, 'cancelled');
}
