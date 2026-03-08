/**
 * Tests for POST /api/v1/executions/:id/results
 *
 * TDD: written BEFORE implementation per project convention.
 *
 * Covers acceptance criteria from SCA-9:
 * - 200 success: stores report, links execution_id, increments completedPods, returns { success: true, reportId }
 * - 400: invalid UUID on :id
 * - 401: missing or invalid worker bearer token
 * - 404: execution not found
 * - 409: execution already completed
 * - 503: database error
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

// Mock executions module
const mockGetExecution = jest.fn();
const mockRecordExecutionResult = jest.fn();
jest.mock('../../src/lib/executions', () => ({
  getExecution: mockGetExecution,
  recordExecutionResult: mockRecordExecutionResult,
  // keep other exports intact
  createExecution: jest.fn(),
  listExecutions: jest.fn(),
  cancelExecution: jest.fn(),
  updateExecutionStatus: jest.fn(),
}));

// Mock timescaledb — storeCtrfReport
const mockStoreCtrfReport = jest.fn();
jest.mock('../../src/lib/timescaledb', () => ({
  storeCtrfReport: mockStoreCtrfReport,
  getTimescalePool: jest.fn(),
}));

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

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const WORKER_TOKEN = 'test-worker-secret-token';

// Minimal valid CTRF payload
const validCtrfPayload = {
  reportFormat: 'CTRF',
  specVersion: '1.0.0',
  reportId: '660e8400-e29b-41d4-a716-446655440001',
  timestamp: '2024-01-01T00:00:00.000Z',
  results: {
    tool: { name: 'jest' },
    summary: {
      tests: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
      pending: 0,
      other: 0,
      start: 1704067200000,
      stop: 1704067201000,
    },
    tests: [
      {
        name: 'should pass',
        status: 'passed' as const,
        duration: 100,
      },
    ],
  },
};

const runningExecution = {
  id: VALID_UUID,
  status: 'running',
  dockerImage: 'node:20',
  testCommand: 'npm test',
  parallelism: 2,
  environmentVars: {},
  resourceLimits: {},
  requestedBy: 'user-1',
  teamId: null,
  startedAt: '2024-01-01T00:00:00.000Z',
  completedAt: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  kubernetesJobName: 'scaledtest-job-1',
  kubernetesNamespace: 'scaledtest',
  errorMessage: null,
  totalPods: 2,
  completedPods: 0,
  failedPods: 0,
};

const completedExecution = {
  ...runningExecution,
  status: 'completed',
  completedAt: '2024-01-01T00:01:00.000Z',
};

function makeReqRes(
  method: string,
  body: unknown = {},
  query: Record<string, string> = {},
  headers: Record<string, string> = {}
) {
  const mockJson = jest.fn();
  const mockStatus = jest.fn().mockReturnValue({ json: mockJson, end: jest.fn() });
  // Make mockStatus also chainable with json on the same object via the returned value
  // but also allow res.json() directly
  const res = {
    status: mockStatus,
    json: mockJson,
    setHeader: jest.fn(),
  } as unknown as NextApiResponse;

  const req = {
    method,
    body,
    query,
    headers: {
      authorization: `Bearer ${WORKER_TOKEN}`,
      ...headers,
    },
  } as unknown as NextApiRequest;

  return { req, res, mockJson, mockStatus };
}

describe('POST /api/v1/executions/:id/results', () => {
  let handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

  beforeAll(async () => {
    // Set the worker token env var before importing the handler
    process.env.WORKER_TOKEN = WORKER_TOKEN;
    const mod = await import('../../src/pages/api/v1/executions/[id]/results');
    handler = mod.default;
  });

  afterAll(() => {
    delete process.env.WORKER_TOKEN;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 when :id is not a valid UUID', async () => {
    const { req, res, mockStatus } = makeReqRes('POST', validCtrfPayload, { id: 'not-a-uuid' });
    await handler(req, res);
    expect(mockStatus).toHaveBeenCalledWith(400);
  });

  it('returns 400 for empty id', async () => {
    const { req, res, mockStatus } = makeReqRes('POST', validCtrfPayload, { id: '' });
    await handler(req, res);
    expect(mockStatus).toHaveBeenCalledWith(400);
  });

  it('returns 401 when Authorization header is missing', async () => {
    const { req, res, mockStatus } = makeReqRes(
      'POST',
      validCtrfPayload,
      { id: VALID_UUID },
      { authorization: '' }
    );
    await handler(req, res);
    expect(mockStatus).toHaveBeenCalledWith(401);
    expect(mockGetExecution).not.toHaveBeenCalled();
  });

  it('returns 401 when worker token is wrong', async () => {
    const { req, res, mockStatus } = makeReqRes(
      'POST',
      validCtrfPayload,
      { id: VALID_UUID },
      { authorization: 'Bearer wrong-token' }
    );
    await handler(req, res);
    expect(mockStatus).toHaveBeenCalledWith(401);
    expect(mockGetExecution).not.toHaveBeenCalled();
  });

  it('returns 404 when execution not found', async () => {
    mockGetExecution.mockResolvedValue(null);
    const { req, res, mockStatus } = makeReqRes('POST', validCtrfPayload, { id: VALID_UUID });
    await handler(req, res);
    expect(mockStatus).toHaveBeenCalledWith(404);
    expect(mockStoreCtrfReport).not.toHaveBeenCalled();
  });

  it('returns 409 when execution is already completed', async () => {
    mockGetExecution.mockResolvedValue(completedExecution);
    const { req, res, mockStatus } = makeReqRes('POST', validCtrfPayload, { id: VALID_UUID });
    await handler(req, res);
    expect(mockStatus).toHaveBeenCalledWith(409);
    expect(mockStoreCtrfReport).not.toHaveBeenCalled();
  });

  it('returns 409 when execution is cancelled', async () => {
    mockGetExecution.mockResolvedValue({ ...runningExecution, status: 'cancelled' });
    const { req, res, mockStatus } = makeReqRes('POST', validCtrfPayload, { id: VALID_UUID });
    await handler(req, res);
    expect(mockStatus).toHaveBeenCalledWith(409);
  });

  it('returns 400 when CTRF payload is invalid (missing results)', async () => {
    mockGetExecution.mockResolvedValue(runningExecution);
    const { req, res, mockStatus } = makeReqRes(
      'POST',
      { reportFormat: 'CTRF', specVersion: '1.0.0' },
      { id: VALID_UUID }
    );
    await handler(req, res);
    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockStoreCtrfReport).not.toHaveBeenCalled();
  });

  it('returns success with reportId on valid submission', async () => {
    mockGetExecution.mockResolvedValue(runningExecution);
    const reportId = '660e8400-e29b-41d4-a716-446655440001';
    mockStoreCtrfReport.mockResolvedValue(reportId);
    mockRecordExecutionResult.mockResolvedValue({ ...runningExecution, completedPods: 1 });

    const { req, res, mockJson } = makeReqRes('POST', validCtrfPayload, { id: VALID_UUID });
    await handler(req, res);

    expect(mockStoreCtrfReport).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId: VALID_UUID,
      })
    );
    expect(mockRecordExecutionResult).toHaveBeenCalledWith(VALID_UUID);
    expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({ success: true, reportId }));
  });

  it('generates a reportId if not provided in payload', async () => {
    mockGetExecution.mockResolvedValue(runningExecution);
    mockStoreCtrfReport.mockImplementation(async (report: { reportId: string }) => report.reportId);
    mockRecordExecutionResult.mockResolvedValue({ ...runningExecution, completedPods: 1 });

    const payloadWithoutId = { ...validCtrfPayload };
    delete (payloadWithoutId as Partial<typeof validCtrfPayload>).reportId;

    const { req, res, mockJson } = makeReqRes('POST', payloadWithoutId, { id: VALID_UUID });
    await handler(req, res);

    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, reportId: expect.any(String) })
    );
  });

  it('calls storeCtrfReport with execution_id linked', async () => {
    mockGetExecution.mockResolvedValue(runningExecution);
    mockStoreCtrfReport.mockResolvedValue(validCtrfPayload.reportId);
    mockRecordExecutionResult.mockResolvedValue({ ...runningExecution, completedPods: 1 });

    const { req, res } = makeReqRes('POST', validCtrfPayload, { id: VALID_UUID });
    await handler(req, res);

    expect(mockStoreCtrfReport).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId: VALID_UUID,
        metadata: expect.objectContaining({ uploadedBy: 'worker' }),
      })
    );
  });

  it('calls recordExecutionResult to increment completedPods', async () => {
    mockGetExecution.mockResolvedValue(runningExecution);
    mockStoreCtrfReport.mockResolvedValue(validCtrfPayload.reportId);
    mockRecordExecutionResult.mockResolvedValue({ ...runningExecution, completedPods: 1 });

    const { req, res } = makeReqRes('POST', validCtrfPayload, { id: VALID_UUID });
    await handler(req, res);

    expect(mockRecordExecutionResult).toHaveBeenCalledWith(VALID_UUID);
  });

  it('returns 503 on storeCtrfReport DB error', async () => {
    mockGetExecution.mockResolvedValue(runningExecution);
    mockStoreCtrfReport.mockRejectedValue(new Error('ECONNREFUSED'));
    const { req, res, mockStatus } = makeReqRes('POST', validCtrfPayload, { id: VALID_UUID });
    await handler(req, res);
    expect(mockStatus).toHaveBeenCalledWith(503);
  });

  it('returns 503 on getExecution DB error', async () => {
    mockGetExecution.mockRejectedValue(new Error('DB connection failed'));
    const { req, res, mockStatus } = makeReqRes('POST', validCtrfPayload, { id: VALID_UUID });
    await handler(req, res);
    expect(mockStatus).toHaveBeenCalledWith(503);
  });

  it('returns 405 for non-POST methods with Allow header', async () => {
    mockGetExecution.mockResolvedValue(runningExecution);
    const { req, res, mockStatus } = makeReqRes('GET', {}, { id: VALID_UUID });
    const mockSetHeader = res.setHeader as jest.Mock;
    await handler(req, res);
    expect(mockStatus).toHaveBeenCalledWith(405);
    expect(mockSetHeader).toHaveBeenCalledWith('Allow', ['POST']);
  });
});
