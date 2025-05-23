// tests/unit/opensearch.test.ts
import { setupOpenSearchTestEnv } from '../utils/testEnvSetup';
setupOpenSearchTestEnv();

import { Client } from '@opensearch-project/opensearch';

// Create mock before importing the module that uses it
const mockHealthFn = jest.fn();
const mockExistsFn = jest.fn();
const mockCreateFn = jest.fn();

const mockClient = {
  cluster: {
    health: mockHealthFn,
  },
  indices: {
    exists: mockExistsFn,
    create: mockCreateFn,
  },
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

describe('OpenSearch Client', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  describe('Connection Management', () => {
    it('should report successful connection when cluster health is good', async () => {
      // Arrange
      mockHealthFn.mockResolvedValueOnce({
        body: { status: 'green' },
        statusCode: 200,
        headers: {},
        meta: {} as any,
      });

      // Act
      const result = await checkConnection();

      // Assert
      expect(result).toBe(true);
      expect(mockHealthFn).toHaveBeenCalledTimes(1);
    });

    it('should report failed connection when cluster health check fails', async () => {
      // Arrange
      mockHealthFn.mockRejectedValueOnce(new Error('Connection failed'));

      // Act
      const result = await checkConnection();

      // Assert
      expect(result).toBe(false);
      expect(mockHealthFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Index Management', () => {
    it('should not create index when it already exists', async () => {
      // Arrange
      mockExistsFn.mockResolvedValueOnce({
        body: true,
        statusCode: 200,
        headers: {},
        meta: {} as any,
      });

      // Act
      const result = await checkAndCreateTestResultsIndex();

      // Assert
      expect(result).toBe(true);
      expect(mockExistsFn).toHaveBeenCalledWith({ index: TEST_RESULTS_INDEX });
      expect(mockCreateFn).not.toHaveBeenCalled();
    });

    it('should create index when it does not exist', async () => {
      // Arrange
      mockExistsFn.mockResolvedValueOnce({
        body: false,
        statusCode: 404,
        headers: {},
        meta: {} as any,
      });

      mockCreateFn.mockResolvedValueOnce({
        body: { acknowledged: true },
        statusCode: 200,
        headers: {},
        meta: {} as any,
      });

      // Act
      const result = await checkAndCreateTestResultsIndex();

      // Assert
      expect(result).toBe(true);
      expect(mockExistsFn).toHaveBeenCalledWith({ index: TEST_RESULTS_INDEX });
      expect(mockCreateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          index: TEST_RESULTS_INDEX,
        })
      );
    });

    it('should handle index creation failures', async () => {
      // Arrange
      mockExistsFn.mockResolvedValueOnce({
        body: false,
        statusCode: 404,
        headers: {},
        meta: {} as any,
      });

      mockCreateFn.mockRejectedValueOnce(new Error('Failed to create index'));

      // Act
      const result = await checkAndCreateTestResultsIndex();

      // Assert
      expect(result).toBe(false);
      expect(mockExistsFn).toHaveBeenCalledWith({ index: TEST_RESULTS_INDEX });
      expect(mockCreateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          index: TEST_RESULTS_INDEX,
        })
      );
    });
  });
});
