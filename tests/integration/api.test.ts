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

// Mock executions module for execution detail integration tests
const mockGetExecutionDetail = jest.fn();
jest.mock('../../src/lib/executions', () => ({
  getExecutionDetail: mockGetExecutionDetail,
  createExecution: jest.fn(),
  listExecutions: jest.fn(),
  getExecution: jest.fn(),
  cancelExecution: jest.fn(),
  updateExecutionStatus: jest.fn(),
  recordExecutionResult: jest.fn(),
}));

// Mock logger for execution detail handler
jest.mock('../../src/logging/logger', () => ({
  apiLogger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
  dbLogger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
  logError: jest.fn(),
  getRequestLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  })),
}));

// Mock crypto for testing
const originalCrypto = global.crypto;
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: jest.fn(() => '00000000-0000-0000-0000-000000000000'),
  },
});

import ctrfReportsHandler from '../../src/pages/api/v1/reports/index';
import executionDetailHandler from '../../src/pages/api/v1/executions/[id]';

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

  describe('Execution Detail API (GET /api/v1/executions/:id)', () => {
    /** Valid UUID for integration tests */
    const VALID_UUID = 'a1b2c3d4-e5f6-4789-abcd-ef1234567890';
    const REPORT_UUID_1 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const REPORT_UUID_2 = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';

    /** Canonical execution detail fixture with activePods and linkedReportIds */
    const fakeExecutionDetail = {
      id: VALID_UUID,
      status: 'running' as const,
      dockerImage: 'my-image:latest',
      testCommand: 'npm test',
      parallelism: 3,
      environmentVars: {},
      resourceLimits: {},
      requestedBy: 'user-123',
      teamId: 'team-1',
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      kubernetesJobName: 'job-abc',
      kubernetesNamespace: 'default',
      errorMessage: null,
      totalPods: 3,
      completedPods: 1,
      failedPods: 0,
      // activePods = totalPods - completedPods - failedPods = 3 - 1 - 0 = 2
      activePods: 2,
      linkedReportIds: [REPORT_UUID_1, REPORT_UUID_2],
    };

    it('returns 200 with activePods and linkedReportIds for a valid UUID', async () => {
      mockGetExecutionDetail.mockResolvedValue(fakeExecutionDetail);
      const { res } = await runHandlerTest(executionDetailHandler, 'GET', undefined, {
        id: VALID_UUID,
      });

      expect(res.status).not.toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            id: VALID_UUID,
            activePods: 2,
            linkedReportIds: [REPORT_UUID_1, REPORT_UUID_2],
          }),
        })
      );
    });

    it('returns 400 when :id is not a valid UUID', async () => {
      const { res } = await runHandlerTest(executionDetailHandler, 'GET', undefined, {
        id: 'not-a-uuid',
      });

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
        })
      );
    });
  });
});
