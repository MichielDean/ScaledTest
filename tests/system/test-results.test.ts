// tests/system/test-results.test.ts
import supertest from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { generateTestExecution } from '../utils/testDataGenerator';
import { getAuthHeader } from '../utils/auth';

describe('Test Results API', () => {
  let authHeaders: Record<string, string>;
  // Use the default Next.js port
  const TEST_PORT = process.env.TEST_PORT || '3000';
  const API_URL = `http://localhost:${TEST_PORT}`;
  const api = supertest(API_URL);

  beforeAll(async () => {
    // Get auth headers - this uses the Keycloak setup from Jest globalSetup
    try {
      console.log(`Testing against API at ${API_URL}`);
      authHeaders = await getAuthHeader();
      console.log('Successfully authenticated with Keycloak');
    } catch (error) {
      console.error('Failed to get auth token:', error);
      throw error;
    }
  }, 30000); // Allow 30 seconds for auth setup

  describe('Data Creation', () => {
    it('should store a valid test execution', async () => {
      // Generate test data
      const testData = generateTestExecution();

      // Send request to the API
      const response = await api
        .post('/api/test-results')
        .set(authHeaders)
        .send(testData)
        .expect(201);

      // Assert response structure
      expect(response.body).toMatchObject({
        success: true,
        id: testData.id,
        message: expect.stringContaining('successfully'),
      });
    });

    it('should handle a complex test execution with multiple test cases', async () => {
      // Generate a more complex test execution with multiple test cases
      const testData = generateTestExecution();

      // Add a second test case
      const secondTestCase = {
        id: uuidv4(),
        createdAt: new Date().toISOString(),
        testExecutionId: testData.id,
        name: 'Search Functionality Test Suite',
        description: 'Tests for search functionality',
        status: 'failed' as const,
        startedAt: new Date(Date.now() - 50 * 60 * 1000).toISOString(), // 50 minutes ago
        completedAt: new Date().toISOString(),
        durationMs: 3000,
        testResults: [
          {
            id: uuidv4(),
            createdAt: new Date().toISOString(),
            testCaseId: uuidv4(),
            status: 'failed' as const,
            priority: 'critical' as const,
            name: 'Search should return relevant results',
            description: 'Verify search returns relevant results for keywords',
            expected: 'Search returns matches for "test"',
            actual: 'Search returned no results',
            errorDetails: {
              message: 'Expected search to return results but got empty array',
              stackTrace: 'Error: Test failed\n    at SearchTest (/tests/search.test.ts:42:10)',
            },
            durationMs: 1500,
            tags: ['search', 'critical-path'],
          },
        ],
        tags: ['search', 'regression'],
      };

      testData.testCases.push(secondTestCase);

      // Send request to the API
      const response = await api
        .post('/api/test-results')
        .set(authHeaders)
        .send(testData)
        .expect(201);

      // Assert response
      expect(response.body).toMatchObject({
        success: true,
        id: testData.id,
        message: expect.stringContaining('successfully'),
      });
    });
  });

  describe('Data Validation', () => {
    it('should reject a test execution with missing required fields', async () => {
      // Generate invalid test data with missing testSuiteId
      const testData = {
        ...generateTestExecution(),
        testSuiteId: undefined,
      };

      // Send request to the API
      const response = await api
        .post('/api/test-results')
        .set(authHeaders)
        .send(testData)
        .expect(400);

      // Assert validation error response
      expect(response.body).toMatchObject({
        success: false,
        error: 'Validation error',
      });
      expect(response.body.details).toBeDefined();
    });
  });

  describe('Authentication Requirements', () => {
    it('should reject requests without authentication', async () => {
      // Generate test data
      const testData = generateTestExecution();

      // Send request without auth headers
      const response = await api.post('/api/test-results').send(testData).expect(401); // Unauthorized
    });
  });

  describe('Test Result Categorization', () => {
    it('should correctly handle a test execution with specific tags for filtering', async () => {
      // Generate test execution with specific tags
      const testData = generateTestExecution({
        tags: ['performance', 'smoke-test', 'critical-path'],
      });

      // Send request to the API
      const response = await api
        .post('/api/test-results')
        .set(authHeaders)
        .send(testData)
        .expect(201);

      // Assert response
      expect(response.body).toMatchObject({
        success: true,
        id: testData.id,
      });
    });
  });
});
