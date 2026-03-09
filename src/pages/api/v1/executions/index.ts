/**
 * GET /api/v1/executions — list with filters (auth required)
 * POST /api/v1/executions — create new execution (maintainer+ required)
 */
import type { NextApiResponse } from 'next';
import { z } from 'zod';
import { createBetterAuthApi, type BetterAuthenticatedRequest } from '@/auth/betterAuthApi';
import { hasRole } from '@/lib/roles';
import { createExecution, listExecutions, type ExecutionStatus } from '@/lib/executions';
import { appendAuditLog, AuditAction } from '@/lib/auditLog';

/**
 * Normalize x-forwarded-for: it can be a string (possibly comma-separated for proxy chains)
 * or a string array (when Node/Next.js dedups repeated headers). Always return a single IP.
 */
function normalizeIp(header: string | string[] | undefined, fallback: string | undefined): string | null {
  if (!header) return fallback ?? null;
  const raw = Array.isArray(header) ? header[0] : header;
  return raw.split(',')[0].trim() || fallback || null;
}

// Regex: docker image names — no shell injection
const DOCKER_IMAGE_RE = /^[a-zA-Z0-9][a-zA-Z0-9._\-/:@]*$/;

const CreateExecutionSchema = z.object({
  dockerImage: z
    .string()
    .min(1)
    .refine(v => DOCKER_IMAGE_RE.test(v), {
      message: 'Invalid docker image name — possible shell injection characters detected',
    }),
  testCommand: z.string().min(1).max(1000),
  parallelism: z.number().int().min(1).max(50).optional().default(1),
  environmentVars: z.record(z.string(), z.string()).optional().default({}),
  resourceLimits: z
    .object({ cpu: z.string().optional(), memory: z.string().optional() })
    .optional()
    .default({}),
  teamId: z.string().uuid().optional(),
});

export default createBetterAuthApi({
  GET: async (req: BetterAuthenticatedRequest, res: NextApiResponse) => {
    const {
      page: pageStr,
      size: sizeStr,
      status,
      teamId,
      requestedBy,
      dateFrom,
      dateTo,
    } = req.query as Record<string, string>;

    const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);
    const size = Math.min(Math.max(1, parseInt(sizeStr ?? '20', 10) || 20), 100);

    try {
      const { executions, total } = await listExecutions({
        page,
        size,
        status: status as ExecutionStatus | undefined,
        teamId,
        requestedBy,
        dateFrom,
        dateTo,
      });

      return res.json({
        success: true,
        data: executions,
        total,
        pagination: { page, size, total },
      });
    } catch {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
  },

  POST: async (req: BetterAuthenticatedRequest, res: NextApiResponse) => {
    // Require maintainer or higher
    if (!hasRole(req.user, 'maintainer')) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }

    // Guard: BetterAuth should always populate req.user.id, but be explicit
    if (!req.user?.id) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const parsed = CreateExecutionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: parsed.error.flatten(),
      });
    }

    const { dockerImage, testCommand, parallelism, environmentVars, resourceLimits, teamId } =
      parsed.data;

    try {
      const execution = await createExecution({
        dockerImage,
        testCommand,
        parallelism,
        environmentVars,
        resourceLimits,
        requestedBy: req.user.id,
        teamId,
      });

      // Append-only audit log — fire-and-forget; never blocks the response.
      void appendAuditLog({
        actorId: req.user.id,
        actorEmail: req.user.email,
        action: AuditAction.EXECUTION_CREATED,
        resourceType: 'execution',
        resourceId: execution.id,
        teamId: teamId ?? null,
        metadata: { dockerImage, parallelism },
        ipAddress: normalizeIp(req.headers['x-forwarded-for'], req.socket?.remoteAddress),
      });

      return res.status(201).json({ success: true, data: execution });
    } catch {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
  },
});
