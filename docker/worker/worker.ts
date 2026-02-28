/* eslint-disable no-console */
import { execSync } from 'child_process';
import axios from 'axios';

const API_URL = process.env.SCALEDTEST_API_URL ?? 'http://scaledtest-service/api/v1';
const API_TOKEN = process.env.SCALEDTEST_API_TOKEN ?? '';
const TEST_COMMAND = process.env.TEST_COMMAND ?? '';
const EXECUTION_ID = process.env.EXECUTION_ID ?? '';

// Configurable timeout — defaults to 1 hour. Set WORKER_TIMEOUT_MS env var to override.
// Without a timeout, a runaway test process hangs the pod forever consuming K8s resources.
const WORKER_TIMEOUT_MS = parseInt(process.env.WORKER_TIMEOUT_MS ?? '3600000', 10);
const WORKER_MAX_BUFFER_BYTES = 50 * 1024 * 1024; // 50MB — hard cap on stdout/stderr capture

if (!TEST_COMMAND) {
  console.error('TEST_COMMAND env var is required');
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
}

const stop = Date.now();

// Build a minimal CTRF report from the exit code
const report = {
  reportFormat: 'CTRF',
  specVersion: '1.0.0',
  reportId: crypto.randomUUID(),
  timestamp: new Date().toISOString(),
  generatedBy: 'scaledtest-worker',
  results: {
    tool: { name: 'scaledtest-worker' },
    summary: {
      tests: 1,
      passed: exitCode === 0 ? 1 : 0,
      failed: exitCode !== 0 ? 1 : 0,
      skipped: 0,
      pending: 0,
      other: 0,
      start,
      stop,
    },
    tests: [
      {
        name: TEST_COMMAND,
        status: exitCode === 0 ? 'passed' : 'failed',
        duration: stop - start,
        message: stderr || undefined,
        stdout: stdout ? [stdout] : undefined,
      },
    ],
  },
};

// POST to ScaledTest API
try {
  await axios.post(`${API_URL}/reports`, report, {
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    params: EXECUTION_ID ? { executionId: EXECUTION_ID } : undefined,
  });
  console.log('Test results submitted successfully');
} catch (err) {
  console.error('Failed to submit results:', err);
  // Don't fail the pod — results are best-effort
}

process.exit(exitCode);
