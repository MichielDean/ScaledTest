/**
 * GET /api/v1/stats
 * Returns dashboard summary stats with 60s in-memory cache.
 * Auth: any authenticated user
 * Response: { success: true, data: { totalReports, totalTests, passRateLast7d, totalExecutions, activeExecutions } }
 */
import type { NextApiResponse } from 'next';
import { createBetterAuthApi, type BetterAuthenticatedRequest } from '@/auth/betterAuthApi';
import { getTimescalePool } from '@/lib/timescaledb';
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
const CACHE_KEY = 'stats';

const ZERO_STATS: StatsData = {
  totalReports: 0,
  totalTests: 0,
  passRateLast7d: 0,
  totalExecutions: 0,
  activeExecutions: 0,
};

async function fetchStatsFromDB(): Promise<StatsData> {
  const pool = getTimescalePool();

  const [reportsResult, testsResult, passRateResult] = await Promise.all([
    pool.query<{ count: string }>(`SELECT COUNT(*) as count FROM test_reports`),
    pool.query<{ sum: string | null }>(`SELECT SUM(summary_tests) as sum FROM test_reports`),
    pool.query<{ passed: string; total: string }>(`
      SELECT
        COALESCE(SUM(summary_passed), 0) as passed,
        COALESCE(SUM(summary_tests), 0) as total
      FROM test_reports
      WHERE timestamp >= NOW() - INTERVAL '7 days'
    `),
  ]);

  const totalReports = parseInt(reportsResult.rows[0]?.count ?? '0', 10) || 0;
  const totalTests = parseInt(testsResult.rows[0]?.sum ?? '0', 10) || 0;

  const passed = parseInt(passRateResult.rows[0]?.passed ?? '0', 10) || 0;
  const total = parseInt(passRateResult.rows[0]?.total ?? '0', 10) || 0;
  const passRateLast7d = total === 0 ? 0 : Math.round((passed / total) * 100);

  return {
    totalReports,
    totalTests,
    passRateLast7d,
    totalExecutions: 0,
    activeExecutions: 0,
  };
}

export default createBetterAuthApi({
  GET: async (_req: BetterAuthenticatedRequest, res: NextApiResponse) => {
    const now = Date.now();
    const cached = statsCache.get(CACHE_KEY);

    if (cached && cached.expiresAt > now) {
      return res.json({ success: true, data: cached.data });
    }

    let data: StatsData;
    try {
      data = await fetchStatsFromDB();
    } catch (err) {
      logger.error({ err }, 'Failed to fetch stats from DB, returning zeros');
      data = { ...ZERO_STATS };
    }

    statsCache.set(CACHE_KEY, { data, expiresAt: now + CACHE_TTL_MS });

    return res.json({ success: true, data });
  },
});
