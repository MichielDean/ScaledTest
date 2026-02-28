/**
 * GET /api/v1/analytics/duration-distribution
 * Returns test duration bucketed histogram.
 * Auth: any authenticated user
 */
import type { NextApiResponse } from 'next';
import { createBetterAuthApi, type BetterAuthenticatedRequest } from '@/auth/betterAuthApi';
import { getDurationDistribution } from '@/lib/analytics';

export default createBetterAuthApi({
  GET: async (req: BetterAuthenticatedRequest, res: NextApiResponse) => {
    const { days: daysStr, tool } = req.query as Record<string, string>;
    const days = parseInt(daysStr ?? '30', 10) || 30;

    try {
      const data = await getDurationDistribution({ days, tool });
      return res.json({ success: true, data });
    } catch {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
  },
});
