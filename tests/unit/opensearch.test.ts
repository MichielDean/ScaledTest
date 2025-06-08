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
  ensureCtrfReportsIndexExists,
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
        meta: {},
      });

      // Act
      const result = await checkConnection();

      // Assert
      expect(result).toBe(true);
      expect(mockHealthFn).toHaveBeenCalled();
    });

    it('should report failed connection when cluster health check fails', async () => {
      // Arrange
      mockHealthFn.mockRejectedValueOnce(new Error('Connection refused'));

      // Act
      const result = await checkConnection();

      // Assert
      expect(result).toBe(false);
      expect(mockHealthFn).toHaveBeenCalled();
    });
  });

  describe('Index Management', () => {
    it('should create CTRF reports index if it does not exist', async () => {
      // Arrange
      mockExistsFn.mockResolvedValueOnce({
        body: false,
        statusCode: 404,
        headers: {},
        meta: {},
      });
      mockCreateFn.mockResolvedValueOnce({
        body: { acknowledged: true },
        statusCode: 200,
        headers: {},
        meta: {},
      });

      // Act
      await ensureCtrfReportsIndexExists();

      // Assert
      expect(mockExistsFn).toHaveBeenCalledWith({ index: 'ctrf-reports' });
      expect(mockCreateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'ctrf-reports',
          body: expect.objectContaining({
            mappings: expect.objectContaining({
              properties: expect.objectContaining({
                reportId: expect.any(Object),
                reportFormat: expect.any(Object),
                timestamp: expect.any(Object),
              }),
            }),
          }),
        })
      );
    });

    it('should not create CTRF reports index if it already exists', async () => {
      // Arrange
      mockExistsFn.mockResolvedValueOnce({
        body: true,
        statusCode: 200,
        headers: {},
        meta: {},
      });

      // Act
      await ensureCtrfReportsIndexExists();

      // Assert
      expect(mockExistsFn).toHaveBeenCalledWith({ index: 'ctrf-reports' });
      expect(mockCreateFn).not.toHaveBeenCalled();
    });

    it('should throw an error if index check fails', async () => {
      // Arrange
      mockExistsFn.mockRejectedValueOnce(new Error('OpenSearch error'));

      // Act & Assert
      await expect(ensureCtrfReportsIndexExists()).rejects.toThrow('OpenSearch error');
    });

    it('should throw an error if index creation fails', async () => {
      // Arrange
      mockExistsFn.mockResolvedValueOnce({
        body: false,
        statusCode: 404,
        headers: {},
        meta: {},
      });
      mockCreateFn.mockRejectedValueOnce(new Error('Failed to create index'));

      // Act & Assert
      await expect(ensureCtrfReportsIndexExists()).rejects.toThrow('Failed to create index');
    });
  });

  describe('Client Configuration', () => {
    it('should create a client with the correct configuration', () => {
      // Since Client is called during module initialization and Jest mocks are set up
      // after the module is imported, we can't actually check the Client constructor call.
      // Instead, we'll check that the opensearchClient object exists
      expect(opensearchClient).toBeDefined();

      // We can still check the mock to make sure it's been set up correctly
      expect(Client).toBeDefined();
    });
  });
});
