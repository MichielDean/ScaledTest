/**
 * POST /api/v1/executions/:id/results — worker result callback endpoint
 *
 * Workers (running in Kubernetes pods) call this endpoint to submit their CTRF
 * test results after completing a run.
 *
 * Authentication: worker bearer token (env var WORKER_TOKEN, provisioned from
 * K8s Secret `scaledtest-worker-token`). This is separate from the session-based
 * auth used by regular users — workers don't have user sessions.
 *
 * SCA-9 acceptance criteria:
 * - Verifies worker bearer token
 * - UUID validation on :id → 400 on invalid
 * - 404 if execution not found
 * - 409 if execution already completed or cancelled
 * - Stores CTRF report via storeCtrfReport, links execution_id
 * - Updates execution: completedPods++, marks completed when all pods report in
 * - Returns { success: true, reportId }
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { timingSafeEqual } from 'crypto';
import { getRequestLogger, logError } from '@/logging/logger';
import { storeCtrfReport, type TimescaleCtrfReport } from '@/lib/timescaledb';
import { getExecution, recordExecutionResult } from '@/lib/executions';
import { isValidUuid } from '@/lib/validation';
import { CtrfReportSchema } from '@/schemas/ctrf/ctrf-zod';

/** Execution statuses that no longer accept results from workers */
const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'failed']);

type SuccessResponse = { success: true; reportId: string };
type ErrorResponse = { success: false; error: string; details?: unknown };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuccessResponse | ErrorResponse>
): Promise<void> {
  const reqLogger = getRequestLogger(req);

  // Only POST is allowed
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} not allowed` });
  }

  // --- Worker token authentication ---
  // Token is read at request time (not module load) so tests can set process.env.WORKER_TOKEN
  const workerToken = process.env.WORKER_TOKEN;
  const authHeader = req.headers.authorization ?? '';
  const providedToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (
    !providedToken ||
    !workerToken ||
    providedToken.length !== workerToken.length ||
    !timingSafeEqual(Buffer.from(providedToken), Buffer.from(workerToken))
  ) {
    return res.status(401).json({ success: false, error: 'Invalid or missing worker token' });
  }

  // --- UUID validation on :id (shared validator, consistent with the rest of the codebase) ---
  const raw = req.query['id'];
  const id = Array.isArray(raw) ? raw[0] : raw;

  if (!id || !isValidUuid(id)) {
    return res
      .status(400)
      .json({ success: false, error: 'Invalid execution id: must be a valid UUID' });
  }

  try {
    // --- Fetch execution ---
    const execution = await getExecution(id);

    if (!execution) {
      return res.status(404).json({ success: false, error: 'Execution not found' });
    }

    // --- Guard: 409 if already in a terminal state ---
    if (TERMINAL_STATUSES.has(execution.status)) {
      return res.status(409).json({
        success: false,
        error: `Execution is already ${execution.status}`,
      });
    }

    // --- Validate CTRF payload ---
    const parsed = CtrfReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'CTRF report validation failed',
        details: parsed.error.flatten(),
      });
    }

    const ctrfReport = parsed.data;
    const reportId = ctrfReport.reportId ?? crypto.randomUUID();
    const now = new Date().toISOString();

    // --- Build a structurally-verified report for storage ---
    //
    // TimescaleCtrfReport extends CtrfSchema, which was auto-generated from a JSON Schema
    // and uses `const enum Status` / `ReportFormat`. The Zod-inferred type uses string
    // literals instead — the values are identical at runtime but TypeScript sees them as
    // incompatible types. We bridge with `unknown` here (same pattern used by test-reports.ts)
    // while still building the object with named fields so TypeScript can catch any structural
    // omissions.
    const reportPayload = {
      reportFormat: ctrfReport.reportFormat,
      specVersion: ctrfReport.specVersion,
      reportId,
      timestamp: ctrfReport.timestamp ?? now,
      generatedBy: ctrfReport.generatedBy,
      results: ctrfReport.results,
      extra: ctrfReport.extra,
      storedAt: now,
      executionId: id,
      metadata: {
        uploadedBy: 'worker' as const,
        userTeams: [] as string[],
        uploadedAt: now,
      },
    };
    // Bridge the const-enum incompatibility between the Zod schema and the generated CtrfSchema
    const reportToStore = reportPayload as unknown as TimescaleCtrfReport;

    // --- Store report, linking execution_id ---
    const storedReportId = await storeCtrfReport(reportToStore);

    // --- Atomically increment completedPods; mark completed when all pods have reported in ---
    await recordExecutionResult(id);

    reqLogger.info(
      { executionId: id, reportId: storedReportId },
      'Worker submitted execution results successfully'
    );

    return res.json({ success: true, reportId: storedReportId });
  } catch (error) {
    logError(reqLogger, 'Failed to record execution result', error, { executionId: id });
    return res.status(503).json({ success: false, error: 'Database unavailable' });
  }
}
