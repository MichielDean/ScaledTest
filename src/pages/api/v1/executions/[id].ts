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
import { getExecutionDetail, getExecution, cancelExecution } from '@/lib/executions';
import { deleteKubernetesJob } from '@/lib/kubernetes';
import { getUserTeams } from '@/lib/teamManagement';
import { isValidUuid } from '@/lib/validation';
import { apiLogger as logger, logError } from '@/logging/logger';

/**
 * Verify the authenticated user has access to the given execution.
 * Access is granted if:
 *   - The execution has no teamId (legacy/unscoped execution), OR
 *   - The user is the one who requested the execution, OR
 *   - The user belongs to the execution's team
 */
async function userCanAccessExecution(
  userId: string,
  execution: { teamId: string | null; requestedBy: string | null }
): Promise<boolean> {
  if (!execution.teamId) return true;
  if (execution.requestedBy === userId) return true;
  const teams = await getUserTeams(userId);
  return teams.some(t => t.id === execution.teamId);
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

      // Team-scoped access: verify user belongs to the execution's team
      if (!(await userCanAccessExecution(req.user.id, detail))) {
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
      // Pre-fetch to verify team-scoped access before cancellation
      const existing = await getExecution(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Execution not found' });
      }
      if (!(await userCanAccessExecution(req.user.id, existing))) {
        return res.status(404).json({ success: false, error: 'Execution not found' });
      }

      const execution = await cancelExecution(id);
      if (execution === null) {
        return res.status(404).json({ success: false, error: 'Execution not found' });
      }

      // Best-effort: delete the Kubernetes Job if one was assigned.
      // DB is already updated to 'cancelled' before we reach here — even if K8s
      // delete fails, the execution is cancelled from the system's perspective.
      // TTL (ttlSecondsAfterFinished) will reap the Job once it finishes, but
      // an explicit delete here avoids leaving running Jobs for cancelled executions.
      if (execution.kubernetesJobName) {
        try {
          await deleteKubernetesJob(execution.kubernetesJobName);
        } catch (k8sError) {
          logError(
            logger,
            'Failed to delete Kubernetes Job during cancellation (best-effort)',
            k8sError,
            { id, kubernetesJobName: execution.kubernetesJobName }
          );
        }
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
