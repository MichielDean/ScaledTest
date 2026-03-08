/**
 * Tests for GET /api/v1/executions/:id — execution detail with pod progress
 *
 * TDD: written BEFORE implementation per project convention.
 *
 * Covers acceptance criteria from SCA-10:
 * - Returns full TestExecution for :id
 * - Includes linkedReportIds: string[]
 * - Pod counts: totalPods, completedPods, failedPods, activePods (derived)
 * - Auth: any authenticated user
 * - 404 with structured error if not found
 * - UUID validation on :id → 400 on invalid
 * - Unit + integration tests
 */
import type { NextApiRequest, NextApiResponse } from 'next';

// Mock auth — must come before any imports
jest.mock('../../src/lib/auth', () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
}));

// Mock executions module — spread jest.requireActual so untouched exports use real implementations.
// Only getExecutionDetail is overridden; everything else falls through to the actual module.
const mockGetExecutionDetail = jest.fn();
jest.mock('../../src/lib/executions', () => {
  const actual = jest.requireActual('../../src/lib/executions');
  return {
    ...actual,
    getExecutionDetail: mockGetExecutionDetail,
  };
});

// Mock logger
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

import { auth } from '../../src/lib/auth';

const mockGetSession = auth.api.getSession as unknown as jest.Mock;

/** Valid UUID v4 for test use */
const VALID_UUID = 'a1b2c3d4-e5f6-4789-abcd-ef1234567890';
const VALID_REPORT_UUID_1 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const VALID_REPORT_UUID_2 = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';

function makeReqRes(
  method: string,
  query: Record<string, string> = {},
  headers: Record<string, string> = {}
) {
  const mockJson = jest.fn();
  const mockStatus = jest.fn().mockReturnValue({ json: mockJson, end: jest.fn() });

  const req = {
    method,
    body: {},
    query,
    headers: { authorization: 'Bearer test-token', ...headers },
  } as unknown as NextApiRequest;

  const res = {
    status: mockStatus,
    json: mockJson,
    setHeader: jest.fn(),
  } as unknown as NextApiResponse;

  return { req, res, mockJson, mockStatus };
}

function setupAuthUser(role: 'owner' | 'maintainer' | 'readonly') {
  mockGetSession.mockResolvedValue({
    user: { id: 'user-1', email: 'test@example.com', name: 'Test', role },
  });
}

const fakeExecutionDetail = {
  id: VALID_UUID,
  status: 'running' as const,
  dockerImage: 'node:20',
  testCommand: 'npm test',
  parallelism: 4,
  environmentVars: {},
  resourceLimits: {},
  requestedBy: 'user-1',
  teamId: null,
  startedAt: '2024-01-01T00:00:00.000Z',
  completedAt: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:01:00.000Z',
  kubernetesJobName: 'job-abc',
  kubernetesNamespace: 'scaledtest',
  errorMessage: null,
  totalPods: 4,
  completedPods: 2,
  failedPods: 0,
  activePods: 2, // derived: totalPods - completedPods - failedPods
  linkedReportIds: [VALID_REPORT_UUID_1, VALID_REPORT_UUID_2],
};

