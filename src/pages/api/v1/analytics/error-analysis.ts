/**
 * GET /api/v1/analytics/error-analysis
 * Returns grouped error messages and affected tests.
 * Auth: any authenticated user
 */
import type { NextApiResponse } from 'next';
import { createBetterAuthApi, type BetterAuthenticatedRequest } from '@/auth/betterAuthApi';
import { getErrorAnalysis } from '@/lib/analytics';
import { getUserTeams } from '@/lib/teamManagement';

export default createBetterAuthApi({
  GET: async (req: BetterAuthenticatedRequest, res: NextApiResponse) => {
    const { days: daysStr, limit: limitStr } = req.query as Record<string, string>;
    const days = parseInt(daysStr ?? '30', 10);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      return res
        .status(400)
        .json({ success: false, error: 'days must be an integer between 1 and 365' });
    }
    const limit = Math.min(parseInt(limitStr ?? '20', 10) || 20, 100);

    try {
      const userTeams = await getUserTeams(req.user.id);
      const teamIds = userTeams.map(team => team.id).filter(Boolean);
      const data = await getErrorAnalysis({ days, limit, userId: req.user.id, teamIds });
      return res.json({ success: true, data });
    } catch {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
  },
});
