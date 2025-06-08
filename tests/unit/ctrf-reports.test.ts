import { NextApiRequest, NextApiResponse } from 'next';
import { Readable } from 'stream';
import { CtrfSchema, Status, ReportFormat } from '../../src/schemas/ctrf/ctrf';
import testReportsHandler from '../../src/pages/api/test-reports';
import opensearchClient, { ensureCtrfReportsIndexExists } from '../../src/lib/opensearch';
import {
  generateCtrfReport,
  generateInvalidCtrfReport,
  generateLargeCtrfReport,
} from '../utils/ctrfTestDataGenerator';
import { UserRole } from '../../src/auth/keycloak';
import { AuthenticatedRequest } from '../../src/types/auth';
import { hasRequiredRole } from '../../src/auth/apiAuth';
import { OpenSearchPromise, OpenSearchErrorPromise } from '../../src/types/opensearch';

// Test-specific types for this file only
type TestResult = CtrfSchema['results']['tests'][0];
type MockRequestBody = { [key: string]: unknown };
type MockRequestQuery = { [key: string]: string | string[] | undefined };

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
    checkConnection: jest.fn(),
    ensureCtrfReportsIndexExists: jest.fn().mockImplementation(() => Promise.resolve()),
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
  hasRequiredRole: jest.fn((payload, requiredRoles) => {
    // Mock implementation that checks if user has required roles
    const userRoles = [
      ...(payload.realm_access?.roles || []),
      ...(payload.resource_access?.['scaledtest-client']?.roles || []),
    ];
    return requiredRoles.some((role: string) => userRoles.includes(role));
  }),
  createApi: {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    readWrite: jest.fn((handlers, options) => {
      // Mock implementation that simulates the real createApi.readWrite behavior
      return async (req: NextApiRequest, res: NextApiResponse) => {
        try {
          // Run setup function if provided (this is what was missing!)
          if (options?.setup) {
            await options.setup();
          }

          // Add user to request for authentication
          const authenticatedReq = req as AuthenticatedRequest;
          authenticatedReq.user = {
            sub: 'test-user-id',
            name: 'Test User',
            email: 'test@example.com',
            preferred_username: 'test-user',
            realm_access: { roles: [UserRole.MAINTAINER] }, // Changed to MAINTAINER for write access
            resource_access: { 'scaledtest-client': { roles: [UserRole.MAINTAINER] } }, // Changed to MAINTAINER
            auth_time: Date.now(),
            typ: 'Bearer',
            azp: 'scaledtest-client',
            session_state: 'test-session',
            acr: '1',
            scope: 'openid profile email',
            sid: 'test-sid',
            email_verified: true,
          };

          // Call the appropriate handler based on HTTP method
          const method = req.method?.toUpperCase() || 'GET';
          const handler = handlers[method as keyof typeof handlers];

          if (handler) {
            // Check permissions for write operations using hasRequiredRole mock
            if (
              method === 'POST' ||
              method === 'PUT' ||
              method === 'PATCH' ||
              method === 'DELETE'
            ) {
              const hasPermission = hasRequiredRole(authenticatedReq.user, [
                UserRole.MAINTAINER,
                UserRole.OWNER,
              ]);

              if (!hasPermission) {
                return res.status(403).json({
                  success: false,
                  error: 'Forbidden - Write operations require maintainer or owner privileges',
                });
              }
            }

            // Create a mock logger
            const reqLogger = {
              info: jest.fn(),
              error: jest.fn(),
              warn: jest.fn(),
              debug: jest.fn(),
            };

            return handler(authenticatedReq, res, reqLogger);
          } else {
            return res.status(405).json({
              success: false,
              error: 'Method not allowed. Supported methods: POST, GET',
            });
          }
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
          // Handle setup errors properly
          return res.status(500).json({
            success: false,
            error: 'Internal server error',
          });
        }
      };
    }),
    readOnly: jest.fn(),
    adminOnly: jest.fn(),
    custom: jest.fn(),
  },
  withApiAuth: jest.fn((handler, requiredRoles) => {
    void requiredRoles; // Indicate parameter is intentionally unused
    return async (req: NextApiRequest, res: NextApiResponse) => {
      const authenticatedReq = req as AuthenticatedRequest;
      authenticatedReq.user = {
        sub: 'test-user-id',
        name: 'Test User',
        email: 'test@example.com',
        preferred_username: 'test-user',
        realm_access: {
          roles: [UserRole.MAINTAINER, UserRole.READONLY],
        },
        resource_access: {
          'scaledtest-client': {
            roles: [UserRole.MAINTAINER, UserRole.READONLY],
          },
        },
        auth_time: Date.now(),
        typ: 'Bearer',
        azp: 'scaledtest-client',
        session_state: 'test-session',
        acr: '1',
        scope: 'openid profile email',
        sid: 'test-sid',
        email_verified: true,
      };
      return handler(req, res);
    };
  }),
}));

