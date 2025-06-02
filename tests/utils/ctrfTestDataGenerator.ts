import { v4 as uuidv4 } from 'uuid';
import { CtrfSchema, Status, ReportFormat } from '../../src/schemas/ctrf/ctrf';

/**
 * Generates a valid CTRF report object for testing
 * @param overrides - Partial CtrfSchema object to override default values
 * @param fixedTimestamp - Optional fixed Date to use for timestamps
 * @returns A complete CTRF report object
 */
export const generateCtrfReport = (
  overrides: Partial<CtrfSchema> = {},
  fixedTimestamp?: Date
): CtrfSchema => {
  const now = fixedTimestamp || new Date();
  const startTime = now.getTime() - 5000; // 5 seconds ago
  const stopTime = now.getTime();

  const defaultTests = [
    {
      name: 'User authentication with valid credentials',
      status: Status.passed,
      duration: 1250,
      start: startTime,
      stop: startTime + 1250,
      suite: 'Authentication',
      tags: ['smoke', 'critical'],
      filePath: 'tests/auth/login.test.ts',
    },
    {
      name: 'User authentication with invalid password',
      status: Status.failed,
      duration: 890,
      start: startTime + 1300,
      stop: startTime + 2190,
      suite: 'Authentication',
      message: 'Login failed: Invalid password',
      trace:
        'AssertionError: Expected login to succeed but got error\n    at Object.test (login.test.ts:15:5)',
      tags: ['regression'],
      filePath: 'tests/auth/login.test.ts',
      retries: 2,
      flaky: false,
    },
    {
      name: 'Password reset flow',
      status: Status.skipped,
      duration: 0,
      start: startTime + 2200,
      stop: startTime + 2200,
      suite: 'Authentication',
      message: 'Skipped due to email service downtime',
      tags: ['integration'],
      filePath: 'tests/auth/password-reset.test.ts',
    },
  ];

  const summary = {
    tests: defaultTests.length,
    passed: defaultTests.filter(t => t.status === Status.passed).length,
    failed: defaultTests.filter(t => t.status === Status.failed).length,
    skipped: defaultTests.filter(t => t.status === Status.skipped).length,
    pending: 0, // Explicitly set to 0 as defaultTests does not include pending
    other: 0, // Explicitly set to 0 as defaultTests does not include other
    start: startTime,
    stop: stopTime,
  };

  const defaultReport: CtrfSchema = {
    reportFormat: ReportFormat.CTRF,
    specVersion: '1.0.0',
    reportId: uuidv4(),
    timestamp: now.toISOString(),
    generatedBy: 'Jest Test Suite',
    results: {
      tool: {
        name: 'Jest',
        version: '29.7.0',
        extra: {
          runner: 'default',
          config: 'jest.config.js',
        },
      },
      summary,
      tests: defaultTests,
      environment: {
        appName: 'ScaledTest',
        appVersion: '1.0.0',
        testEnvironment: 'CI',
        branchName: 'main',
        buildNumber: 'test-build-123',
        osPlatform: 'linux',
        osRelease: '20.04',
        repositoryName: 'ScaledTest',
        commit: 'abc123def456',
      },
    },
    extra: {
      ciProvider: 'GitHub Actions',
      pullRequest: '123',
    },
  };

  return {
    ...defaultReport,
    ...overrides,
    results: {
      ...defaultReport.results,
      ...overrides.results,
    },
  };
};

/**
 * Generates a minimal valid CTRF report for testing edge cases
 */
export const generateMinimalCtrfReport = (): CtrfSchema => {
  const now = new Date();
  const startTime = now.getTime() - 1000;
  const stopTime = now.getTime();

  return {
    reportFormat: ReportFormat.CTRF,
    specVersion: '1.0.0',
    results: {
      tool: {
        name: 'TestTool',
      },
      summary: {
        tests: 1,
        passed: 1,
        failed: 0,
        skipped: 0,
        pending: 0,
        other: 0,
        start: startTime,
        stop: stopTime,
      },
      tests: [
        {
          name: 'Simple test',
          status: Status.passed,
          duration: 1000,
        },
      ],
    },
  };
};

/**
 * Generates an invalid CTRF report for testing validation
 */
export const generateInvalidCtrfReport = () => {
  return {
    reportFormat: 'INVALID',
    specVersion: 'not-a-version',
    results: {
      tool: {},
      summary: {
        tests: -1,
        passed: 'not-a-number',
      },
      tests: 'not-an-array',
    },
  };
};

/**
 * Generates a large CTRF report for performance testing
 */
export const generateLargeCtrfReport = (testCount: number = 100): CtrfSchema => {
  const now = new Date();
  const startTime = now.getTime() - testCount * 100;

  const tests = Array.from({ length: testCount }, (_, i) => ({
    name: `Test case ${i + 1}`,
    status: i % 4 === 0 ? Status.failed : Status.passed,
    duration: Math.floor(Math.random() * 2000) + 100,
    start: startTime + i * 100,
    stop: startTime + (i + 1) * 100,
    suite: `Suite ${Math.floor(i / 10) + 1}`,
    filePath: `tests/suite${Math.floor(i / 10) + 1}/test${i + 1}.test.ts`,
    tags: [`tag${i % 5}`, 'automated'],
  }));

  const summary = {
    tests: tests.length,
    passed: tests.filter(t => t.status === Status.passed).length,
    failed: tests.filter(t => t.status === Status.failed).length,
    skipped: 0,
    pending: 0,
    other: 0,
    start: startTime,
    stop: now.getTime(),
  };

  return {
    reportFormat: ReportFormat.CTRF,
    specVersion: '1.0.0',
    reportId: uuidv4(),
    timestamp: now.toISOString(),
    generatedBy: 'Performance Test Generator',
    results: {
      tool: {
        name: 'PerfTest',
        version: '1.0.0',
      },
      summary,
      tests,
      environment: {
        testEnvironment: 'performance',
        buildNumber: 'perf-test-001',
      },
    },
  };
};
