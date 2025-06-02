import { NextApiRequest, NextApiResponse } from 'next';
import { Readable } from 'stream';
import { CtrfSchema } from '../../src/schemas/ctrf/ctrf';
import testReportsHandler from '../../src/pages/api/test-reports';
import opensearchClient from '../../src/lib/opensearch';
import {
  generateCtrfReport,
  generateMinimalCtrfReport,
  generateInvalidCtrfReport,
} from '../utils/ctrfTestDataGenerator';
import { UserRole } from '../../src/auth/keycloak';
import { ZodError } from 'zod';
import { apiLogger } from '../../src/utils/logger';

// Mock dependencies
jest.mock('../../src/lib/opensearch', () => {
  return {
    __esModule: true,
    default: {
      indices: {
        exists: jest.fn(),
        create: jest.fn(),
      },
      index: jest.fn(),
      search: jest.fn(),
    },
    TEST_RESULTS_INDEX: 'test-results',
    checkConnection: jest.fn(),
    ensureIndexExists: jest.fn(),
  };
});

jest.mock('../../src/auth/keycloak', () => ({
  UserRole: {
    READONLY: 'readonly',
    MAINTAINER: 'maintainer',
    OWNER: 'owner',
  },
}));
jest.mock('../../src/utils/logger', () => ({
  apiLogger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
  dbLogger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
  getRequestLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  }),
  logError: jest.fn(),
}));

// Mock withApiAuth to bypass actual authentication for unit tests
jest.mock('../../src/auth/apiAuth', () => ({
  withApiAuth: jest.fn((handler, _requiredRoles) => {
    return async (req: NextApiRequest, res: NextApiResponse) => {
      // Simulate an authenticated user for testing purposes
      (req as any).user = {
        sub: 'test-user-id',
        name: 'Test User',
        email: 'test@example.com',
        roles: [UserRole.MAINTAINER], // Adjust roles as needed for tests
      };
      return handler(req, res);
    };
  }),
}));

const mockOpensearchClient = opensearchClient as jest.Mocked<typeof opensearchClient>;

const mockRequest = (method: string, body?: any, query?: any): NextApiRequest => {
  const req = {
    method,
    body,
    query: query || {},
    headers: {
      'x-request-id': 'test-request-id',
    },
    socket: { remoteAddress: 'test-ip' },
    url: '/api/test-reports',
  } as unknown as NextApiRequest;

  // Mock stream for formidable if needed (not directly used by this API but good practice)
  const stream = new Readable();
  stream.push(body ? JSON.stringify(body) : null);
  stream.push(null);
  Object.assign(req, stream);

  return req;
};

const mockResponse = (): NextApiResponse => {
  const res = {} as NextApiResponse;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res;
};

