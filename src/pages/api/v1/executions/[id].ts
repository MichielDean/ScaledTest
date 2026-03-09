/**
 * GET /api/v1/executions/:id — get execution detail with pod progress (auth required)
 * DELETE /api/v1/executions/:id — cancel execution (owner required)
 *
 * GET response includes:
 *   - Full TestExecution fields
 *   - activePods: derived from totalPods - completedPods - failedPods
 *   - linkedReportIds: IDs of CTRF reports submitted by pods for this execution
 *
 * SCA-10: UUID validation on :id → 400 on invalid format
 */
import type { NextApiResponse } from 'next';
import { createBetterAuthApi, type BetterAuthenticatedRequest } from '@/auth/betterAuthApi';
import { hasRole } from '@/lib/roles';
import { getExecutionDetail, cancelExecution } from '@/lib/executions';
import { isValidUuid } from '@/lib/validation';
import { appendAuditLog, AuditAction } from '@/lib/auditLog';

/**
 * Normalize x-forwarded-for: it can be a string (possibly comma-separated for proxy chains)
 * or a string array (when Node/Next.js dedups repeated headers). Always return a single IP.
 */
function normalizeIp(header: string | string[] | undefined, fallback: string | undefined): string | null {
  if (!header) return fallback ?? null;
  const raw = Array.isArray(header) ? header[0] : header;
  // Take the first IP in a comma-separated proxy chain (leftmost = original client)
  return raw.split(',')[0].trim() || fallback || null;
}

export default createBetterAuthApi({
  GET: async (req: BetterAuthenticatedRequest, res: NextApiResponse) => {
    const raw = req.query['id'];
    const id = Array.isArray(raw) ? raw[0] : raw;

    // UUID validation — 400 on invalid format (SCA-10 acceptance criterion)
    if (!id || !isValidUuid(id)) {
      return res
        .status(400)
        .json({ success: false, error: 'Invalid execution id: must be a valid UUID' });
    }

    try {
      const detail = await getExecutionDetail(id);
      if (!detail) {
        return res.status(404).json({ success: false, error: 'Execution not found' });
      }
      return res.json({ success: true, data: detail });
    } catch {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
  },

  DELETE: async (req: BetterAuthenticatedRequest, res: NextApiResponse) => {
    if (!hasRole(req.user, 'owner')) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }

    const raw = req.query['id'];
    const id = Array.isArray(raw) ? raw[0] : raw;

    // UUID validation — 400 on invalid format
    if (!id || !isValidUuid(id)) {
      return res
        .status(400)
        .json({ success: false, error: 'Invalid execution id: must be a valid UUID' });
    }

    try {
      const result = await cancelExecution(id);
      if (result === null) {
        return res.status(404).json({ success: false, error: 'Execution not found' });
      }

      const { execution, previousStatus } = result;

      // Append-only audit log — fire-and-forget; never blocks the response.
      void appendAuditLog({
        actorId: req.user?.id ?? null,
        actorEmail: req.user?.email ?? null,
        action: AuditAction.EXECUTION_CANCELLED,
        resourceType: 'execution',
        resourceId: id,
        teamId: execution.teamId,
        // previousStatus is the status BEFORE cancellation (queued/running) — not 'cancelled'
        metadata: { previousStatus },
        ipAddress: normalizeIp(req.headers['x-forwarded-for'], req.socket?.remoteAddress),
      });

      return res.json({ success: true, data: execution });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Cannot cancel execution in status:')) {
        return res.status(409).json({ success: false, error: err.message });
      }
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
  },
});
