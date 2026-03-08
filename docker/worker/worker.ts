import { execSync } from 'child_process';
import axios from 'axios';
import { parseReport, REPORT_FORMAT } from './parsers/index.js';

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
  exitCode = (err as { status?: number }).status ?? 1;
  stderr = (err as { stderr?: string }).stderr ?? String(err);
  // For jest-json and ctrf-json, stdout may still be populated even on failure
  stdout = (err as { stdout?: string }).stdout ?? stdout;
}

const stop = Date.now();

// Parse the test runner output according to the configured format
const report = parseReport(REPORT_FORMAT_ENV, stdout, TEST_COMMAND, exitCode, stderr, start, stop);

// POST to ScaledTest API — best-effort, don't fail the pod on submission error
try {
  await axios.post(`${API_URL}/reports`, report, {
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    params: EXECUTION_ID ? { executionId: EXECUTION_ID } : undefined,
  });
  process.stdout.write('Test results submitted successfully\n');
} catch (err) {
  process.stderr.write(`Failed to submit results: ${String(err)}\n`);
}

process.exit(exitCode);