describe('CTRF Reports API Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    (mockOpensearchClient.indices.exists as jest.Mock).mockImplementation(() => {
      const promise = Promise.resolve({
        body: true,
        statusCode: 200,
        headers: {},
        meta: {} as any,
      }) as any;
      promise.abort = jest.fn();
      return promise;
    });
    (mockOpensearchClient.indices.create as jest.Mock).mockImplementation(() => {
      const promise = Promise.resolve({
        body: { acknowledged: true },
        statusCode: 200,
        headers: {},
        meta: {} as any,
      }) as any;
      promise.abort = jest.fn();
      return promise;
    });
    mockOpensearchClient.index.mockImplementation(() => {
      const promise = Promise.resolve({
        body: { _id: 'test-id', result: 'created' },
        statusCode: 201,
        headers: {},
        meta: {} as any,
      }) as any;
      promise.abort = jest.fn();
      return promise;
    });
    mockOpensearchClient.search.mockImplementation(() => {
      const promise = Promise.resolve({
        body: {
          hits: {
            total: { value: 0, relation: 'eq' },
            hits: [],
          },
        },
        statusCode: 200,
        headers: {},
        meta: {} as any,
      }) as any;
      promise.abort = jest.fn();
      return promise;
    });
  });

  describe('POST /api/test-reports', () => {
    it('should store a valid CTRF report', async () => {
      const report = generateCtrfReport();
      const req = mockRequest('POST', report);
      const res = mockResponse();

      await testReportsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          id: report.reportId,
          message: 'CTRF report stored successfully',
        })
      );
      expect(mockOpensearchClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'ctrf-reports',
          id: report.reportId,
          body: expect.objectContaining({
            reportId: report.reportId,
            storedAt: expect.any(String),
          }),
          refresh: true,
        })
      );
    });

    it('should generate reportId if missing', async () => {
      const report = generateCtrfReport();
      delete report.reportId;
      const req = mockRequest('POST', report);
      const res = mockResponse();

      await testReportsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          id: expect.any(String),
        })
      );
      expect(mockOpensearchClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ reportId: expect.any(String) }),
        })
      );
    });

    it('should generate timestamp if missing', async () => {
      const report = generateCtrfReport();
      delete report.timestamp;
      const req = mockRequest('POST', report);
      const res = mockResponse();

      await testReportsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockOpensearchClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ timestamp: expect.any(String) }),
        })
      );
    });

    it('should return 400 for invalid report schema', async () => {
      const invalidReport = generateInvalidCtrfReport();
      const req = mockRequest('POST', invalidReport);
      const res = mockResponse();

      await testReportsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'CTRF report validation failed',
          details: expect.any(Array),
        })
      );
    });

    it('should return 503 if OpenSearch connection fails (ECONNREFUSED)', async () => {
      mockOpensearchClient.index.mockImplementationOnce(() => {
        const error = new Error('ECONNREFUSED test error');
        const promise = Promise.reject(error) as any;
        promise.abort = jest.fn();
        return promise;
      });
      const report = generateCtrfReport();
      const req = mockRequest('POST', report);
      const res = mockResponse();

      await testReportsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'OpenSearch service unavailable',
      });
    });

    it('should return 500 for other OpenSearch errors', async () => {
      mockOpensearchClient.index.mockImplementationOnce(() => {
        const error = new Error('Some other OpenSearch error');
        const promise = Promise.reject(error) as any;
        promise.abort = jest.fn();
        return promise;
      });
      const report = generateCtrfReport();
      const req = mockRequest('POST', report);
      const res = mockResponse();

      await testReportsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to store CTRF report',
        details: 'Some other OpenSearch error',
      });
    });

    it('should ensure index exists before storing', async () => {
      (mockOpensearchClient.indices.exists as jest.Mock).mockImplementationOnce(() => {
        const promise = Promise.resolve({
          body: false,
          statusCode: 404,
          headers: {},
          meta: {} as any,
        }) as any;
        promise.abort = jest.fn();
        return promise;
      });
      const report = generateCtrfReport();
      const req = mockRequest('POST', report);
      const res = mockResponse();

      await testReportsHandler(req, res);

      expect(mockOpensearchClient.indices.exists).toHaveBeenCalledWith({ index: 'ctrf-reports' });
      expect(mockOpensearchClient.indices.create).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  describe('GET /api/test-reports', () => {
    it('should retrieve reports with default pagination', async () => {
      const mockReport = generateCtrfReport();
      mockOpensearchClient.search.mockImplementationOnce(() => {
        const promise = Promise.resolve({
          body: {
            hits: {
              total: { value: 1, relation: 'eq' },
              hits: [
                { _id: 'report1', _source: { ...mockReport, storedAt: new Date().toISOString() } },
              ],
            },
          },
          statusCode: 200,
          headers: {},
          meta: {} as any,
        }) as any;
        promise.abort = jest.fn();
        return promise;
      });
      const req = mockRequest('GET', null, {});
      const res = mockResponse();

      await testReportsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        reports: [expect.objectContaining({ _id: 'report1', ...mockReport })],
        total: 1,
      });
      expect(mockOpensearchClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'ctrf-reports',
          body: expect.objectContaining({
            from: 0,
            size: 20, // Default size
            sort: [{ storedAt: { order: 'desc' } }],
          }),
        })
      );
    });

    it('should handle custom pagination', async () => {
      const req = mockRequest('GET', null, { page: '2', size: '5' });
      const res = mockResponse();

      await testReportsHandler(req, res);

      expect(mockOpensearchClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            from: 5, // (2-1) * 5
            size: 5,
          }),
        })
      );
    });

    it('should limit max page size to 100', async () => {
      const req = mockRequest('GET', null, { size: '200' });
      const res = mockResponse();

      await testReportsHandler(req, res);

      expect(mockOpensearchClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            size: 100,
          }),
        })
      );
    });

    it('should filter by status', async () => {
      const req = mockRequest('GET', null, { status: 'passed' });
      const res = mockResponse();

      await testReportsHandler(req, res);

      expect(mockOpensearchClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            query: {
              bool: {
                must: [
                  {
                    nested: {
                      path: 'results.tests',
                      query: { term: { 'results.tests.status': 'passed' } },
                    },
                  },
                ],
              },
            },
          }),
        })
      );
    });

    it('should filter by tool name', async () => {
      const req = mockRequest('GET', null, { tool: 'Jest' });
      const res = mockResponse();

      await testReportsHandler(req, res);

      expect(mockOpensearchClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            query: {
              bool: {
                must: [{ term: { 'results.tool.name': 'Jest' } }],
              },
            },
          }),
        })
      );
    });

    it('should filter by environment', async () => {
      const req = mockRequest('GET', null, { environment: 'CI' });
      const res = mockResponse();

      await testReportsHandler(req, res);

      expect(mockOpensearchClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            query: {
              bool: {
                must: [{ term: { 'results.environment.testEnvironment': 'CI' } }],
              },
            },
          }),
        })
      );
    });

    it('should combine multiple filters', async () => {
      const req = mockRequest('GET', null, {
        status: 'failed',
        tool: 'Playwright',
        environment: 'staging',
      });
      const res = mockResponse();

      await testReportsHandler(req, res);

      expect(mockOpensearchClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            query: {
              bool: {
                must: [
                  {
                    nested: {
                      path: 'results.tests',
                      query: { term: { 'results.tests.status': 'failed' } },
                    },
                  },
                  { term: { 'results.tool.name': 'Playwright' } },
                  { term: { 'results.environment.testEnvironment': 'staging' } },
                ],
              },
            },
          }),
        })
      );
    });

    it('should return 503 if OpenSearch service unavailable on GET', async () => {
      mockOpensearchClient.search.mockImplementationOnce(() => {
        const error = new Error('ECONNREFUSED test error');
        const promise = Promise.reject(error) as any;
        promise.abort = jest.fn();
        return promise;
      });
      const req = mockRequest('GET', null, {});
      const res = mockResponse();

      await testReportsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'OpenSearch service unavailable',
      });
    });

    it('should return 500 for other OpenSearch errors on GET', async () => {
      mockOpensearchClient.search.mockImplementationOnce(() => {
        const error = new Error('Some other OpenSearch error');
        const promise = Promise.reject(error) as any;
        promise.abort = jest.fn();
        return promise;
      });
      const req = mockRequest('GET', null, {});
      const res = mockResponse();

      await testReportsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to retrieve CTRF reports',
        details: 'Some other OpenSearch error',
      });
    });

    it('should handle OpenSearch index check failure gracefully on GET', async () => {
      // Set up a mock that will properly throw an error that will be caught by the handleGet function
      (mockOpensearchClient.search as jest.Mock).mockImplementationOnce(() => {
        const error = new Error('Unexpected index check error');
        const promise = Promise.reject(error) as any;
        promise.abort = jest.fn();
        return promise;
      });
      const req = mockRequest('GET', null, {});
      const res = mockResponse();

      await testReportsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500); // Or appropriate error code
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Failed to retrieve CTRF reports', // Expected error message
        })
      );
    });
  });

  describe('Unsupported Methods', () => {
    it('should return 405 for PUT requests', async () => {
      const req = mockRequest('PUT', {});
      const res = mockResponse();

      await testReportsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(405);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Method not allowed. Supported methods: POST, GET',
      });
    });

    it('should return 405 for DELETE requests', async () => {
      const req = mockRequest('DELETE');
      const res = mockResponse();

      await testReportsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(405);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Method not allowed. Supported methods: POST, GET',
      });
    });
  });

  describe('Global Error Handling', () => {
    it('should return 500 if ensureIndexExists throws an unexpected error', async () => {
      (mockOpensearchClient.indices.exists as jest.Mock).mockImplementationOnce(() => {
        const error = new Error('Unexpected index check error');
        const promise = Promise.reject(error) as any;
        promise.abort = jest.fn();
        return promise;
      });
      const report = generateCtrfReport();
      const req = mockRequest('POST', report);
      const res = mockResponse();

      await testReportsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Internal server error',
      });
    });
  });
});
