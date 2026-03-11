import { PoolClient } from 'pg';
import { getTimescalePool } from './timescaledb';
import { dbLogger as logger, logError } from '../logging/logger';

export interface TrendPoint {
  date: string;
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  passRate: number;
}

export interface FlakyTestResult {
  testName: string;
  suite: string;
  totalRuns: number;
  passed: number;
  failed: number;
  flakyScore: number;
  avgDuration: number;
}

export interface ErrorAnalysisResult {
  errorMessage: string;
  count: number;
  affectedTests: string[];
}

export interface DurationBucket {
  range: string;
  count: number;
  avgDuration: number;
}

/**
 * Validates and clamps the `days` parameter. All analytics functions accept `days` from
 * user-supplied query params; we validate here AND at the call site (API handlers) for
 * defense in depth. Never interpolate user input into SQL — use parameterized queries.
 */
function validateDays(days: number | undefined): number {
  const d = Math.floor(days ?? 30);
  if (!Number.isFinite(d) || d < 1) return 1;
  if (d > 365) return 365;
  return d;
}

export async function getTestTrends(filters: {
  days?: number;
  tool?: string;
  environment?: string;
  teamIds?: string[];
  userId?: string;
}): Promise<TrendPoint[]> {
  const days = validateDays(filters.days);
  const { tool, environment, userId, teamIds } = filters;
  let client: PoolClient | null = null;
  try {
    const pool = getTimescalePool();
    client = await pool.connect();

    // Use parameterized interval — NEVER string-interpolate user-supplied values into SQL.
    // $1 is the days count; cast to integer in SQL for the interval multiplication.
    const conditions: string[] = [`timestamp >= NOW() - ($1 * INTERVAL '1 day')`];
    const values: unknown[] = [days];
    let p = 2;

    if (userId) {
      if (teamIds && teamIds.length > 0) {
        conditions.push(`(uploaded_by = $${p} OR user_teams::jsonb ?| $${p + 1}::text[])`);
        values.push(userId, teamIds);
        p += 2;
      } else {
        conditions.push(`uploaded_by = $${p++}`);
        values.push(userId);
      }
    }

    if (tool) {
      conditions.push(`tool_name = $${p++}`);
      values.push(tool);
    }
    if (environment) {
      conditions.push(`environment_test_environment = $${p++}`);
      values.push(environment);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const result = await client.query(
      `SELECT
        time_bucket('1 day', timestamp) AS bucket,
        COALESCE(SUM(summary_passed), 0)::integer AS passed,
        COALESCE(SUM(summary_failed), 0)::integer AS failed,
        COALESCE(SUM(summary_skipped), 0)::integer AS skipped,
        COALESCE(SUM(summary_tests), 0)::integer AS total
      FROM test_reports
      ${where}
      GROUP BY bucket
      ORDER BY bucket ASC`,
      values
    );

    return result.rows.map(row => {
      const r = row as {
        bucket: Date;
        passed: number;
        failed: number;
        skipped: number;
        total: number;
      };
      const total = r.total;
      const passRate = total > 0 ? Math.round((r.passed / total) * 100) : 0;
      return {
        date: new Date(r.bucket).toISOString().split('T')[0],
        passed: r.passed,
        failed: r.failed,
        skipped: r.skipped,
        total,
        passRate,
      };
    });
  } catch (error) {
    logError(logger, 'Failed to get test trends', error);
    throw error;
  } finally {
    client?.release();
  }
}

export async function getFlakyTests(filters: {
  days?: number;
  minRuns?: number;
  tool?: string;
  teamIds?: string[];
  userId?: string;
}): Promise<FlakyTestResult[]> {
  const days = validateDays(filters.days);
  const minRuns = Math.max(1, Math.floor(filters.minRuns ?? 3));
  const { userId, teamIds } = filters;
  let client: PoolClient | null = null;
  try {
    const pool = getTimescalePool();
    client = await pool.connect();

    const accessConditions: string[] = [];
    const baseValues: unknown[] = [days];
    let p = 2;

    if (userId) {
      if (teamIds && teamIds.length > 0) {
        accessConditions.push(`(uploaded_by = $${p} OR user_teams::jsonb ?| $${p + 1}::text[])`);
        baseValues.push(userId, teamIds);
        p += 2;
      } else {
        accessConditions.push(`uploaded_by = $${p++}`);
        baseValues.push(userId);
      }
    }

    const accessWhere = accessConditions.length > 0 ? `AND ${accessConditions.join(' AND ')}` : '';
    const minRunsParam = p;
    baseValues.push(minRuns);

    // Uses the normalized test_results table — fully indexable, no JSONB expansion.
    const result = await client.query(
      `WITH grouped AS (
        SELECT
          name AS test_name,
          COALESCE(suite, 'unknown') AS suite,
          COUNT(*) AS total_runs,
          SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) AS passed,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
          AVG(duration_ms) AS avg_duration
        FROM test_results
        WHERE created_at >= NOW() - ($1 * INTERVAL '1 day')
          ${accessWhere}
        GROUP BY name, suite
        HAVING COUNT(*) >= $${minRunsParam}
      )
      SELECT * FROM grouped
      WHERE passed > 0 AND failed > 0
      ORDER BY (failed::float / total_runs) DESC
      LIMIT 50`,
      baseValues
    );

    return result.rows.map(row => {
      const r = row as {
        test_name: string;
        suite: string;
        total_runs: string;
        passed: string;
        failed: string;
        avg_duration: string;
      };
      const totalRuns = parseInt(r.total_runs, 10);
      const failed = parseInt(r.failed, 10);
      return {
        testName: r.test_name,
        suite: r.suite,
        totalRuns,
        passed: parseInt(r.passed, 10),
        failed,
        flakyScore: Math.round((failed / totalRuns) * 100),
        avgDuration: Math.round(parseFloat(r.avg_duration)),
      };
    });
  } catch (error) {
    logError(logger, 'Failed to get flaky tests', error);
    throw error;
  } finally {
    client?.release();
  }
}

export async function getErrorAnalysis(filters: {
  days?: number;
  limit?: number;
  teamIds?: string[];
  userId?: string;
}): Promise<ErrorAnalysisResult[]> {
  const days = validateDays(filters.days);
  const limit = Math.min(Math.max(1, Math.floor(filters.limit ?? 20)), 100);
  const { userId, teamIds } = filters;
  let client: PoolClient | null = null;
  try {
    const pool = getTimescalePool();
    client = await pool.connect();

    const conditions: string[] = [];
    const values: unknown[] = [days];
    let p = 2;

    if (userId) {
      if (teamIds && teamIds.length > 0) {
        conditions.push(`(uploaded_by = $${p} OR user_teams::jsonb ?| $${p + 1}::text[])`);
        values.push(userId, teamIds);
        p += 2;
      } else {
        conditions.push(`uploaded_by = $${p++}`);
        values.push(userId);
      }
    }

    const accessWhere = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';
    const limitParam = p;
    values.push(limit);

    const result = await client.query(
      `SELECT
        COALESCE(message, 'No error message') AS error_message,
        COUNT(*) AS count,
        array_agg(DISTINCT name) AS affected_tests
      FROM test_results
      WHERE created_at >= NOW() - ($1 * INTERVAL '1 day')
        ${accessWhere}
        AND status = 'failed'
        AND message IS NOT NULL
      GROUP BY error_message
      ORDER BY count DESC
      LIMIT $${limitParam}`,
      values
    );

    return result.rows.map(row => {
      const r = row as { error_message: string; count: string; affected_tests: string[] | null };
      return {
        errorMessage: r.error_message,
        count: parseInt(r.count, 10),
        affectedTests: r.affected_tests ?? [],
      };
    });
  } catch (error) {
    logError(logger, 'Failed to get error analysis', error);
    throw error;
  } finally {
    client?.release();
  }
}

export async function getDurationDistribution(filters: {
  days?: number;
  tool?: string;
  teamIds?: string[];
  userId?: string;
}): Promise<DurationBucket[]> {
  const days = validateDays(filters.days);
  const { userId, teamIds } = filters;
  let client: PoolClient | null = null;
  try {
    const pool = getTimescalePool();
    client = await pool.connect();

    const conditions: string[] = [];
    const values: unknown[] = [days];
    let p = 2;

    if (userId) {
      if (teamIds && teamIds.length > 0) {
        conditions.push(`(uploaded_by = $${p} OR user_teams::jsonb ?| $${p + 1}::text[])`);
        values.push(userId, teamIds);
        p += 2;
      } else {
        conditions.push(`uploaded_by = $${p++}`);
        values.push(userId);
      }
    }

    const accessWhere = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

    const result = await client.query(
      `SELECT
        CASE
          WHEN duration_ms < 100 THEN '<100ms'
          WHEN duration_ms < 500 THEN '100-500ms'
          WHEN duration_ms < 2000 THEN '500ms-2s'
          WHEN duration_ms < 10000 THEN '2s-10s'
          ELSE '>10s'
        END AS range,
        COUNT(*)::integer AS count,
        ROUND(AVG(duration_ms))::integer AS avg_duration
      FROM test_results
      WHERE created_at >= NOW() - ($1 * INTERVAL '1 day')
        ${accessWhere}
      GROUP BY range
      ORDER BY MIN(duration_ms)`,
      values
    );

    // Ensure all buckets are always present even if DB has no data for some
    const buckets = ['<100ms', '100-500ms', '500ms-2s', '2s-10s', '>10s'];
    const resultMap = new Map(
      result.rows.map(r => {
        const row = r as { range: string; count: number; avg_duration: number };
        return [row.range, row];
      })
    );

    return buckets.map(range => {
      const row = resultMap.get(range) as
        | { range: string; count: number; avg_duration: number }
        | undefined;
      return {
        range,
        count: row ? row.count : 0,
        avgDuration: row ? row.avg_duration : 0,
      };
    });
  } catch (error) {
    logError(logger, 'Failed to get duration distribution', error);
    throw error;
  } finally {
    client?.release();
  }
}