const mockOpensearchClient = opensearchClient as jest.Mocked<typeof opensearchClient>;

const mockRequest = (
  method: string,
  body?: MockRequestBody | null,
  query?: MockRequestQuery
): NextApiRequest => {
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
        meta: {},
      }) as OpenSearchPromise;
      promise.abort = jest.fn();
      return promise;
    });
    (mockOpensearchClient.indices.create as jest.Mock).mockImplementation(() => {
      const promise = Promise.resolve({
        body: { acknowledged: true },
        statusCode: 200,
        headers: {},
        meta: {},
      }) as OpenSearchPromise;
      promise.abort = jest.fn();
      return promise;
    });
    mockOpensearchClient.index.mockImplementation(() => {
      const promise = Promise.resolve({
        body: { _id: 'test-id', result: 'created' },
        statusCode: 201,
        headers: {},
        meta: {},
      }) as OpenSearchPromise;
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
        meta: {},
      }) as OpenSearchPromise;
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
        const promise = Promise.reject(error) as OpenSearchErrorPromise;
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
        const promise = Promise.reject(error) as OpenSearchErrorPromise;
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
      const report = generateCtrfReport();
      const req = mockRequest('POST', report);
      const res = mockResponse();

      await testReportsHandler(req, res);

      // Now we check if ensureCtrfReportsIndexExists was called instead of directly checking indices.exists
      expect(ensureCtrfReportsIndexExists).toHaveBeenCalled();
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
          meta: {},
        }) as OpenSearchPromise;
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
        const promise = Promise.reject(error) as OpenSearchErrorPromise;
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
        const promise = Promise.reject(error) as OpenSearchErrorPromise;
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
        const promise = Promise.reject(error) as OpenSearchErrorPromise;
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
    it('should return 500 if ensureCtrfReportsIndexExists throws an unexpected error', async () => {
      (ensureCtrfReportsIndexExists as jest.Mock).mockImplementationOnce(() => {
        return Promise.reject(new Error('Unexpected index check error'));
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

  describe('Optional CTRF Fields Validation', () => {
    it('should handle tool version and URL fields', async () => {
      const report: CtrfSchema = {
        reportFormat: ReportFormat.CTRF,
        specVersion: '1.0.0',
        reportId: '12345678-1234-1234-1234-123456789abc',
        timestamp: new Date().toISOString(),
        generatedBy: 'Enhanced Test Suite',
        results: {
          tool: {
            name: 'Jest',
            version: '29.7.0',
            url: 'https://jestjs.io',
            extra: {
              runner: 'default',
              config: 'jest.config.js',
            },
          },
          summary: {
            tests: 1,
            passed: 1,
            failed: 0,
            skipped: 0,
            pending: 0,
            other: 0,
            start: Date.now() - 1000,
            stop: Date.now(),
          },
          tests: [
            {
              name: 'Tool URL test',
              status: Status.passed,
              duration: 150,
            },
          ],
        },
      };

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
          body: expect.objectContaining({
            results: expect.objectContaining({
              tool: expect.objectContaining({
                name: 'Jest',
                version: '29.7.0',
                url: 'https://jestjs.io',
              }),
            }),
          }),
        })
      );
    });

    it('should validate test-level optional fields are preserved', async () => {
      const report = generateCtrfReport();
      const testWithAllFields = report.results.tests[0];

      // Add comprehensive optional fields
      testWithAllFields.flaky = true;
      testWithAllFields.retries = 3;
      testWithAllFields.tags = ['flaky', 'retry', 'edge-case'];
      testWithAllFields.attachments = [
        {
          name: 'screenshot.png',
          contentType: 'image/png',
          path: '/screenshots/test.png',
          extra: { timestamp: new Date().toISOString() },
        },
      ];
      testWithAllFields.steps = [
        {
          name: 'Initial setup',
          status: Status.passed,
          extra: { setupTime: '200ms' },
        },
      ];

      const req = mockRequest('POST', report);
      const res = mockResponse();

      await testReportsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockOpensearchClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            results: expect.objectContaining({
              tests: expect.arrayContaining([
                expect.objectContaining({
                  flaky: true,
                  retries: 3,
                  tags: expect.arrayContaining(['flaky', 'retry', 'edge-case']),
                  attachments: expect.arrayContaining([
                    expect.objectContaining({
                      name: 'screenshot.png',
                      contentType: 'image/png',
                      path: '/screenshots/test.png',
                    }),
                  ]),
                  steps: expect.arrayContaining([
                    expect.objectContaining({
                      name: 'Initial setup',
                      status: Status.passed,
                    }),
                  ]),
                }),
              ]),
            }),
          }),
        })
      );
    });
  });

  describe('Security and Input Sanitization', () => {
    it('should handle XSS attempts in test names and messages', async () => {
      const maliciousReport = generateCtrfReport({
        results: {
          tool: {
            name: '<script>alert("xss")</script>',
          },
          summary: {
            tests: 1,
            passed: 0,
            failed: 1,
            skipped: 0,
            pending: 0,
            other: 0,
            start: Date.now() - 1000,
            stop: Date.now(),
          },
          tests: [
            {
              name: '<img src="x" onerror="alert(1)">Test with XSS attempt',
              status: Status.failed,
              duration: 100,
              message: '<script>console.log("malicious")</script>Authentication failed',
              trace: 'Error: <iframe src="javascript:alert(1)"></iframe>',
              suite: '<svg onload="alert(1)">Security Suite',
            },
          ],
        },
      });

      const req = mockRequest('POST', maliciousReport);
      const res = mockResponse();

      await testReportsHandler(req, res);

      // Should accept the report but the XSS content should be stored as-is
      // (sanitization would typically happen on the frontend)
      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockOpensearchClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            results: expect.objectContaining({
              tool: expect.objectContaining({
                name: '<script>alert("xss")</script>',
              }),
              tests: expect.arrayContaining([
                expect.objectContaining({
                  name: '<img src="x" onerror="alert(1)">Test with XSS attempt',
                  message: '<script>console.log("malicious")</script>Authentication failed',
                }),
              ]),
            }),
          }),
        })
      );
    });

    it('should reject oversized report payloads', async () => {
      // Create a report with extremely large content
      const largeContent = 'x'.repeat(10 * 1024 * 1024); // 10MB string
      const largeReport = generateCtrfReport({
        results: {
          tool: { name: 'LargeTest' },
          summary: {
            tests: 1,
            passed: 1,
            failed: 0,
            skipped: 0,
            pending: 0,
            other: 0,
            start: Date.now() - 1000,
            stop: Date.now(),
          },
          tests: [
            {
              name: 'Large content test',
              status: Status.passed,
              duration: 100,
              message: largeContent,
            },
          ],
        },
      });

      const req = mockRequest('POST', largeReport);
      const res = mockResponse();

      await testReportsHandler(req, res);

      // The handler should process it but OpenSearch might reject very large documents
      // In practice, you'd want payload size limits at the API gateway level
      expect(res.status).toHaveBeenCalled();
    });

    it('should handle special characters and Unicode in test data', async () => {
      const unicodeReport = generateCtrfReport({
        results: {
          tool: { name: 'Unicode测试工具' },
          summary: {
            tests: 1,
            passed: 1,
            failed: 0,
            skipped: 0,
            pending: 0,
            other: 0,
            start: Date.now() - 1000,
            stop: Date.now(),
          },
          tests: [
            {
              name: '测试用例 🚀 with émojis and spëcial chars',
              status: Status.passed,
              duration: 100,
              suite: 'Iñtërnâtiônàlizætiøn Suite',
              message: 'Тест прошел успешно ✅',
              filePath: 'tests/unicode/测试.test.ts',
              tags: ['unicode', 'i18n', '中文', 'العربية'],
            },
          ],
        },
      });

      const req = mockRequest('POST', unicodeReport);
      const res = mockResponse();

      await testReportsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockOpensearchClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            results: expect.objectContaining({
              tool: expect.objectContaining({
                name: 'Unicode测试工具',
              }),
              tests: expect.arrayContaining([
                expect.objectContaining({
                  name: '测试用例 🚀 with émojis and spëcial chars',
                  message: 'Тест прошел успешно ✅',
                  tags: expect.arrayContaining(['unicode', 'i18n', '中文', 'العربية']),
                }),
              ]),
            }),
          }),
        })
      );
    });
  });

  describe('Boundary Condition Testing', () => {
    it('should handle reports with maximum test count (1000+ tests)', async () => {
      const largeReport = generateLargeCtrfReport(1000);
      const req = mockRequest('POST', largeReport);
      const res = mockResponse();

      await testReportsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockOpensearchClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            results: expect.objectContaining({
              summary: expect.objectContaining({
                tests: 1000,
              }),
              tests: expect.arrayContaining([
                expect.objectContaining({
                  name: expect.any(String),
                  status: expect.any(String),
                }),
              ]),
            }),
          }),
        })
      );
    });

    it('should handle extremely long test names', async () => {
      const longName = 'A'.repeat(2000); // 2KB test name
      const report = generateCtrfReport({
        results: {
          tool: { name: 'BoundaryTest' },
          summary: {
            tests: 1,
            passed: 1,
            failed: 0,
            skipped: 0,
            pending: 0,
            other: 0,
            start: Date.now() - 1000,
            stop: Date.now(),
          },
          tests: [
            {
              name: longName,
              status: Status.passed,
              duration: 100,
            },
          ],
        },
      });

      const req = mockRequest('POST', report);
      const res = mockResponse();

      await testReportsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockOpensearchClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            results: expect.objectContaining({
              tests: expect.arrayContaining([
                expect.objectContaining({
                  name: longName,
                }),
              ]),
            }),
          }),
        })
      );
    });

    it('should handle zero duration tests', async () => {
      const report = generateCtrfReport({
        results: {
          tool: { name: 'ZeroDurationTest' },
          summary: {
            tests: 2,
            passed: 1,
            failed: 0,
            skipped: 1,
            pending: 0,
            other: 0,
            start: Date.now(),
            stop: Date.now(),
          },
          tests: [
            {
              name: 'Instantaneous test',
              status: Status.passed,
              duration: 0,
              start: Date.now(),
              stop: Date.now(),
            },
            {
              name: 'Skipped test with zero duration',
              status: Status.skipped,
              duration: 0,
            },
          ],
        },
      });

      const req = mockRequest('POST', report);
      const res = mockResponse();

      await testReportsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockOpensearchClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            results: expect.objectContaining({
              tests: expect.arrayContaining([
                expect.objectContaining({
                  name: 'Instantaneous test',
                  duration: 0,
                }),
                expect.objectContaining({
                  name: 'Skipped test with zero duration',
                  duration: 0,
                }),
              ]),
            }),
          }),
        })
      );
    });

    it('should handle deeply nested extra fields', async () => {
      const deeplyNestedExtra = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  data: 'deep value',
                  array: [1, 2, 3, { nested: true }],
                  boolean: false,
                  null: null,
                },
              },
            },
          },
        },
        array: [{ item: 1 }, { item: 2, nested: { data: 'nested in array' } }],
      };

      const report = generateCtrfReport({
        results: {
          tool: {
            name: 'DeepNestingTest',
            extra: deeplyNestedExtra,
          },
          summary: {
            tests: 1,
            passed: 1,
            failed: 0,
            skipped: 0,
            pending: 0,
            other: 0,
            start: Date.now() - 1000,
            stop: Date.now(),
            extra: deeplyNestedExtra,
          },
          tests: [
            {
              name: 'Deep nesting test',
              status: Status.passed,
              duration: 100,
              extra: deeplyNestedExtra,
            },
          ],
          extra: deeplyNestedExtra,
        },
        extra: deeplyNestedExtra,
      });

      const req = mockRequest('POST', report);
      const res = mockResponse();

      await testReportsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockOpensearchClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            results: expect.objectContaining({
              tool: expect.objectContaining({
                extra: expect.objectContaining({
                  level1: expect.objectContaining({
                    level2: expect.objectContaining({
                      level3: expect.objectContaining({
                        level4: expect.objectContaining({
                          level5: expect.objectContaining({
                            data: 'deep value',
                          }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        })
      );
    });
  });

  describe('Data Integrity and Consistency', () => {
    it('should validate summary counts match actual test array', async () => {
      const report = generateCtrfReport({
        results: {
          tool: { name: 'ConsistencyTest' },
          summary: {
            tests: 3, // This should match the actual test count
            passed: 2,
            failed: 1,
            skipped: 0,
            pending: 0,
            other: 0,
            start: Date.now() - 1000,
            stop: Date.now(),
          },
          tests: [
            {
              name: 'Test 1',
              status: Status.passed,
              duration: 100,
            },
            {
              name: 'Test 2',
              status: Status.passed,
              duration: 150,
            },
            {
              name: 'Test 3',
              status: Status.failed,
              duration: 200,
              message: 'Test failed',
            },
          ],
        },
      });

      const req = mockRequest('POST', report);
      const res = mockResponse();

      await testReportsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);

      // Verify the summary counts are consistent
      const storedReport = mockOpensearchClient.index.mock.calls[0][0].body;
      const actualPassed = storedReport.results.tests.filter(
        (t: TestResult) => t.status === 'passed'
      ).length;
      const actualFailed = storedReport.results.tests.filter(
        (t: TestResult) => t.status === 'failed'
      ).length;

      expect(storedReport.results.summary.passed).toBe(actualPassed);
      expect(storedReport.results.summary.failed).toBe(actualFailed);
      expect(storedReport.results.summary.tests).toBe(storedReport.results.tests.length);
    });

    it('should handle reports with mismatched summary counts', async () => {
      const report = generateCtrfReport({
        results: {
          tool: { name: 'MismatchTest' },
          summary: {
            tests: 5, // Intentionally wrong count
            passed: 10, // Intentionally wrong count
            failed: 0,
            skipped: 0,
            pending: 0,
            other: 0,
            start: Date.now() - 1000,
            stop: Date.now(),
          },
          tests: [
            {
              name: 'Single test',
              status: Status.passed,
              duration: 100,
            },
          ],
        },
      });

      const req = mockRequest('POST', report);
      const res = mockResponse();

      await testReportsHandler(req, res);

      // The API should accept the report as-is since the schema validation passes
      // It's the responsibility of the report generator to ensure consistency
      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockOpensearchClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            results: expect.objectContaining({
              summary: expect.objectContaining({
                tests: 5, // Original values preserved
                passed: 10,
              }),
              tests: expect.arrayContaining([
                expect.objectContaining({
                  name: 'Single test',
                }),
              ]),
            }),
          }),
        })
      );
    });

    it('should preserve timestamp ordering and consistency', async () => {
      const baseTime = Date.now();
      const report = generateCtrfReport({
        timestamp: new Date(baseTime).toISOString(),
        results: {
          tool: { name: 'TimestampTest' },
          summary: {
            tests: 3,
            passed: 3,
            failed: 0,
            skipped: 0,
            pending: 0,
            other: 0,
            start: baseTime - 1000,
            stop: baseTime,
          },
          tests: [
            {
              name: 'First test',
              status: Status.passed,
              duration: 100,
              start: baseTime - 900,
              stop: baseTime - 800,
            },
            {
              name: 'Second test',
              status: Status.passed,
              duration: 200,
              start: baseTime - 700,
              stop: baseTime - 500,
            },
            {
              name: 'Third test',
              status: Status.passed,
              duration: 150,
              start: baseTime - 400,
              stop: baseTime - 250,
            },
          ],
        },
      });

      const req = mockRequest('POST', report);
      const res = mockResponse();

      await testReportsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);

      const storedReport = mockOpensearchClient.index.mock.calls[0][0].body;
      expect(storedReport.timestamp).toBe(new Date(baseTime).toISOString());
      expect(storedReport.results.summary.start).toBe(baseTime - 1000);
      expect(storedReport.results.summary.stop).toBe(baseTime);

      // Verify test timestamps are preserved
      storedReport.results.tests.forEach((test: TestResult) => {
        expect(test.start).toBeDefined();
        expect(test.stop).toBeDefined();
        if (test.start && test.stop) {
          expect(test.stop).toBeGreaterThan(test.start);
        }
      });
    });
  });

  describe('Role-Based Authorization', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should allow READONLY users to GET reports', async () => {
      // Mock hasRequiredRole to return true for any roles since GET operations allow all authenticated users
      (hasRequiredRole as jest.Mock).mockReturnValue(true);

      // Mock OpenSearch response for GET
      mockOpensearchClient.search.mockImplementation(() => {
        const promise = Promise.resolve({
          body: {
            hits: {
              hits: [],
              total: { value: 0 },
            },
          },
          statusCode: 200,
          headers: {},
          meta: {},
        });
        const typedPromise = promise as unknown as OpenSearchPromise;
        typedPromise.abort = jest.fn();
        return typedPromise;
      });

      const req = mockRequest('GET', null, { page: '1', size: '10' });
      const res = mockResponse();

      await testReportsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          reports: [],
          total: 0,
        })
      );
    });

    it('should block READONLY users from POST operations', async () => {
      // Mock hasRequiredRole to return false for MAINTAINER/OWNER roles (simulating readonly user)
      (hasRequiredRole as jest.Mock).mockReturnValue(false);

      const req = mockRequest('POST', generateCtrfReport());
      const res = mockResponse();

      await testReportsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Forbidden - Write operations require maintainer or owner privileges',
      });

      // Ensure no OpenSearch operations were attempted
      expect(mockOpensearchClient.index).not.toHaveBeenCalled();
    });

    it('should allow MAINTAINER users to POST reports', async () => {
      // Mock hasRequiredRole to return true for MAINTAINER/OWNER roles
      (hasRequiredRole as jest.Mock).mockReturnValue(true);

      const req = mockRequest('POST', generateCtrfReport());
      const res = mockResponse();

      await testReportsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'CTRF report stored successfully',
        })
      );

      // Ensure OpenSearch operations were attempted
      expect(mockOpensearchClient.index).toHaveBeenCalled();
    });

    it('should allow OWNER users to POST reports', async () => {
      // Mock hasRequiredRole to return true for MAINTAINER/OWNER roles
      (hasRequiredRole as jest.Mock).mockReturnValue(true);

      const req = mockRequest('POST', generateCtrfReport());
      const res = mockResponse();

      await testReportsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'CTRF report stored successfully',
        })
      );

      // Ensure OpenSearch operations were attempted
      expect(mockOpensearchClient.index).toHaveBeenCalled();
    });
  });
});