describe('GET /api/v1/executions/:id', () => {
  let handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

  beforeAll(async () => {
    const mod = await import('../../src/pages/api/v1/executions/[id]');
    handler = mod.default;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---- Auth ----

  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null);
    const { req, res, mockStatus } = makeReqRes('GET', { id: VALID_UUID });

    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(401);
  });

  it('returns 200 for readonly user (any authenticated user is allowed)', async () => {
    setupAuthUser('readonly');
    mockGetExecutionDetail.mockResolvedValue(fakeExecutionDetail);
    const { req, res, mockJson } = makeReqRes('GET', { id: VALID_UUID });

    await handler(req, res);

    expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  // ---- UUID validation ----

  it('returns 400 for non-UUID id param', async () => {
    setupAuthUser('readonly');
    const { req, res, mockStatus, mockJson } = makeReqRes('GET', { id: 'not-a-uuid' });

    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('Invalid') })
    );
  });

  it('returns 400 when id is empty string', async () => {
    setupAuthUser('readonly');
    const { req, res, mockStatus } = makeReqRes('GET', { id: '' });

    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(400);
  });

  it('returns 400 when id contains injection chars', async () => {
    setupAuthUser('readonly');
    const { req, res, mockStatus } = makeReqRes('GET', { id: "' OR 1=1--" });

    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(400);
  });

  // ---- Not found ----

  it('returns 404 with structured error when execution not found', async () => {
    setupAuthUser('maintainer');
    mockGetExecutionDetail.mockResolvedValue(null);
    const { req, res, mockStatus, mockJson } = makeReqRes('GET', { id: VALID_UUID });

    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(404);
    expect(mockJson).toHaveBeenCalledWith({
      success: false,
      error: 'Execution not found',
    });
  });

  // ---- Success: full TestExecution + pod progress + linkedReportIds ----

  it('returns 200 with full execution detail including linkedReportIds and activePods', async () => {
    setupAuthUser('maintainer');
    mockGetExecutionDetail.mockResolvedValue(fakeExecutionDetail);
    const { req, res, mockJson } = makeReqRes('GET', { id: VALID_UUID });

    await handler(req, res);

    expect(mockJson).toHaveBeenCalledWith({
      success: true,
      data: fakeExecutionDetail,
    });
  });

  it('response data includes linkedReportIds array', async () => {
    setupAuthUser('owner');
    mockGetExecutionDetail.mockResolvedValue(fakeExecutionDetail);
    const { req, res, mockJson } = makeReqRes('GET', { id: VALID_UUID });

    await handler(req, res);

    const call = mockJson.mock.calls[0][0] as {
      success: boolean;
      data: typeof fakeExecutionDetail;
    };
    expect(Array.isArray(call.data.linkedReportIds)).toBe(true);
    expect(call.data.linkedReportIds).toEqual([VALID_REPORT_UUID_1, VALID_REPORT_UUID_2]);
  });

  it('response data includes pod counts including activePods', async () => {
    setupAuthUser('maintainer');
    mockGetExecutionDetail.mockResolvedValue(fakeExecutionDetail);
    const { req, res, mockJson } = makeReqRes('GET', { id: VALID_UUID });

    await handler(req, res);

    const call = mockJson.mock.calls[0][0] as {
      success: boolean;
      data: typeof fakeExecutionDetail;
    };
    expect(call.data.totalPods).toBe(4);
    expect(call.data.completedPods).toBe(2);
    expect(call.data.failedPods).toBe(0);
    expect(call.data.activePods).toBe(2); // 4 - 2 - 0
  });

  it('returns linkedReportIds as empty array when no reports linked', async () => {
    setupAuthUser('readonly');
    const noReportsExecution = { ...fakeExecutionDetail, linkedReportIds: [] };
    mockGetExecutionDetail.mockResolvedValue(noReportsExecution);
    const { req, res, mockJson } = makeReqRes('GET', { id: VALID_UUID });

    await handler(req, res);

    const call = mockJson.mock.calls[0][0] as { success: boolean; data: typeof noReportsExecution };
    expect(call.data.linkedReportIds).toEqual([]);
  });

  it('activePods equals totalPods when no pods have completed yet (activePods = 4 - 0 - 0 = 4)', async () => {
    setupAuthUser('readonly');
    const queuedExecution = {
      ...fakeExecutionDetail,
      status: 'queued' as const,
      totalPods: 4,
      completedPods: 0,
      failedPods: 0,
      // activePods = totalPods - completedPods - failedPods = 4 - 0 - 0 = 4
      activePods: 4,
    };
    mockGetExecutionDetail.mockResolvedValue(queuedExecution);
    const { req, res, mockJson } = makeReqRes('GET', { id: VALID_UUID });

    await handler(req, res);

    const call = mockJson.mock.calls[0][0] as { success: boolean; data: typeof queuedExecution };
    expect(call.data.activePods).toBe(4);
  });

  // ---- DB error ----

  it('returns 503 on database error', async () => {
    setupAuthUser('maintainer');
    mockGetExecutionDetail.mockRejectedValue(new Error('DB connection failed'));
    const { req, res, mockStatus } = makeReqRes('GET', { id: VALID_UUID });

    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(503);
  });

  // ---- Method not allowed for non-GET/DELETE ----

  it('returns 405 for POST method', async () => {
    setupAuthUser('maintainer');
    const { req, res, mockStatus } = makeReqRes('POST', { id: VALID_UUID });

    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(405);
  });
});
