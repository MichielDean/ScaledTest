import { NextApiRequest, NextApiResponse } from 'next';
import { generateCtrfReport } from '../data/ctrfReportGenerator';

// Mock dependencies first, before any imports that use them
jest.mock('keycloak-js', () => {
  return function () {
    return {};
  };
});

// Mock jose library
jest.mock('jose', () => ({
  jwtVerify: jest.fn().mockResolvedValue({
    payload: {
      sub: 'user-123',
      aud: 'scaledtest-client', // Add correct audience
      resource_access: {
        'scaledtest-client': {
          roles: ['owner', 'maintainer', 'readonly'],
        },
      },
    },
  }),
  createRemoteJWKSet: jest.fn().mockReturnValue('mocked-jwks'),
}));

// Mock OpenSearch client
const mockOpenSearchClient = {
  indices: {
    exists: jest.fn().mockResolvedValue({ body: true }),
    create: jest.fn().mockResolvedValue({ body: { acknowledged: true } }),
  },
  index: jest.fn().mockResolvedValue({
    body: { _id: '123', result: 'created' },
  }),
  search: jest.fn().mockResolvedValue({
    body: {
      hits: {
        hits: [],
        total: { value: 0 },
      },
    },
  }),
};

jest.mock('../../src/lib/opensearch', () => {
  return {
    __esModule: true,
    default: mockOpenSearchClient,
    ensureCtrfReportsIndexExists: jest.fn().mockResolvedValue(undefined),
  };
});

// Mock crypto for testing
const originalCrypto = global.crypto;
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: jest.fn(() => '00000000-0000-0000-0000-000000000000'),
  },
});

import ctrfReportsHandler from '../../src/pages/api/test-reports';

const mockReq = (
  method: string,
  body: Record<string, unknown> = {},
  query: Record<string, unknown> = {}
): NextApiRequest => {
  return {
    method,
    body,
    query,
    headers: {
      authorization: 'Bearer mock-token',
    },
  } as unknown as NextApiRequest;
};

const mockRes = (): NextApiResponse => {
  const res = {} as NextApiResponse;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// Helper to run a test with the API handler
const runHandlerTest = async (
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>,
  method: string,
  body?: Record<string, unknown>,
  query?: Record<string, unknown>
) => {
  const req = mockReq(method, body, query);
  const res = mockRes();
  await handler(req, res);
  return { req, res };
};

describe('API Endpoints', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    // Restore the original crypto
    Object.defineProperty(global, 'crypto', {
      value: originalCrypto,
    });
  });

  describe('CTRF Reports API', () => {
    it('should store a valid CTRF report via POST', async () => {
      const ctrfReport = generateCtrfReport();
      const { res } = await runHandlerTest(ctrfReportsHandler, 'POST', ctrfReport);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'CTRF report stored successfully',
        })
      );
      expect(mockOpenSearchClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'ctrf-reports',
          id: expect.any(String),
          body: expect.objectContaining({
            reportFormat: 'CTRF',
          }),
          refresh: true,
        })
      );
    });

    it('should validate CTRF report structure', async () => {
      const invalidReport = {
        // Missing required fields
        reportFormat: 'CTRF',
      };
      const { res } = await runHandlerTest(ctrfReportsHandler, 'POST', invalidReport);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'CTRF report validation failed',
        })
      );
    });

    it('should get CTRF reports via GET', async () => {
      mockOpenSearchClient.search.mockResolvedValueOnce({
        body: {
          hits: {
            hits: [
              {
                _id: '123',
                _source: generateCtrfReport(),
              },
            ],
            total: { value: 1 },
          },
        },
      });

      const { res } = await runHandlerTest(ctrfReportsHandler, 'GET', undefined, {
        page: '1',
        size: '10',
      });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.arrayContaining([expect.any(Object)]),
          total: 1,
        })
      );
      expect(mockOpenSearchClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'ctrf-reports',
        })
      );
    });

    it('should apply filters when getting CTRF reports', async () => {
      mockOpenSearchClient.search.mockResolvedValueOnce({
        body: {
          hits: {
            hits: [],
            total: { value: 0 },
          },
        },
      });

      await runHandlerTest(ctrfReportsHandler, 'GET', undefined, {
        page: '1',
        size: '10',
        status: 'failed',
        tool: 'jest',
        environment: 'production',
      });

      expect(mockOpenSearchClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            query: expect.objectContaining({
              bool: expect.objectContaining({
                filter: expect.arrayContaining([
                  expect.objectContaining({
                    nested: expect.objectContaining({
                      path: 'results.tests',
                      query: expect.objectContaining({
                        term: { 'results.tests.status': 'failed' },
                      }),
                    }),
                  }),
                  expect.objectContaining({
                    term: { 'results.tool.name': 'jest' },
                  }),
                  expect.objectContaining({
                    term: { 'results.environment.testEnvironment': 'production' },
                  }),
                ]),
              }),
            }),
          }),
        })
      );
    });

    it('should reject unsupported methods', async () => {
      const { res } = await runHandlerTest(ctrfReportsHandler, 'PUT', {});

      expect(res.status).toHaveBeenCalledWith(405);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Method not allowed. Supported methods: GET, POST',
        })
      );
    });
  });
});
