/**
 * CTRF (Common Test Report Format) Helper
 * Converts legacy test result format to CTRF standard
 * See: https://ctrf.io
 */

export interface LegacyTestResult {
  branch?: string;
  commit_sha?: string;
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  skipped_tests: number;
  pending_tests: number;
  duration_ms: number;
  environment?: Record<string, unknown>;
  test_cases: Array<{
    name: string;
    suite: string;
    status: "passed" | "failed" | "skipped" | "pending";
    duration_ms: number;
    error_message?: string;
    stack_trace?: string;
  }>;
}

export interface CtrfReport {
  reportFormat: "CTRF";
  specVersion: string;
  generatedBy?: string;
  timestamp?: string;
  results: {
    tool: {
      name: string;
      version?: string;
    };
    summary: {
      tests: number;
      passed: number;
      failed: number;
      skipped: number;
      pending?: number;
      start?: number;
      stop?: number;
    };
    tests: Array<{
      name: string;
      status: "passed" | "failed" | "skipped" | "pending";
      duration: number;
      suite?: string;
      message?: string;
      trace?: string;
    }>;
    environment?: Record<string, unknown>;
  };
}

/**
 * Convert legacy test result format to CTRF format
 */
export function legacyToCTRF(legacy: LegacyTestResult): CtrfReport {
  const now = Date.now();
  const startTime = now - legacy.duration_ms;

  const environment: Record<string, unknown> = {
    ...(legacy.environment || {}),
  };

  if (legacy.branch) {
    environment.branchName = legacy.branch;
  }
  if (legacy.commit_sha) {
    environment.commit = legacy.commit_sha;
  }

  return {
    reportFormat: "CTRF",
    specVersion: "0.0.0",
    generatedBy: "ScaledTest E2E Tests",
    timestamp: new Date().toISOString(),
    results: {
      tool: {
        name: "playwright",
        version: "1.49.0",
      },
      summary: {
        tests: legacy.total_tests,
        passed: legacy.passed_tests,
        failed: legacy.failed_tests,
        skipped: legacy.skipped_tests,
        pending: legacy.pending_tests,
        start: startTime,
        stop: now,
      },
      tests: legacy.test_cases.map((testCase) => ({
        name: testCase.name,
        status: testCase.status,
        duration: testCase.duration_ms,
        suite: testCase.suite,
        message: testCase.error_message,
        trace: testCase.stack_trace,
      })),
      environment,
    },
  };
}
