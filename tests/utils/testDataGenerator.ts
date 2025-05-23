// tests/utils/testDataGenerator.ts
import { v4 as uuidv4 } from 'uuid';
import {
  TestExecutionStatus,
  TestCaseStatus,
  TestResultStatus,
  TestResultPriority,
} from '../../src/models/testResults';

/**
 * Generates a valid test execution object that matches the validation schema
 */
export const generateTestExecution = (overrides: Partial<any> = {}) => {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const testResults = [
    {
      id: uuidv4(),
      createdAt: now.toISOString(),
      testCaseId: uuidv4(),
      status: 'passed' as TestResultStatus,
      priority: 'medium' as TestResultPriority,
      name: 'Login should succeed with valid credentials',
      description: 'Verify user can login with valid username and password',
      expected: 'User is redirected to dashboard',
      actual: 'User was redirected to dashboard',
      durationMs: 1250,
      tags: ['authentication', 'login'],
    },
    {
      id: uuidv4(),
      createdAt: now.toISOString(),
      testCaseId: uuidv4(),
      status: 'failed' as TestResultStatus,
      priority: 'high' as TestResultPriority,
      name: 'User data should load',
      description: 'Verify user profile data loads on the dashboard',
      expected: 'User profile data is displayed',
      actual: 'API returned 404 error',
      errorDetails: {
        message: 'API returned 404 error',
        stackTrace:
          'Error: API returned 404 error\n    at Object.<anonymous> (/tests/api.test.ts:25:15)',
      },
      durationMs: 850,
      tags: ['dashboard', 'profile'],
    },
  ];

  const testCases = [
    {
      id: uuidv4(),
      createdAt: now.toISOString(),
      testExecutionId: overrides.id || uuidv4(),
      name: 'Authentication Test Suite',
      description: 'Tests for user authentication flows',
      status: 'passed' as TestCaseStatus,
      startedAt: oneHourAgo.toISOString(),
      completedAt: now.toISOString(),
      durationMs: 2100,
      testResults: testResults,
      tags: ['authentication', 'login'],
    },
  ];

  const testExecution = {
    id: uuidv4(),
    createdAt: now.toISOString(),
    testSuiteId: uuidv4(),
    status: 'completed' as TestExecutionStatus,
    startedAt: oneHourAgo.toISOString(),
    completedAt: now.toISOString(),
    environment: {
      os: 'Windows',
      browser: 'Chrome',
      version: '115.0.5790.171',
    },
    configuration: {
      headless: true,
      viewport: { width: 1920, height: 1080 },
    },
    triggeredBy: 'CI/CD Pipeline',
    buildId: 'build-1234',
    testCases,
    tags: ['regression', 'authentication'],
  };

  return { ...testExecution, ...overrides };
};
