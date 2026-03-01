import type { NextApiResponse } from 'next';
import type { PoolClient } from 'pg';
import { BetterAuthenticatedRequest, createBetterAuthApi } from '../../auth/betterAuthApi';
import { getUserTeams } from '../../lib/teamManagement';
import { getTimescalePool } from '../../lib/timescaledb';
import { getRequestLogger, logError } from '../../logging/logger';

type AnalyticsStatsRow = {
  total_reports: string | number | null;
  total_tests: string | number | null;
  total_passed: string | number | null;
  total_failed: string | number | null;
  recent_reports: string | number | null;
};

type AnalyticsTrendRow = {
  date: string;
  total: string | number;
  passed: string | number;
  failed: string | number;
};

type AnalyticsFailingRow = {
  name: string | null;
  suite: string | null;
  fail_count: string | number;
  total_runs: string | number;
};

type AnalyticsResponse = {
  success: true;
  stats: {
    totalReports: number;
    totalTests: number;
    passRate: number;
    failRate: number;
    recentReports: number;
  };
  trends: Array<{
    date: string;
    total: number;
    passed: number;
    failed: number;
    passRate: number;
  }>;
  topFailingTests: Array<{
    name: string;
    suite: string;
    failCount: number;
    totalRuns: number;
    failRate: number;
  }>;
};

type ErrorResponse = {
  success: false;
  error: string;
  details?: string;
};

type AccessClause = {
  clause: string;
  params: Array<string | string[]>;
};

const isDatabaseError = (error: unknown): boolean => {
  if (!error) {
    return false;
  }

  const message = error instanceof Error ? error.message : String(error);
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';

  return (
    message.includes('ECONNREFUSED') ||
    message.includes('Connection terminated') ||
    message.includes('TimescaleDB pool') ||
    message.includes('getaddrinfo') ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND'
  );
};

const buildAccessClause = (userId: string, teamIds: string[]): AccessClause => {
  if (teamIds.length > 0) {
    return {
      clause: '(uploaded_by = $1 OR user_teams::jsonb ?| $2::text[])',
      params: [userId, teamIds],
    };
  }

  return {
    clause: 'uploaded_by = $1',
    params: [userId],
  };
};

const calculateRate = (numerator: number, denominator: number): number => {
  if (!denominator) {
    return 0;
  }

  return Math.round((numerator / denominator) * 1000) / 10;
};

const coerceNumber = (value: string | number | null | undefined): number => {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
};

const fetchStats = async (client: PoolClient, access: AccessClause) => {
  const statsQuery = `
    /* analytics_stats */
    SELECT
      COUNT(*) AS total_reports,
      COALESCE(SUM(summary_tests), 0) AS total_tests,
      COALESCE(SUM(summary_passed), 0) AS total_passed,
      COALESCE(SUM(summary_failed), 0) AS total_failed,
      COUNT(*) FILTER (WHERE timestamp >= NOW() - INTERVAL '7 days') AS recent_reports
    FROM test_reports
    WHERE ${access.clause}
  `;

  const result = await client.query(statsQuery, [...access.params]);
  const row: AnalyticsStatsRow | undefined = result.rows[0];

  return {
    totalReports: coerceNumber(row?.total_reports),
    totalTests: coerceNumber(row?.total_tests),
    totalPassed: coerceNumber(row?.total_passed),
    totalFailed: coerceNumber(row?.total_failed),
    recentReports: coerceNumber(row?.recent_reports),
  };
};

const fetchTrends = async (client: PoolClient, access: AccessClause) => {
  const trendQuery = `
    /* analytics_trends */
    SELECT
      to_char(date_trunc('day', timestamp), 'YYYY-MM-DD') AS date,
      COALESCE(SUM(summary_tests), 0) AS total,
      COALESCE(SUM(summary_passed), 0) AS passed,
      COALESCE(SUM(summary_failed), 0) AS failed
    FROM test_reports
    WHERE ${access.clause}
      AND timestamp >= NOW() - INTERVAL '30 days'
    GROUP BY date
    ORDER BY date ASC
  `;

  const result = await client.query(trendQuery, [...access.params]);
  return result.rows.map((row: AnalyticsTrendRow) => {
    const total = coerceNumber(row.total);
    const passed = coerceNumber(row.passed);
    const failed = coerceNumber(row.failed);

    return {
      date: row.date,
      total,
      passed,
      failed,
      passRate: calculateRate(passed, total),
    };
  });
};

const fetchTopFailingTests = async (client: PoolClient, access: AccessClause) => {
  const failingQuery = `
    /* analytics_top_failing */
    WITH accessible_reports AS (
      SELECT report_id, timestamp, test_data
      FROM test_reports
      WHERE ${access.clause}
      ORDER BY timestamp DESC
      LIMIT 1000
    )
    SELECT
      test_elem->>'name' AS name,
      NULLIF(test_elem->>'suite', '') AS suite,
      COUNT(*) FILTER (WHERE test_elem->>'status' = 'failed') AS fail_count,
      COUNT(*) AS total_runs
    FROM accessible_reports,
         LATERAL jsonb_array_elements(COALESCE(test_data->'tests', '[]'::jsonb)) AS test_elem
    WHERE test_elem->>'name' IS NOT NULL
    GROUP BY name, suite
    HAVING COUNT(*) FILTER (WHERE test_elem->>'status' = 'failed') > 0
    ORDER BY fail_count DESC, total_runs DESC, name ASC
    LIMIT 10
  `;

  const result = await client.query(failingQuery, [...access.params]);

  return result.rows.map((row: AnalyticsFailingRow) => {
    const failCount = coerceNumber(row.fail_count);
    const totalRuns = coerceNumber(row.total_runs);

    return {
      name: row.name ?? 'Unknown Test',
      suite: row.suite ?? 'General',
      failCount,
      totalRuns,
      failRate: calculateRate(failCount, totalRuns),
    };
  });
};

export const handleGet = async (
  req: BetterAuthenticatedRequest,
  res: NextApiResponse<AnalyticsResponse | ErrorResponse>,
  reqLogger: ReturnType<typeof getRequestLogger>
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        error: 'User identification required',
      });
    }

    const userTeams = await getUserTeams(req.user.id);
    const teamIds = userTeams.map(team => team.id).filter(Boolean);

    const access = buildAccessClause(req.user.id, teamIds);

    const pool = getTimescalePool();
    let client: PoolClient | null = null;

    try {
      client = await pool.connect();

      const stats = await fetchStats(client, access);
      const trends = await fetchTrends(client, access);
      const topFailing = await fetchTopFailingTests(client, access);

      const passRate = calculateRate(stats.totalPassed, stats.totalTests);
      const failRate = calculateRate(stats.totalFailed, stats.totalTests);

      return res.status(200).json({
        success: true,
        stats: {
          totalReports: stats.totalReports,
          totalTests: stats.totalTests,
          passRate,
          failRate,
          recentReports: stats.recentReports,
        },
        trends,
        topFailingTests: topFailing,
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  } catch (error) {
    logError(reqLogger, 'Failed to load analytics data', error);

    if (isDatabaseError(error)) {
      return res.status(503).json({ success: false, error: 'Database service unavailable' });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to load analytics data',
      ...(process.env.NODE_ENV !== 'production' && {
        details: error instanceof Error ? error.message : String(error),
      }),
    });
  }
};

export default createBetterAuthApi({
  GET: handleGet,
});
