import { execSync } from 'child_process';
import axios from 'axios';
import { parseReport, buildExitCodeReport, REPORT_FORMAT } from './parsers/index.js';
import { buildSubmissionUrl } from './submission.js';

const API_URL = process.env.SCALEDTEST_API_URL ?? 'http://scaledtest-service/api/v1';
const API_TOKEN = process.env.SCALEDTEST_API_TOKEN ?? '';
const TEST_COMMAND = process.env.TEST_COMMAND ?? '';
const EXECUTION_ID = process.env.EXECUTION_ID ?? '';

// REPORT_FORMAT env var controls how stdout is parsed.
// Supported values: jest-json | junit-xml | ctrf-json | exit-code (default)
const REPORT_FORMAT_ENV = process.env.REPORT_FORMAT ?? REPORT_FORMAT.EXIT_CODE;

// Configurable timeout — defaults to 1 hour. Set WORKER_TIMEOUT_MS env var to override.
// Without a timeout, a runaway test process hangs the pod forever consuming K8s resources.
const WORKER_TIMEOUT_MS = parseInt(process.env.WORKER_TIMEOUT_MS ?? '3600000', 10);
const WORKER_MAX_BUFFER_BYTES = 50 * 1024 * 1024; // 50MB — hard cap on stdout/stderr capture

if (!TEST_COMMAND) {
  process.stderr.write('TEST_COMMAND env var is required\n');
  process.exit(1);
}

const start = Date.now();
let exitCode = 0;
let stdout = '';
let stderr = '';

try {
  stdout = execSync(TEST_COMMAND, {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: WORKER_TIMEOUT_MS,
    maxBuffer: WORKER_MAX_BUFFER_BYTES,
  });
} catch (err: unknown) {
  const childErr = err as {
    status?: number;
    stdout?: string | Buffer;
    stderr?: string | Buffer;
  };
  exitCode = childErr.status ?? 1;
  if (typeof childErr.stderr !== 'undefined') {
    stderr = Buffer.isBuffer(childErr.stderr) ? childErr.stderr.toString('utf8') : childErr.stderr;
  } else {
    stderr = String(err);
  }
  // For jest-json and ctrf-json, stdout may still be populated even on failure
  if (typeof childErr.stdout !== 'undefined') {
    stdout = Buffer.isBuffer(childErr.stdout) ? childErr.stdout.toString('utf8') : childErr.stdout;
  }
}

const stop = Date.now();

// Parse the test runner output according to the configured format.
// If the test runner crashed before writing output (OOM kill, SIGKILL, truncated stdout),
// parseReport may throw for jest-json, junit-xml, and ctrf-json. Fall back to the
// exit-code report so the worker always submits something and always exits correctly.
let report;
try {
  report = parseReport(REPORT_FORMAT_ENV, stdout, TEST_COMMAND, exitCode, stderr, start, stop);
} catch (parseErr) {
  process.stderr.write(
    `Failed to parse test output (format: ${REPORT_FORMAT_ENV}): ${String(parseErr)}\n`
  );
  report = buildExitCodeReport(TEST_COMMAND, exitCode, stderr, start, stop, stdout || undefined);
}

// POST to ScaledTest API — best-effort, don't fail the pod on submission error
//
// When EXECUTION_ID is set, post to the execution-scoped callback endpoint:
//   POST /api/v1/executions/:id/results
// This endpoint accepts the worker bearer token, links the report to the
// execution, and increments completedPods so the orchestrator knows when
// all pods have reported in.
//
// Without EXECUTION_ID, fall back to the legacy /api/v1/reports endpoint.
try {
  const submissionUrl = buildSubmissionUrl(API_URL, EXECUTION_ID);
  await axios.post(submissionUrl, report, {
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
  process.stdout.write('Test results submitted successfully\n');
} catch (err) {
  process.stderr.write(`Failed to submit results: ${String(err)}\n`);
}

process.exit(exitCode);
