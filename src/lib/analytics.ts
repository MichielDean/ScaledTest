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
  uploadedBy?: string;
}): Promise<TrendPoint[]> {
  const days = validateDays(filters.days);
  const { tool, environment } = filters;
  let client: PoolClient | null = null;
  try {
    const pool = getTimescalePool();
    client = await pool.connect();

    // Use parameterized interval — NEVER string-interpolate user-supplied values into SQL.
    // $1 is the days count; cast to integer in SQL for the interval multiplication.
    const conditions: string[] = [`timestamp >= NOW() - ($1 * INTERVAL '1 day')`];
    const values: unknown[] = [days];
    let p = 2;

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
}): Promise<FlakyTestResult[]> {
  const days = validateDays(filters.days);
  const minRuns = Math.max(1, Math.floor(filters.minRuns ?? 3));
  let client: PoolClient | null = null;
  try {
    const pool = getTimescalePool();
    client = await pool.connect();

    // NOTE: jsonb_array_elements does not benefit from the GIN index — it does a full
    // JSONB expansion of every row in the time window. This is an acceptable trade-off
    // for the flaky-test analytics query (infrequently run, smaller window, no hot path).
    // TODO: migrate test data to a normalized `test_results` table to make this indexable.
    // The timestamp range filter ($1) does benefit from the timestamp hypertable index.
    const result = await client.query(
      `WITH test_runs AS (
        SELECT
          t->>'name' AS test_name,
          COALESCE(t->>'suite', 'unknown') AS suite,
          t->>'status' AS status,
          (t->>'duration')::numeric AS duration
        FROM test_reports,
          jsonb_array_elements(test_data->'tests') AS t
        WHERE timestamp >= NOW() - ($1 * INTERVAL '1 day')
          AND t->>'name' IS NOT NULL
      ),
      grouped AS (
        SELECT
          test_name,
          suite,
          COUNT(*) AS total_runs,
          SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) AS passed,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
          AVG(duration) AS avg_duration
        FROM test_runs
        GROUP BY test_name, suite
        HAVING COUNT(*) >= $2
      )
      SELECT * FROM grouped
      WHERE passed > 0 AND failed > 0
      ORDER BY (failed::float / total_runs) DESC
      LIMIT 50`,
      [days, minRuns]
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
}): Promise<ErrorAnalysisResult[]> {
  const days = validateDays(filters.days);
  const limit = Math.min(Math.max(1, Math.floor(filters.limit ?? 20)), 100);
  let client: PoolClient | null = null;
  try {
    const pool = getTimescalePool();
    client = await pool.connect();

    const result = await client.query(
      `WITH failures AS (
        SELECT
          COALESCE(t->>'message', 'No error message') AS error_message,
          t->>'name' AS test_name
        FROM test_reports,
          jsonb_array_elements(test_data->'tests') AS t
        WHERE timestamp >= NOW() - ($1 * INTERVAL '1 day')
          AND t->>'status' = 'failed'
          AND t->>'message' IS NOT NULL
      )
      SELECT
        error_message,
        COUNT(*) AS count,
        array_agg(DISTINCT test_name) AS affected_tests
      FROM failures
      GROUP BY error_message
      ORDER BY count DESC
      LIMIT $2`,
      [days, limit]
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
}): Promise<DurationBucket[]> {
  const days = validateDays(filters.days);
  let client: PoolClient | null = null;
  try {
    const pool = getTimescalePool();
    client = await pool.connect();

    const result = await client.query(
      `WITH test_durations AS (
        SELECT (t->>'duration')::numeric AS duration
        FROM test_reports,
          jsonb_array_elements(test_data->'tests') AS t
        WHERE timestamp >= NOW() - ($1 * INTERVAL '1 day')
          AND t->>'duration' IS NOT NULL
      )
      SELECT
        CASE
          WHEN duration < 100 THEN '<100ms'
          WHEN duration < 500 THEN '100-500ms'
          WHEN duration < 2000 THEN '500ms-2s'
          WHEN duration < 10000 THEN '2s-10s'
          ELSE '>10s'
        END AS range,
        COUNT(*)::integer AS count,
        ROUND(AVG(duration))::integer AS avg_duration
      FROM test_durations
      GROUP BY range
      ORDER BY MIN(duration)`,
      [days]
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
