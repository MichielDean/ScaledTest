import { NextApiRequest, NextApiResponse } from 'next';
import {
  generateCtrfReport,
  generateMinimalCtrfReport,
  generateInvalidCtrfReport,
} from '../utils/ctrfTestDataGenerator';
import { CtrfSchema } from '../../src/schemas/ctrf/ctrf';

jest.mock('keycloak-js', () => {
  return function () {
    return {};
  };
});

jest.mock('jose', () => ({
  jwtVerify: jest.fn().mockResolvedValue({
    payload: {
      sub: 'user-123',
      aud: 'scaledtest-client',
      resource_access: {
        'scaledtest-client': {
          roles: ['owner', 'maintainer', 'readonly'],
        },
      },
    },
  }),
  createRemoteJWKSet: jest.fn().mockReturnValue('mocked-jwks'),
}));

jest.mock('../../src/auth/apiAuth', () => ({
  validateToken: jest
    .fn()
    .mockImplementation((req: NextApiRequest, res: NextApiResponse, next: () => void) => {
      (req as any).user = {
        id: 'user-123',
        roles: ['owner', 'maintainer', 'readonly'],
      };
      if (typeof next === 'function') {
        return next();
      }
      return (handler: (req: NextApiRequest, res: NextApiResponse) => void) => handler(req, res);
    }),
  requireRole: jest
    .fn()
    .mockImplementation(
      (role: string) => (req: NextApiRequest, res: NextApiResponse, next: () => void) => {
        if (typeof next === 'function') {
          return next();
        }
        return (handler: (req: NextApiRequest, res: NextApiResponse) => void) => handler(req, res);
      }
    ),
  withApiAuth: jest.fn().mockImplementation((handler: any, roles?: string[]) => {
    return async (req: NextApiRequest, res: NextApiResponse) => {
      (req as any).user = {
        id: 'user-123',
        roles: ['owner', 'maintainer', 'readonly'],
      };
      return handler(req, res);
    };
  }),
}));

jest.mock('../../src/auth/keycloak', () => ({
  UserRole: {
    READONLY: 'readonly',
    MAINTAINER: 'maintainer',
    OWNER: 'owner',
  },
}));

import { getAuthToken } from '../utils/auth';
import opensearchClient from '../../src/lib/opensearch';
import testReportsHandler from '../../src/pages/api/test-reports';

jest.mock('../utils/auth');
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

const mockGetAuthToken = getAuthToken as jest.MockedFunction<typeof getAuthToken>;
const mockOpensearchClient = opensearchClient as jest.Mocked<typeof opensearchClient>;

const mockReq = (overrides = {}) => {
  return {
    method: 'POST',
    headers: {
      authorization: 'Bearer mock-token',
    },
    body: {},
    user: {
      id: 'user-123',
      roles: ['owner', 'maintainer', 'readonly'],
    },
    ...overrides,
  } as unknown as NextApiRequest;
};

const mockRes = () => {
  const res = {} as NextApiResponse;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
};

