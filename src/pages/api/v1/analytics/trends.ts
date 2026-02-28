/**
 * GET /api/v1/analytics/trends
 * Returns pass rate trend data for the given time window.
 * Auth: any authenticated user
 */
import type { NextApiResponse } from 'next';
import { createBetterAuthApi, type BetterAuthenticatedRequest } from '@/auth/betterAuthApi';
import { getTestTrends } from '@/lib/analytics';

export default createBetterAuthApi({
  GET: async (req: BetterAuthenticatedRequest, res: NextApiResponse) => {
    const { days: daysStr, tool, environment } = req.query as Record<string, string>;
    const days = parseInt(daysStr ?? '30', 10);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      return res
        .status(400)
        .json({ success: false, error: 'days must be an integer between 1 and 365' });
    }

    try {
      const data = await getTestTrends({ days, tool, environment });
      return res.json({ success: true, data });
    } catch {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
  },
});
