/**
 * GET /api/v1/executions/active
 * Returns the count of active (queued or running) test executions.
 *
 * Query params:
 *   teamId?: string (UUID) — filter to a specific team; omit for all teams
 *
 * Auth: any authenticated user
 * Response: { success: true, data: { activeExecutions: number } }
 */
import type { NextApiResponse } from 'next';
import { createBetterAuthApi, type BetterAuthenticatedRequest } from '@/auth/betterAuthApi';
import { getTimescalePool } from '@/lib/timescaledb';
import { apiLogger as logger } from '@/logging/logger';

/** RFC 4122 UUID v1–v5 format check */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function fetchActiveExecutionCount(teamId?: string): Promise<number> {
  const pool = getTimescalePool();

  if (teamId !== undefined) {
    // Parameterized query — team_id filter applied via $1 to prevent injection
    const result = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count
         FROM test_executions
        WHERE status IN ('queued', 'running')
          AND team_id = $1`,
      [teamId]
    );
    return parseInt(result.rows[0]?.count ?? '0', 10) || 0;
  }

  // No team filter — count active executions across all teams
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count
       FROM test_executions
      WHERE status IN ('queued', 'running')`
  );
  return parseInt(result.rows[0]?.count ?? '0', 10) || 0;
}

export default createBetterAuthApi({
  GET: async (req: BetterAuthenticatedRequest, res: NextApiResponse) => {
    // req.query values in Next.js are typed as string | string[] | undefined.
    // Unwrap array case (e.g. ?teamId=a&teamId=b) by taking the first element.
    const raw = req.query['teamId'];
    const teamId = Array.isArray(raw) ? raw[0] : raw;

    // Validate UUID format when teamId is provided
    if (teamId !== undefined) {
      if (!UUID_REGEX.test(teamId)) {
        return res
          .status(400)
          .json({ success: false, error: 'Invalid teamId: must be a valid UUID' });
      }
    }

    try {
      const activeExecutions = await fetchActiveExecutionCount(teamId);
      return res.json({ success: true, data: { activeExecutions } });
    } catch (err) {
      logger.error({ err }, 'Failed to fetch active execution count from DB');
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
  },
});
