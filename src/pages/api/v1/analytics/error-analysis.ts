/**
 * GET /api/v1/analytics/error-analysis
 * Returns grouped error messages and affected tests.
 * Auth: any authenticated user
 */
import type { NextApiResponse } from 'next';
import { createBetterAuthApi, type BetterAuthenticatedRequest } from '@/auth/betterAuthApi';
import { getErrorAnalysis } from '@/lib/analytics';

export default createBetterAuthApi({
  GET: async (req: BetterAuthenticatedRequest, res: NextApiResponse) => {
    const { days: daysStr, limit: limitStr } = req.query as Record<string, string>;
    const days = parseInt(daysStr ?? '30', 10) || 30;
    const limit = Math.min(parseInt(limitStr ?? '20', 10) || 20, 100);

    try {
      const data = await getErrorAnalysis({ days, limit });
      return res.json({ success: true, data });
    } catch {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
  },
});
