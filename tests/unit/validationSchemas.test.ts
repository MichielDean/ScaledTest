// tests/unit/validationSchemas.test.ts
import { v4 as uuidv4 } from 'uuid';
import {
  TestErrorDetailsSchema,
  TestResultStatusSchema,
  TestResultPrioritySchema,
  TestResultSchema,
  TestCaseStatusSchema,
  TestCaseSchema,
  TestExecutionStatusSchema,
  TestExecutionSchema,
} from '../../src/models/validationSchemas';

describe('Validation Schemas', () => {
  describe('TestErrorDetailsSchema Validation', () => {
    it('should validate a complete error details object', () => {
      const validErrorDetails = {
        message: 'Error: Test failed unexpectedly',
        stackTrace: 'Error: at line 42\n  at Function.assertSomething',
        screenshotUrl: 'https://example.com/screenshots/123.png',
        consoleOutput: 'Some console output',
      };

      const result = TestErrorDetailsSchema.safeParse(validErrorDetails);
      expect(result.success).toBe(true);
    });

    it('should validate with only required fields', () => {
      const minimalErrorDetails = {
        message: 'An error occurred',
      };

      const result = TestErrorDetailsSchema.safeParse(minimalErrorDetails);
      expect(result.success).toBe(true);
    });

    it('should reject invalid URL formats', () => {
      const invalidErrorDetails = {
        message: 'Error message',
        screenshotUrl: 'invalid-url',
      };

      const result = TestErrorDetailsSchema.safeParse(invalidErrorDetails);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('screenshotUrl');
      }
    });
  });

  describe('TestResultSchema Validation', () => {
    it('should validate a complete test result object', () => {
      const now = new Date().toISOString();
      const validTestResult = {
        id: uuidv4(),
        createdAt: now,
        testCaseId: uuidv4(),
        status: 'passed',
        priority: 'high',
        name: 'Login Test',
        description: 'Test user login functionality',
        expected: 'User should be logged in',
        actual: 'User was logged in successfully',
        durationMs: 1500,
        tags: ['login', 'authentication'],
      };

      const result = TestResultSchema.safeParse(validTestResult);
      expect(result.success).toBe(true);
    });

    it('should reject invalid status values', () => {
      const now = new Date().toISOString();
      const invalidTestResult = {
        id: uuidv4(),
        createdAt: now,
        testCaseId: uuidv4(),
        status: 'invalid-status', // Invalid status
        name: 'Test Name',
      };

      const result = TestResultSchema.safeParse(invalidTestResult);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('status');
      }
    });

    it('should reject invalid UUID format', () => {
      const now = new Date().toISOString();
      const invalidTestResult = {
        id: 'not-a-uuid',
        createdAt: now,
        testCaseId: uuidv4(),
        status: 'passed',
        name: 'Test Name',
      };

      const result = TestResultSchema.safeParse(invalidTestResult);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('id');
      }
    });
  });

  describe('TestExecutionSchema Validation', () => {
    it('should validate a complete test execution with nested test cases and results', () => {
      const now = new Date().toISOString();
      const oneHourAgo = new Date(Date.now() - 3600000).toISOString();

      const validTestExecution = {
        id: uuidv4(),
        createdAt: now,
        testSuiteId: uuidv4(),
        status: 'completed',
        startedAt: oneHourAgo,
        completedAt: now,
        environment: {
          os: 'Windows',
          browser: 'Chrome',
        },
        testCases: [
          {
            id: uuidv4(),
            createdAt: now,
            testExecutionId: uuidv4(),
            name: 'Login Test Suite',
            status: 'passed',
            startedAt: oneHourAgo,
            completedAt: now,
            testResults: [
              {
                id: uuidv4(),
                createdAt: now,
                testCaseId: uuidv4(),
                status: 'passed',
                name: 'Should login successfully',
              },
            ],
          },
        ],
      };

      const result = TestExecutionSchema.safeParse(validTestExecution);
      expect(result.success).toBe(true);
    });

    it('should reject when missing required fields', () => {
      const now = new Date().toISOString();
      const invalidTestExecution = {
        id: uuidv4(),
        createdAt: now,
        // Missing testSuiteId
        status: 'running',
        startedAt: now,
        testCases: [],
      };

      const result = TestExecutionSchema.safeParse(invalidTestExecution);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('testSuiteId');
      }
    });
  });
});
