/**
 * GET /api/v1/stats
 * Returns dashboard summary stats with 60s in-memory cache.
 * Auth: any authenticated user
 * Response: { success: true, data: { totalReports, totalTests, passRateLast7d, totalExecutions, activeExecutions } }
 */
import type { NextApiResponse } from 'next';
import { createBetterAuthApi, type BetterAuthenticatedRequest } from '@/auth/betterAuthApi';
import { getTimescalePool } from '@/lib/timescaledb';
import { getUserTeams } from '@/lib/teamManagement';
import { apiLogger as logger } from '@/logging/logger';

export interface StatsData {
  totalReports: number;
  totalTests: number;
  passRateLast7d: number;
  totalExecutions: number;
  activeExecutions: number;
}

type CacheEntry = {
  data: StatsData;
  expiresAt: number;
};

// Module-level cache with 60s TTL (exported for testing)
export const statsCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

const ZERO_STATS: StatsData = {
  totalReports: 0,
  totalTests: 0,
  passRateLast7d: 0,
  totalExecutions: 0,
  activeExecutions: 0,
};

async function fetchStatsFromDB(teamIds: string[]): Promise<StatsData> {
  const pool = getTimescalePool();

  if (teamIds.length === 0) return { ...ZERO_STATS };

  const [reportsResult, testsResult, passRateResult, executionsResult] = await Promise.all([
    pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM test_reports
       WHERE metadata->'userTeams' ?| $1`,
      [teamIds]
    ),
    pool.query<{ sum: string | null }>(
      `SELECT SUM(summary_tests) as sum FROM test_reports
       WHERE metadata->'userTeams' ?| $1`,
      [teamIds]
    ),
    pool.query<{ passed: string; total: string }>(
      `SELECT
        COALESCE(SUM(summary_passed), 0) as passed,
        COALESCE(SUM(summary_tests), 0) as total
      FROM test_reports
      WHERE timestamp >= NOW() - INTERVAL '7 days'
        AND metadata->'userTeams' ?| $1`,
      [teamIds]
    ),
    pool.query<{ total: string; active: string }>(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status IN ('queued', 'running')) as active
      FROM test_executions
      WHERE team_id = ANY($1::uuid[])`,
      [teamIds]
    ),
  ]);

  const totalReports = parseInt(reportsResult.rows[0]?.count ?? '0', 10) || 0;
  const totalTests = parseInt(testsResult.rows[0]?.sum ?? '0', 10) || 0;

  const passed = parseInt(passRateResult.rows[0]?.passed ?? '0', 10) || 0;
  const total = parseInt(passRateResult.rows[0]?.total ?? '0', 10) || 0;
  const passRateLast7d = total === 0 ? 0 : Math.round((passed / total) * 100);

  const totalExecutions = parseInt(executionsResult.rows[0]?.total ?? '0', 10) || 0;
  const activeExecutions = parseInt(executionsResult.rows[0]?.active ?? '0', 10) || 0;

  return {
    totalReports,
    totalTests,
    passRateLast7d,
    totalExecutions,
    activeExecutions,
  };
}

export default createBetterAuthApi({
  GET: async (req: BetterAuthenticatedRequest, res: NextApiResponse) => {
    const userTeams = await getUserTeams(req.user.id);
    const teamIds = userTeams.map(t => t.id).filter(Boolean);

    // Per-user cache key based on sorted team memberships
    const cacheKey = `stats:${[...teamIds].sort().join(',')}`;
    const now = Date.now();
    const cached = statsCache.get(cacheKey);

    if (cached && cached.expiresAt > now) {
      return res.json({ success: true, data: cached.data });
    }

    let data: StatsData;
    try {
      data = await fetchStatsFromDB(teamIds);
    } catch (err) {
      logger.error({ err }, 'Failed to fetch stats from DB, returning zeros');
      data = { ...ZERO_STATS };
    }

    statsCache.set(cacheKey, { data, expiresAt: now + CACHE_TTL_MS });

    return res.json({ success: true, data });
  },
});
