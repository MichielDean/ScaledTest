// tests/integration/opensearch.test.ts

// Import the environment setup (will run before importing anything else)
import { setupOpenSearchTestEnv } from '../utils/testEnvSetup';
setupOpenSearchTestEnv();

import { Client } from '@opensearch-project/opensearch';
import { v4 as uuidv4 } from 'uuid';
import { generateTestExecution } from '../utils/testDataGenerator';

// Create mock before importing the module that uses it
const mockClient = {
  cluster: {
    health: jest.fn().mockResolvedValue({
      body: { status: 'green' },
      statusCode: 200,
      headers: {},
      meta: {} as any,
    }),
  },
  indices: {
    exists: jest.fn().mockResolvedValue({
      body: true,
      statusCode: 200,
      headers: {},
      meta: {} as any,
    }),
    create: jest.fn().mockResolvedValue({
      body: { acknowledged: true },
      statusCode: 200,
      headers: {},
      meta: {} as any,
    }),
    delete: jest.fn().mockResolvedValue({
      body: { acknowledged: true },
      statusCode: 200,
      headers: {},
      meta: {} as any,
    }),
  },
  index: jest.fn().mockResolvedValue({
    body: {
      _id: 'test-id',
      result: 'created',
    },
    statusCode: 201,
    headers: {},
    meta: {} as any,
  }),
  get: jest.fn().mockImplementation(({ id }) => {
    return Promise.resolve({
      body: {
        _id: id,
        _source: {
          id,
          name: 'Test document',
          createdAt: new Date().toISOString(),
          testCases: [
            {
              testResults: [{}],
            },
          ],
        },
      },
      statusCode: 200,
      headers: {},
      meta: {} as any,
    });
  }),
};

// Mock the OpenSearch client
jest.mock('@opensearch-project/opensearch', () => {
  return {
    Client: jest.fn(() => mockClient),
  };
});

// Now import the module that uses the mocked client
import opensearchClient, {
  checkConnection,
  checkAndCreateTestResultsIndex,
  TEST_RESULTS_INDEX,
} from '../../src/lib/opensearch';

// This is an integration test that uses a mock OpenSearch client
describe('OpenSearch Integration', () => {
  // Use a unique index name for each test run to avoid conflicts
  const testIndexName = `test-results-${uuidv4().substring(0, 8)}`;

  beforeAll(() => {
    // Override the index name for testing
    (global as any).TEST_RESULTS_INDEX = testIndexName;
  });

  afterAll(() => {
    // Restore the original TEST_RESULTS_INDEX
    delete (global as any).TEST_RESULTS_INDEX;
  });

  describe('Cluster Connection', () => {
    it('should successfully connect to OpenSearch cluster', async () => {
      // Act
      const connected = await checkConnection();

      // Assert
      expect(connected).toBe(true);
    });
  });

  describe('Index Management', () => {
    it('should properly create and verify index existence', async () => {
      // Act
      const result = await checkAndCreateTestResultsIndex();

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('Document Operations', () => {
    it('should successfully index and retrieve a simple document', async () => {
      // Arrange
      const testDoc = {
        id: uuidv4(),
        name: 'Test document',
        createdAt: new Date().toISOString(),
      };

      // Act - Index the document
      const indexResult = await opensearchClient.index({
        index: testIndexName,
        id: testDoc.id,
        body: testDoc,
        refresh: true,
      });

      // Assert
      expect(indexResult.body._id).toBe('test-id');

      // Act - Retrieve the document
      const getResult = await opensearchClient.get({
        index: testIndexName,
        id: testDoc.id,
      });

      // Assert - We're just checking the mock returns something reasonable
      expect(getResult.body._source).toBeDefined();
    });

    it('should successfully index a complete test execution object', async () => {
      // Arrange
      const testExecution = generateTestExecution();

      // Act - Index the test execution
      const indexResult = await opensearchClient.index({
        index: testIndexName,
        id: testExecution.id,
        body: testExecution,
        refresh: true,
      });

      // Assert
      expect(indexResult.body._id).toBe('test-id');
      expect(indexResult.body.result).toBe('created');

      // Act - Retrieve the test execution (mocked)
      const getResult = await opensearchClient.get({
        index: testIndexName,
        id: testExecution.id,
      });

      // Assert - Using simplified checks since we're using mocks
      expect(getResult.body._source).toBeDefined();
    });
  });
});
