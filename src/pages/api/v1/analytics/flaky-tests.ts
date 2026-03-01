/**
 * GET /api/v1/analytics/flaky-tests
 * Returns tests that both pass and fail within the window (flaky detection).
 * Auth: any authenticated user
 */
import type { NextApiResponse } from 'next';
import { createBetterAuthApi, type BetterAuthenticatedRequest } from '@/auth/betterAuthApi';
import { getFlakyTests } from '@/lib/analytics';

export default createBetterAuthApi({
  GET: async (req: BetterAuthenticatedRequest, res: NextApiResponse) => {
    const { days: daysStr, minRuns: minRunsStr } = req.query as Record<string, string>;
    const days = parseInt(daysStr ?? '30', 10);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      return res
        .status(400)
        .json({ success: false, error: 'days must be an integer between 1 and 365' });
    }
    const minRuns = parseInt(minRunsStr ?? '3', 10) || 3;

    try {
      const data = await getFlakyTests({ days, minRuns });
      return res.json({ success: true, data });
    } catch {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
  },
});
