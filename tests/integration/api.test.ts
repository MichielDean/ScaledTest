import { NextApiRequest, NextApiResponse } from 'next';
import { generateCtrfReport } from '../data/ctrfReportGenerator';

// Mock Better Auth modules to avoid ES module issues
jest.mock('better-auth/react', () => ({
  createAuthClient: jest.fn(() => ({
    signIn: { email: jest.fn() },
    signOut: jest.fn(),
    getSession: jest.fn(),
  })),
}));

jest.mock('better-auth/client/plugins', () => ({
  adminClient: jest.fn(),
}));

// Mock Better Auth client
jest.mock('../../src/lib/auth', () => ({
  auth: {
    api: {
      getSession: jest.fn().mockResolvedValue({
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'owner',
        },
        session: {
          id: 'session-123',
          userId: 'user-123',
          token: 'mock-token',
        },
      }),
    },
  },
}));

// Mock TimescaleDB for integration tests
jest.mock('../../src/lib/timescaledb', () => ({
  storeCtrfReport: jest.fn().mockResolvedValue({
    success: true,
    reportId: 'test-report-id',
  }),
  searchCtrfReports: jest.fn().mockResolvedValue({
    reports: [],
    total: 0,
  }),
}));

// Mock team management for integration tests
jest.mock('../../src/lib/teamManagement', () => ({
  getUserTeams: jest.fn().mockResolvedValue([{ id: 'team-1', name: 'Test Team' }]),
}));

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
      'content-type': 'application/json',
    },
    env: { NODE_ENV: 'test' },
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
      const testReport = generateCtrfReport();

      const { res } = await runHandlerTest(ctrfReportsHandler, 'POST', testReport);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'CTRF report stored successfully',
        })
      );
      // TimescaleDB is now the primary and only storage method
      // The API should respond successfully
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
      // TimescaleDB is now available in integration tests, so API should return data
      const { res } = await runHandlerTest(ctrfReportsHandler, 'GET', undefined, {
        page: '1',
        size: '10',
      });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.any(Array),
          total: expect.any(Number),
          pagination: expect.objectContaining({
            page: 1,
            size: 10,
            total: expect.any(Number),
          }),
        })
      );
    });

    it('should apply filters when getting CTRF reports', async () => {
      // TimescaleDB is now available in integration tests, so API should return filtered data
      const { res } = await runHandlerTest(ctrfReportsHandler, 'GET', undefined, {
        page: '1',
        size: '10',
        status: 'failed',
        tool: 'jest',
        environment: 'production',
      });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.any(Array),
          total: expect.any(Number),
          pagination: expect.objectContaining({
            page: 1,
            size: 10,
            total: expect.any(Number),
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
          error: 'Method PUT not allowed',
        })
      );
    });
  });
});
