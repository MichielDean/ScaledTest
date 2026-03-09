/**
 * GET /api/v1/admin/audit-log
 *
 * Returns paginated audit log entries.  Restricted to users with the "owner" role.
 *
 * Query parameters (all optional):
 *   actorId      — filter by the acting user's id
 *   actionPrefix — filter by action category prefix (e.g. "execution", "admin")
 *   resourceType — filter by resource type (e.g. "execution", "report")
 *   teamId       — filter by team UUID
 *   dateFrom     — ISO8601 lower bound (inclusive)
 *   dateTo       — ISO8601 upper bound (inclusive)
 *   page         — 1-indexed page number (default 1)
 *   size         — rows per page (default 50, max 200)
 */
import type { NextApiResponse } from 'next';
import { createBetterAuthApi, type BetterAuthenticatedRequest } from '@/auth/betterAuthApi';
import { listAuditLog } from '@/lib/auditLog';
import { validateUuid } from '@/lib/validation';

/**
 * Next.js req.query values are `string | string[] | undefined`.
 * When the same param appears more than once (?x=a&x=b) Next.js yields string[].
 * Always take the first value so downstream code can safely assume string | undefined.
 */
function getFirstQueryValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default createBetterAuthApi(
  {
    GET: async (req: BetterAuthenticatedRequest, res: NextApiResponse) => {
      const actorId = getFirstQueryValue(req.query.actorId);
      const actionPrefix = getFirstQueryValue(req.query.actionPrefix);
      const resourceType = getFirstQueryValue(req.query.resourceType);
      const teamId = getFirstQueryValue(req.query.teamId);
      const dateFrom = getFirstQueryValue(req.query.dateFrom);
      const dateTo = getFirstQueryValue(req.query.dateTo);
      const pageStr = getFirstQueryValue(req.query.page);
      const sizeStr = getFirstQueryValue(req.query.size);

      // Validate teamId if provided
      if (teamId) {
        try {
          validateUuid(teamId, 'teamId');
        } catch {
          return res.status(400).json({ success: false, error: 'Invalid teamId — must be a UUID' });
        }
      }

      // Validate actorId is not excessively long (not a UUID — actor IDs are auth-provider strings)
      if (actorId && actorId.length > 255) {
        return res.status(400).json({ success: false, error: 'actorId too long' });
      }

      // Validate date parameters — invalid strings would cause PostgreSQL to throw a timestamptz
      // cast error and bubble up as an unhandled 500. Reject early with a clear 400 instead.
      if (dateFrom && isNaN(Date.parse(dateFrom))) {
        return res.status(400).json({ success: false, error: 'Invalid dateFrom: expected ISO8601 date string' });
      }
      if (dateTo && isNaN(Date.parse(dateTo))) {
        return res.status(400).json({ success: false, error: 'Invalid dateTo: expected ISO8601 date string' });
      }

      const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);
      const size = Math.min(Math.max(1, parseInt(sizeStr ?? '50', 10) || 50), 200);

      try {
        const result = await listAuditLog({
          actorId: actorId || undefined,
          actionPrefix: actionPrefix || undefined,
          resourceType: resourceType || undefined,
          teamId: teamId || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          page,
          size,
        });

        return res.status(200).json({ success: true, data: result });
      } catch {
        return res.status(503).json({ success: false, error: 'Database unavailable' });
      }
    },
  },
  'owner'
);
