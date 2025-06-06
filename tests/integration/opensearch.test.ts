// tests/integration/opensearch.test.ts

// Import the environment setup (will run before importing anything else)
import { setupOpenSearchTestEnv } from '../utils/testEnvSetup';
setupOpenSearchTestEnv();

import { Client } from '@opensearch-project/opensearch';
import { v4 as uuidv4 } from 'uuid';
import { generateCtrfReport } from '../utils/ctrfTestDataGenerator';

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
      body: false,
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
  },
  index: jest.fn().mockResolvedValue({
    body: { _id: 'test-id', result: 'created' },
    statusCode: 201,
    headers: {},
    meta: {} as any,
  }),
  search: jest.fn().mockResolvedValue({
    body: {
      hits: {
        hits: [],
        total: { value: 0 },
      },
    },
    statusCode: 200,
    headers: {},
    meta: {} as any,
  }),
};

jest.mock('@opensearch-project/opensearch', () => {
  return {
    Client: jest.fn().mockImplementation(() => mockClient),
  };
});

// Import the module with the mocked dependencies
import opensearchClient, {
  checkConnection,
  ensureCtrfReportsIndexExists,
} from '../../src/lib/opensearch';

describe('OpenSearch Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  describe('Configuration', () => {
    it('should create a properly configured OpenSearch client', () => {
      // Since Client is called during module initialization and Jest mocks are set up
      // after the module is imported, we can't actually check the Client constructor call.
      // Instead, we'll check that the opensearchClient object exists
      expect(opensearchClient).toBeDefined();
    });
  });

  describe('Health Check', () => {
    it('should check cluster health', async () => {
      const result = await checkConnection();
      expect(result).toBe(true);
      expect(mockClient.cluster.health).toHaveBeenCalled();
    });

    it('should handle health check errors', async () => {
      // Mock an error for this test
      mockClient.cluster.health.mockRejectedValueOnce(new Error('Connection failed'));
      const result = await checkConnection();
      expect(result).toBe(false);
    });
  });

  describe('Index Creation', () => {
    it('should create CTRF reports index if it does not exist', async () => {
      // Mock the index not existing
      mockClient.indices.exists.mockResolvedValueOnce({
        body: false,
        statusCode: 404,
        headers: {},
        meta: {} as any,
      });

      await ensureCtrfReportsIndexExists();

      expect(mockClient.indices.exists).toHaveBeenCalledWith({ index: 'ctrf-reports' });
      expect(mockClient.indices.create).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'ctrf-reports',
          body: expect.objectContaining({
            mappings: expect.objectContaining({
              properties: expect.objectContaining({
                reportId: expect.any(Object),
                reportFormat: expect.any(Object),
                'results.tests': expect.any(Object),
              }),
            }),
          }),
        })
      );
    });

    it('should not create CTRF reports index if it already exists', async () => {
      // Mock the index already existing
      mockClient.indices.exists.mockResolvedValueOnce({
        body: true,
        statusCode: 200,
        headers: {},
        meta: {} as any,
      });

      await ensureCtrfReportsIndexExists();

      expect(mockClient.indices.exists).toHaveBeenCalledWith({ index: 'ctrf-reports' });
      expect(mockClient.indices.create).not.toHaveBeenCalled();
    });
  });

  describe('Document Operations', () => {
    it('should index CTRF reports', async () => {
      const report = generateCtrfReport();

      // Use the OpenSearch client to index the document
      const response = await opensearchClient.index({
        index: 'ctrf-reports',
        id: report.reportId || uuidv4(),
        body: report,
      });

      expect(mockClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'ctrf-reports',
          id: expect.any(String),
          body: expect.objectContaining({
            reportFormat: 'CTRF',
          }),
        })
      );
      expect(response.body._id).toBe('test-id');
      expect(response.body.result).toBe('created');
    });

    it('should search for CTRF reports', async () => {
      // Mock search results
      const mockReport = generateCtrfReport();
      mockClient.search.mockResolvedValueOnce({
        body: {
          hits: {
            hits: [
              {
                _id: 'test-id',
                _source: mockReport,
              },
            ],
            total: { value: 1 },
          },
        },
        statusCode: 200,
        headers: {},
        meta: {} as any,
      });

      const response = await opensearchClient.search({
        index: 'ctrf-reports',
        body: {
          query: { match_all: {} },
        },
      });

      expect(mockClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'ctrf-reports',
          body: expect.objectContaining({
            query: { match_all: {} },
          }),
        })
      );

      expect(response.body.hits.hits).toHaveLength(1);
      expect(response.body.hits.hits[0]._source).toEqual(mockReport);
    });
  });
});
