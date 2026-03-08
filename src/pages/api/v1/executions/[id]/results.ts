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
import { z } from 'zod';
import { getRequestLogger, logError } from '@/logging/logger';
import { storeCtrfReport, type TimescaleCtrfReport } from '@/lib/timescaledb';
import { getExecution, recordExecutionResult } from '@/lib/executions';

/** RFC 4122 UUID v1–v5 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Execution statuses that accept results from workers */
const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'failed']);

/** CTRF report validation schema (same shape as used in test-reports.ts) */
const CtrfReportSchema = z.object({
  reportFormat: z.literal('CTRF'),
  specVersion: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/),
  reportId: z.string().uuid().optional(),
  timestamp: z.string().datetime().optional(),
  generatedBy: z.string().optional(),
  results: z.object({
    tool: z.object({
      name: z.string(),
      version: z.string().optional(),
      url: z.string().optional(),
      extra: z.record(z.string(), z.unknown()).optional(),
    }),
    summary: z.object({
      tests: z.number().int().min(0),
      passed: z.number().int().min(0),
      failed: z.number().int().min(0),
      skipped: z.number().int().min(0),
      pending: z.number().int().min(0),
      other: z.number().int().min(0),
      suites: z.number().int().min(0).optional(),
      start: z.number().int(),
      stop: z.number().int(),
      extra: z.record(z.string(), z.unknown()).optional(),
    }),
    tests: z.array(
      z.object({
        name: z.string(),
        status: z.enum(['passed', 'failed', 'skipped', 'pending', 'other']),
        duration: z.number().int().min(0),
        start: z.number().int().optional(),
        stop: z.number().int().optional(),
        suite: z.string().optional(),
        message: z.string().optional(),
        trace: z.string().optional(),
        ai: z.string().optional(),
        line: z.number().int().optional(),
        rawStatus: z.string().optional(),
        tags: z.array(z.string()).optional(),
        type: z.string().optional(),
        filePath: z.string().optional(),
        retries: z.number().int().min(0).optional(),
        flaky: z.boolean().optional(),
        stdout: z.array(z.string()).optional(),
        stderr: z.array(z.string()).optional(),
        threadId: z.string().optional(),
        browser: z.string().optional(),
        device: z.string().optional(),
        screenshot: z.string().optional(),
        attachments: z
          .array(
            z.object({
              name: z.string(),
              contentType: z.string(),
              path: z.string(),
              extra: z.record(z.string(), z.unknown()).optional(),
            })
          )
          .optional(),
        parameters: z.record(z.string(), z.unknown()).optional(),
        steps: z
          .array(
            z.object({
              name: z.string(),
              status: z.enum(['passed', 'failed', 'skipped', 'pending', 'other']),
              extra: z.record(z.string(), z.unknown()).optional(),
            })
          )
          .optional(),
        extra: z.record(z.string(), z.unknown()).optional(),
      })
    ),
    environment: z
      .object({
        reportName: z.string().optional(),
        appName: z.string().optional(),
        appVersion: z.string().optional(),
        buildName: z.string().optional(),
        buildNumber: z.string().optional(),
        buildUrl: z.string().optional(),
        repositoryName: z.string().optional(),
        repositoryUrl: z.string().optional(),
        commit: z.string().optional(),
        branchName: z.string().optional(),
        osPlatform: z.string().optional(),
        osRelease: z.string().optional(),
        osVersion: z.string().optional(),
        testEnvironment: z.string().optional(),
        extra: z.record(z.string(), z.unknown()).optional(),
      })
      .optional(),
    extra: z.record(z.string(), z.unknown()).optional(),
  }),
  extra: z.record(z.string(), z.unknown()).optional(),
});

type SuccessResponse = { success: true; reportId: string };
type ErrorResponse = { success: false; error: string; details?: unknown };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuccessResponse | ErrorResponse>
): Promise<void> {
  const reqLogger = getRequestLogger(req);

  // Only POST is allowed
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: `Method ${req.method} not allowed` });
  }

  // --- Worker token authentication ---
  // Token is read at request time (not module load) so tests can set process.env.WORKER_TOKEN
  const workerToken = process.env.WORKER_TOKEN;
  const authHeader = req.headers.authorization ?? '';
  const providedToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!providedToken || !workerToken || providedToken !== workerToken) {
    return res.status(401).json({ success: false, error: 'Invalid or missing worker token' });
  }

  // --- UUID validation on :id ---
  const raw = req.query['id'];
  const id = Array.isArray(raw) ? raw[0] : raw;

  if (!id || !UUID_REGEX.test(id)) {
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

    // --- Store report, linking execution_id ---
    const storedReportId = await storeCtrfReport({
      ...ctrfReport,
      reportId,
      timestamp: ctrfReport.timestamp ?? now,
      storedAt: now,
      executionId: id,
      metadata: {
        uploadedBy: 'worker',
        userTeams: [],
        uploadedAt: now,
      },
    } as TimescaleCtrfReport);

    // --- Increment completedPods, mark completed if all pods done ---
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
