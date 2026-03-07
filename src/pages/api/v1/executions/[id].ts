/**
 * GET /api/v1/executions/:id — get execution detail (auth required)
 * DELETE /api/v1/executions/:id — cancel execution (owner required)
 */
import type { NextApiResponse } from 'next';
import { createBetterAuthApi, type BetterAuthenticatedRequest } from '@/auth/betterAuthApi';
import { hasRole } from '@/lib/roles';
import { getExecution, cancelExecution } from '@/lib/executions';

export default createBetterAuthApi({
  GET: async (req: BetterAuthenticatedRequest, res: NextApiResponse) => {
    const { id } = req.query as { id: string };

    try {
      const execution = await getExecution(id);
      if (!execution) {
        return res.status(404).json({ success: false, error: 'Execution not found' });
      }
      return res.json({ success: true, data: execution });
    } catch {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
  },

  DELETE: async (req: BetterAuthenticatedRequest, res: NextApiResponse) => {
    if (!hasRole(req.user, 'owner')) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }

    const { id } = req.query as { id: string };

    try {
      const execution = await cancelExecution(id);
      if (execution === null) {
        return res.status(404).json({ success: false, error: 'Execution not found' });
      }
      return res.json({ success: true, data: execution });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Cannot cancel execution in status:')) {
        return res.status(409).json({ success: false, error: err.message });
      }
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
  },
});
