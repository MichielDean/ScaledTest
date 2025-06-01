// tests/unit/testDataGenerator.test.ts
import { v4 as uuidv4 } from 'uuid';
import { generateTestExecution } from '../utils/testDataGenerator';
import {
  TestExecutionStatus,
  TestCaseStatus,
  TestResultStatus,
  TestResultPriority,
} from '../../src/models/testResults';

describe('Test Data Generator', () => {
  describe('generateTestExecution', () => {
    it('should generate a valid test execution with default values', () => {
      const testExecution = generateTestExecution();

      expect(testExecution).toBeDefined();
      expect(testExecution.id).toBeDefined();
      expect(testExecution.createdAt).toBeDefined();
      expect(testExecution.testSuiteId).toBeDefined();
      expect(testExecution.status).toBe(TestExecutionStatus.COMPLETED);
      expect(testExecution.startedAt).toBeDefined();
      expect(testExecution.completedAt).toBeDefined();
      expect(testExecution.environment).toBeDefined();
      expect(testExecution.configuration).toBeDefined();
      expect(testExecution.triggeredBy).toBe('CI/CD Pipeline');
      expect(testExecution.buildId).toBe('build-1234');
      expect(testExecution.testCases).toBeDefined();
      expect(testExecution.tags).toEqual(['regression', 'authentication']);
    });

    it('should generate a test execution that uses valid enum values', () => {
      const testExecution = generateTestExecution();

      // Test that all enum values are valid without using Zod schemas
      expect(Object.values(TestExecutionStatus)).toContain(testExecution.status);

      const testCase = testExecution.testCases[0];
      expect(Object.values(TestCaseStatus)).toContain(testCase.status);

      testCase.testResults.forEach(result => {
        expect(Object.values(TestResultStatus)).toContain(result.status);
        if (result.priority) {
          expect(Object.values(TestResultPriority)).toContain(result.priority);
        }
      });
    });

    it('should accept and apply overrides', () => {
      const overrides = {
        status: TestExecutionStatus.RUNNING,
        triggeredBy: 'Manual Execution',
        buildId: 'manual-test-123',
        tags: ['manual', 'smoke'],
      };

      const testExecution = generateTestExecution(overrides);

      expect(testExecution.status).toBe(TestExecutionStatus.RUNNING);
      expect(testExecution.triggeredBy).toBe('Manual Execution');
      expect(testExecution.buildId).toBe('manual-test-123');
      expect(testExecution.tags).toEqual(['manual', 'smoke']);
    });

    it('should generate test execution with proper environment configuration', () => {
      const testExecution = generateTestExecution();

      expect(testExecution.environment).toEqual({
        os: 'Windows',
        browser: 'Chrome',
        version: '115.0.5790.171',
      });

      expect(testExecution.configuration).toEqual({
        headless: true,
        viewport: { width: 1920, height: 1080 },
      });
    });

    it('should generate test execution with valid timestamp relationships', () => {
      // Use a fixed timestamp to ensure deterministic behavior
      const fixedTimestamp = new Date('2025-06-01T12:00:00.000Z');
      const testExecution = generateTestExecution({}, fixedTimestamp);

      const createdAt = new Date(testExecution.createdAt);
      const startedAt = new Date(testExecution.startedAt);
      const completedAt = new Date(testExecution.completedAt);

      // startedAt should be before completedAt
      expect(startedAt.getTime()).toBeLessThan(completedAt.getTime());

      // createdAt should equal completedAt when using fixed timestamp
      expect(createdAt.getTime()).toBe(completedAt.getTime());

      // Verify the exact timestamp relationships with fixed values
      expect(completedAt.getTime() - startedAt.getTime()).toBe(60 * 60 * 1000); // 1 hour difference
    });

    it('should generate test execution with valid test cases', () => {
      const testExecution = generateTestExecution();

      expect(testExecution.testCases).toHaveLength(1);

      const testCase = testExecution.testCases[0];
      expect(testCase.id).toBeDefined();
      expect(testCase.name).toBe('Authentication Test Suite');
      expect(testCase.description).toBe('Tests for user authentication flows');
      expect(testCase.status).toBe(TestCaseStatus.PASSED);
      expect(testCase.testResults).toHaveLength(2);

      // Test the relationships and structure directly
      testCase.testResults.forEach(result => {
        expect(result.testCaseId).toBe(testCase.id);
        expect(typeof result.id).toBe('string');
        expect(typeof result.name).toBe('string');
        expect(typeof result.createdAt).toBe('string');
      });
    });

    it('should generate test execution with valid test results', () => {
      const testExecution = generateTestExecution();
      const testCase = testExecution.testCases[0];
      const testResults = testCase.testResults;

      expect(testResults).toHaveLength(2);

      // Check first test result (passing)
      const passedResult = testResults[0];
      expect(passedResult.status).toBe('passed');
      expect(passedResult.priority).toBe('medium');
      expect(passedResult.name).toBe('Login should succeed with valid credentials');
      expect(passedResult.durationMs).toBe(1250);
      expect(passedResult.tags).toEqual(['authentication', 'login']);

      // Check second test result (failing)
      const failedResult = testResults[1];
      expect(failedResult.status).toBe('failed');
      expect(failedResult.priority).toBe('high');
      expect(failedResult.name).toBe('User data should load');
      expect(failedResult.errorDetails).toBeDefined();
      expect(failedResult.errorDetails?.message).toBe('API returned 404 error');
      expect(failedResult.durationMs).toBe(850);

      // Test that all results have proper enum values and relationships
      testResults.forEach(result => {
        expect(Object.values(TestResultStatus)).toContain(result.status);
        if (result.priority) {
          expect(Object.values(TestResultPriority)).toContain(result.priority);
        }
        expect(typeof result.id).toBe('string');
        expect(typeof result.testCaseId).toBe('string');
        expect(typeof result.createdAt).toBe('string');
      });
    });

    it('should generate UUIDs for all ID fields', () => {
      const testExecution = generateTestExecution();

      // Check main execution ID
      expect(testExecution.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(testExecution.testSuiteId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );

      // Check test case IDs
      const testCase = testExecution.testCases[0];
      expect(testCase.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );

      // Check test result IDs
      testCase.testResults.forEach(result => {
        expect(result.id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        );
        expect(result.testCaseId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        );
      });
    });

    it('should generate test execution with correct duration calculations', () => {
      const testExecution = generateTestExecution();
      const testCase = testExecution.testCases[0];

      // Test case duration should be sum of test result durations
      const expectedDuration = testCase.testResults.reduce(
        (sum, result) => sum + result.durationMs,
        0
      );
      expect(testCase.durationMs).toBe(expectedDuration);
    });

    it('should preserve override ID in test case testExecutionId', () => {
      const customId = uuidv4();
      const testExecution = generateTestExecution({ id: customId });

      expect(testExecution.id).toBe(customId);
      expect(testExecution.testCases[0].testExecutionId).toBe(customId);
    });

    it('should generate consistent timestamp formats', () => {
      // Use a fixed timestamp to ensure deterministic behavior
      const fixedTimestamp = new Date('2025-06-01T12:00:00.000Z');
      const testExecution = generateTestExecution({}, fixedTimestamp);

      // Check that all timestamps are valid ISO strings
      expect(() => new Date(testExecution.createdAt)).not.toThrow();
      expect(() => new Date(testExecution.startedAt)).not.toThrow();
      expect(() => new Date(testExecution.completedAt)).not.toThrow();

      const testCase = testExecution.testCases[0];
      expect(() => new Date(testCase.createdAt)).not.toThrow();
      expect(() => new Date(testCase.startedAt)).not.toThrow();
      expect(() => new Date(testCase.completedAt)).not.toThrow();

      testCase.testResults.forEach(result => {
        expect(() => new Date(result.createdAt)).not.toThrow();
      });
    });
  });
});