describe('CTRF Reports API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockGetAuthToken.mockResolvedValue('mocked-token');

    mockOpensearchClient.indices = {
      exists: jest.fn().mockImplementation(() => {
        const promise = Promise.resolve({ body: true });
        (promise as any).abort = jest.fn();
        return promise;
      }),
      create: jest.fn().mockImplementation(() => {
        const promise = Promise.resolve({ body: {} });
        (promise as any).abort = jest.fn();
        return promise;
      }),
    } as any;

    mockOpensearchClient.index = jest.fn().mockImplementation(() => {
      const promise = Promise.resolve({
        body: {
          _id: 'test-id',
          _index: 'ctrf-reports',
          result: 'created',
        },
      });
      (promise as any).abort = jest.fn();
      return promise;
    }) as jest.Mock;

    mockOpensearchClient.search = jest.fn().mockImplementation(() => {
      const promise = Promise.resolve({
        body: {
          hits: {
            total: { value: 1 },
            hits: [
              {
                _id: 'test-report-id',
                _source: generateCtrfReport(),
              },
            ],
          },
        },
      });
      (promise as any).abort = jest.fn();
      return promise;
    }) as jest.Mock;
  });

  describe('POST /api/test-reports', () => {
    it('should store a valid CTRF report successfully', async () => {
      const ctrfReport = generateCtrfReport();
      const req = mockReq({
        method: 'POST',
        body: ctrfReport,
      });
      const res = mockRes();

      await testReportsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        id: expect.any(String),
        message: 'CTRF report stored successfully',
        summary: {
          tests: ctrfReport.results.summary.tests,
          passed: ctrfReport.results.summary.passed,
          failed: ctrfReport.results.summary.failed,
          skipped: ctrfReport.results.summary.skipped,
          pending: ctrfReport.results.summary.pending,
          other: ctrfReport.results.summary.other,
        },
      });
      expect(mockOpensearchClient.index).toHaveBeenCalledWith({
        index: 'ctrf-reports',
        id: expect.any(String),
        body: expect.objectContaining({
          reportFormat: 'CTRF',
          specVersion: '1.0.0',
          storedAt: expect.any(String),
        }),
        refresh: true,
      });
    });

    it('should handle minimal CTRF report', async () => {
      const minimalReport = generateMinimalCtrfReport();
      const req = mockReq({
        method: 'POST',
        body: minimalReport,
      });
      const res = mockRes();

      await testReportsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          id: expect.any(String),
          message: 'CTRF report stored successfully',
        })
      );
    });

    it('should auto-generate reportId and timestamp if missing', async () => {
      const reportWithoutMetadata = generateCtrfReport();
      delete reportWithoutMetadata.reportId;
      delete reportWithoutMetadata.timestamp;

      const req = mockReq({
        method: 'POST',
        body: reportWithoutMetadata,
      });
      const res = mockRes();

      await testReportsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockOpensearchClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            reportId: expect.any(String),
            timestamp: expect.any(String),
            storedAt: expect.any(String),
          }),
        })
      );
    });

    it('should reject invalid CTRF report with validation error', async () => {
      const invalidReport = generateInvalidCtrfReport();
      const req = mockReq({
        method: 'POST',
        body: invalidReport,
      });
      const res = mockRes();

      await testReportsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'CTRF report validation failed',
        details: expect.any(Array),
      });
    });

    it('should handle OpenSearch connection errors', async () => {
      (mockOpensearchClient.index as jest.Mock).mockImplementationOnce(() => {
        const promise = Promise.reject(new Error('ECONNREFUSED'));
        (promise as any).abort = jest.fn();
        return promise;
      });

      const ctrfReport = generateCtrfReport();
      const req = mockReq({
        method: 'POST',
        body: ctrfReport,
      });
      const res = mockRes();

      await testReportsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'OpenSearch service unavailable',
      });
    });

    it('should handle generic errors', async () => {
      (mockOpensearchClient.index as jest.Mock).mockImplementationOnce(() => {
        const promise = Promise.reject(new Error('Generic error'));
        (promise as any).abort = jest.fn();
        return promise;
      });

      const ctrfReport = generateCtrfReport();
      const req = mockReq({
        method: 'POST',
        body: ctrfReport,
      });
      const res = mockRes();

      await testReportsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to store CTRF report',
        details: 'Generic error',
      });
    });
  });

  describe('GET /api/test-reports', () => {
    it('should retrieve CTRF reports successfully', async () => {
      const req = mockReq({
        method: 'GET',
        query: { page: '1', size: '10' },
      });
      const res = mockRes();

      await testReportsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        reports: expect.any(Array),
        total: 1,
      });
      expect(mockOpensearchClient.search).toHaveBeenCalledWith({
        index: 'ctrf-reports',
        body: {
          query: { match_all: {} },
          sort: [{ storedAt: { order: 'desc' } }],
          from: 0,
          size: 10,
        },
      });
    });

    it('should handle query filters for status', async () => {
      const req = mockReq({
        method: 'GET',
        query: { status: 'failed' },
      });
      const res = mockRes();

      await testReportsHandler(req, res);

      expect(mockOpensearchClient.search).toHaveBeenCalledWith({
        index: 'ctrf-reports',
        body: {
          query: {
            bool: {
              must: [
                {
                  nested: {
                    path: 'results.tests',
                    query: {
                      term: { 'results.tests.status': 'failed' },
                    },
                  },
                },
              ],
            },
          },
          sort: [{ storedAt: { order: 'desc' } }],
          from: 0,
          size: 20,
        },
      });
    });

    it('should handle query filters for tool and environment', async () => {
      const req = mockReq({
        method: 'GET',
        query: { tool: 'Jest', environment: 'CI' },
      });
      const res = mockRes();

      await testReportsHandler(req, res);

      expect(mockOpensearchClient.search).toHaveBeenCalledWith({
        index: 'ctrf-reports',
        body: {
          query: {
            bool: {
              must: [
                { term: { 'results.tool.name': 'Jest' } },
                { term: { 'results.environment.testEnvironment': 'CI' } },
              ],
            },
          },
          sort: [{ storedAt: { order: 'desc' } }],
          from: 0,
          size: 20,
        },
      });
    });

    it('should handle pagination parameters', async () => {
      const req = mockReq({
        method: 'GET',
        query: { page: '3', size: '50' },
      });
      const res = mockRes();

      await testReportsHandler(req, res);

      expect(mockOpensearchClient.search).toHaveBeenCalledWith({
        index: 'ctrf-reports',
        body: {
          query: { match_all: {} },
          sort: [{ storedAt: { order: 'desc' } }],
          from: 100,
          size: 50,
        },
      });
    });

    it('should limit maximum page size', async () => {
      const req = mockReq({
        method: 'GET',
        query: { size: '200' },
      });
      const res = mockRes();

      await testReportsHandler(req, res);

      expect(mockOpensearchClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            size: 100,
          }),
        })
      );
    });

    it('should handle OpenSearch connection errors for GET', async () => {
      (mockOpensearchClient.search as jest.Mock).mockImplementationOnce(() => {
        const promise = Promise.reject(new Error('ECONNREFUSED'));
        (promise as any).abort = jest.fn();
        return promise;
      });

      const req = mockReq({
        method: 'GET',
        query: {}, // Add empty query object to prevent undefined.page error
      });
      const res = mockRes();

      await testReportsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'OpenSearch service unavailable',
      });
    });
  });

  describe('Method validation', () => {
    it('should reject unsupported HTTP methods', async () => {
      const req = mockReq({
        method: 'DELETE',
      });
      const res = mockRes();

      await testReportsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(405);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Method not allowed. Supported methods: POST, GET',
      });
    });
  });

  describe('Index creation', () => {
    it('should create OpenSearch index if it does not exist', async () => {
      (mockOpensearchClient.indices.exists as jest.Mock).mockImplementationOnce(() => {
        const promise = Promise.resolve({ body: false });
        (promise as any).abort = jest.fn();
        return promise;
      });

      const ctrfReport = generateCtrfReport();
      const req = mockReq({
        method: 'POST',
        body: ctrfReport,
      });
      const res = mockRes();

      await testReportsHandler(req, res);

      expect(mockOpensearchClient.indices.create).toHaveBeenCalledWith({
        index: 'ctrf-reports',
        body: {
          mappings: expect.objectContaining({
            properties: expect.objectContaining({
              reportId: { type: 'keyword' },
              reportFormat: { type: 'keyword' },
              'results.summary.tests': { type: 'integer' },
              'results.tests': expect.objectContaining({
                type: 'nested',
              }),
            }),
          }),
        },
      });
    });
  });
});
