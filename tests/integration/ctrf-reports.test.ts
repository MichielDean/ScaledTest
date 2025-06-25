import { NextApiRequest, NextApiResponse } from 'next';
import {
  generateCtrfReport,
  generateMinimalCtrfReport,
  generateInvalidCtrfReport,
} from '../data/ctrfReportGenerator';
import { AuthenticatedRequest } from '../../src/auth/apiAuth';
import opensearchClient, { ensureCtrfReportsIndexExists } from '../../src/lib/opensearch';
// We need types from opensearch but use them implicitly
// No direct imports needed

// Type alias for promises with abort capability
// (similar to OpenSearchPromise but with jest mock)
type AbortablePromise<T> = Promise<T> & {
  abort: jest.Mock;
};

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
      const authenticatedReq = req as AuthenticatedRequest;
      authenticatedReq.user = {
        sub: 'user-123',
        auth_time: Date.now(),
        typ: 'Bearer',
        azp: 'scaledtest-client',
        session_state: 'test-session',
        acr: '1',
        realm_access: { roles: ['owner', 'maintainer', 'readonly'] },
        resource_access: {
          'scaledtest-client': {
            roles: ['owner', 'maintainer', 'readonly'],
          },
        },
        scope: 'openid profile email',
        sid: 'test-sid',
        email_verified: true,
        email: 'test@example.com',
        name: 'Test User',
        preferred_username: 'test-user',
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
        // Role is intentionally unused in this mock
        void role;
        if (typeof next === 'function') {
          return next();
        }
        return (handler: (req: NextApiRequest, res: NextApiResponse) => void) => handler(req, res);
      }
    ),
  createApi: {
    readWrite: jest.fn((handlers, options) => {
      return async (req: NextApiRequest, res: NextApiResponse) => {
        // Run setup if provided
        if (options?.setup) {
          await options.setup();
        }

        const authenticatedReq = req as AuthenticatedRequest;
        authenticatedReq.user = {
          sub: 'user-123',
          auth_time: Date.now(),
          typ: 'Bearer',
          azp: 'scaledtest-client',
          session_state: 'test-session',
          acr: '1',
          realm_access: { roles: ['owner', 'maintainer', 'readonly'] },
          resource_access: {
            'scaledtest-client': {
              roles: ['owner', 'maintainer', 'readonly'],
            },
          },
          scope: 'openid profile email',
          sid: 'test-sid',
          email_verified: true,
          email: 'test@example.com',
          name: 'Test User',
          preferred_username: 'test-user',
        };

        const method = req.method?.toUpperCase() || 'GET';
        const handler = handlers[method as keyof typeof handlers];

        if (handler) {
          const reqLogger = {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
          };
          return handler(authenticatedReq, res, reqLogger);
        } else {
          const supportedMethods = Object.keys(handlers).join(', ');
          return res.status(405).json({
            success: false,
            error: `Method not allowed. Supported methods: ${supportedMethods}`,
          });
        }
      };
    }),
  },
  withApiAuth: jest
    .fn()
    .mockImplementation(
      (handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>, roles?: string[]) => {
        // Roles parameter is intentionally unused in this mock
        void roles;
        return async (req: NextApiRequest, res: NextApiResponse) => {
          const authenticatedReq = req as AuthenticatedRequest;
          authenticatedReq.user = {
            sub: 'user-123',
            auth_time: Date.now(),
            typ: 'Bearer',
            azp: 'scaledtest-client',
            session_state: 'test-session',
            acr: '1',
            realm_access: { roles: ['owner', 'maintainer', 'readonly'] },
            resource_access: {
              'scaledtest-client': {
                roles: ['owner', 'maintainer', 'readonly'],
              },
            },
            scope: 'openid profile email',
            sid: 'test-sid',
            email_verified: true,
            email: 'test@example.com',
            name: 'Test User',
            preferred_username: 'test-user',
          };
          return handler(req, res);
        };
      }
    ),
}));

jest.mock('../../src/auth/keycloak', () => ({
  UserRole: {
    READONLY: 'readonly',
    MAINTAINER: 'maintainer',
    OWNER: 'owner',
  },
}));

import { getAuthToken } from '../authentication/tokenService';
import testReportsHandler from '../../src/pages/api/test-reports';

jest.mock('../authentication/tokenService');
jest.mock('../../src/lib/opensearch', () => {
  return {
    __esModule: true,
    ensureCtrfReportsIndexExists: jest.fn().mockImplementation(() => Promise.resolve()),
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
jest.mock('../../src/logging/logger', () => ({
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

    // Mock only the methods we need
    mockOpensearchClient.indices.exists = jest.fn().mockImplementation(() => {
      const promise = Promise.resolve({ body: true }) as AbortablePromise<{ body: boolean }>;
      promise.abort = jest.fn();
      return promise;
    });

    mockOpensearchClient.indices.create = jest.fn().mockImplementation(() => {
      const promise = Promise.resolve({ body: {} }) as AbortablePromise<{
        body: Record<string, unknown>;
      }>;
      promise.abort = jest.fn();
      return promise;
    });

    mockOpensearchClient.index = jest.fn().mockImplementation(() => {
      const promise = Promise.resolve({
        body: {
          _id: 'test-id',
          _index: 'ctrf-reports',
          result: 'created',
        },
      }) as AbortablePromise<{ body: { _id: string; _index: string; result: string } }>;
      promise.abort = jest.fn();
      return promise;
    });

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
      }) as AbortablePromise<{
        body: {
          hits: {
            total: { value: number };
            hits: Array<{ _id: string; _source: unknown }>;
          };
        };
      }>;
      promise.abort = jest.fn();
      return promise;
    });
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
        const promise = Promise.reject(new Error('ECONNREFUSED')) as AbortablePromise<never>;
        promise.abort = jest.fn();
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
        const promise = Promise.reject(new Error('Generic error')) as AbortablePromise<never>;
        promise.abort = jest.fn();
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
        const promise = Promise.reject(new Error('ECONNREFUSED')) as AbortablePromise<never>;
        promise.abort = jest.fn();
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
        error: 'Method not allowed. Supported methods: GET, POST',
      });
    });
  });

  describe('Index creation', () => {
    it('should create OpenSearch index if it does not exist', async () => {
      // Check that the ensureCtrfReportsIndexExists function is called during the test
      const ctrfReport = generateCtrfReport();
      const req = mockReq({
        method: 'POST',
        body: ctrfReport,
      });
      const res = mockRes();

      await testReportsHandler(req, res);

      // Check that the function was called to ensure the index exists
      expect(ensureCtrfReportsIndexExists).toHaveBeenCalled();
    });
  });
});
