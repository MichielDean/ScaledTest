/**
 * Tests for analytics API endpoints (TDD — written before implementation)
 */
import type { NextApiRequest, NextApiResponse } from 'next';

// Mock auth
jest.mock('../../src/lib/auth', () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
}));

// Mock analytics module
jest.mock('../../src/lib/analytics', () => ({
  getTestTrends: jest.fn(),
  getFlakyTests: jest.fn(),
  getErrorAnalysis: jest.fn(),
  getDurationDistribution: jest.fn(),
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

import { auth } from '../../src/lib/auth';
import {
  getTestTrends,
  getFlakyTests,
  getErrorAnalysis,
  getDurationDistribution,
} from '../../src/lib/analytics';

const mockGetSession = auth.api.getSession as jest.Mock;
const mockGetTestTrends = getTestTrends as jest.Mock;
const mockGetFlakyTests = getFlakyTests as jest.Mock;
const mockGetErrorAnalysis = getErrorAnalysis as jest.Mock;
const mockGetDurationDistribution = getDurationDistribution as jest.Mock;

function makeReqRes(
  method = 'GET',
  query: Record<string, string> = {},
  headers: Record<string, string> = {}
) {
  const mockJson = jest.fn();
  const mockStatus = jest.fn().mockReturnValue({ json: mockJson, end: jest.fn() });

  const req = {
    method,
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

function setupAuth() {
  mockGetSession.mockResolvedValue({
    user: { id: 'user-1', email: 'test@example.com', name: 'Test', role: 'readonly' },
  });
}

const trendData = [
  { date: '2024-01-01', passed: 90, failed: 10, skipped: 0, total: 100, passRate: 90 },
];
const flakyData = [
  {
    testName: 'login test',
    suite: 'auth',
    totalRuns: 10,
    passed: 7,
    failed: 3,
    flakyScore: 30,
    avgDuration: 150,
  },
];
const errorData = [{ errorMessage: 'Expected true', count: 5, affectedTests: ['test-a'] }];
const durationData = [
  { range: '<100ms', count: 42, avgDuration: 50 },
  { range: '100-500ms', count: 0, avgDuration: 0 },
  { range: '500ms-2s', count: 0, avgDuration: 0 },
  { range: '2s-10s', count: 0, avgDuration: 0 },
  { range: '>10s', count: 0, avgDuration: 0 },
];

describe('GET /api/v1/analytics/trends', () => {
  let handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

  beforeAll(async () => {
    const mod = await import('../../src/pages/api/v1/analytics/trends');
    handler = mod.default;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null);
    const { req, res, mockStatus } = makeReqRes();
    await handler(req, res);
    expect(mockStatus).toHaveBeenCalledWith(401);
  });

  it('returns trend data with correct shape', async () => {
    setupAuth();
    mockGetTestTrends.mockResolvedValue(trendData);
    const { req, res, mockJson } = makeReqRes('GET', { days: '30' });

    await handler(req, res);

    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: trendData })
    );
  });

  it('passes days param to getTestTrends', async () => {
    setupAuth();
    mockGetTestTrends.mockResolvedValue([]);
    const { req, res } = makeReqRes('GET', { days: '7' });

    await handler(req, res);

    expect(mockGetTestTrends).toHaveBeenCalledWith(expect.objectContaining({ days: 7 }));
  });

  it('returns 503 on DB error', async () => {
    setupAuth();
    mockGetTestTrends.mockRejectedValue(new Error('DB down'));
    const { req, res, mockStatus } = makeReqRes();

    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(503);
  });
});

describe('GET /api/v1/analytics/flaky-tests', () => {
  let handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

  beforeAll(async () => {
    const mod = await import('../../src/pages/api/v1/analytics/flaky-tests');
    handler = mod.default;
  });

  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null);
    const { req, res, mockStatus } = makeReqRes();
    await handler(req, res);
    expect(mockStatus).toHaveBeenCalledWith(401);
  });

  it('returns flaky test data', async () => {
    setupAuth();
    mockGetFlakyTests.mockResolvedValue(flakyData);
    const { req, res, mockJson } = makeReqRes('GET', { days: '30' });

    await handler(req, res);

    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: flakyData })
    );
  });

  it('returns 503 on DB error', async () => {
    setupAuth();
    mockGetFlakyTests.mockRejectedValue(new Error('DB down'));
    const { req, res, mockStatus } = makeReqRes();

    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(503);
  });
});

describe('GET /api/v1/analytics/error-analysis', () => {
  let handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

  beforeAll(async () => {
    const mod = await import('../../src/pages/api/v1/analytics/error-analysis');
    handler = mod.default;
  });

  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null);
    const { req, res, mockStatus } = makeReqRes();
    await handler(req, res);
    expect(mockStatus).toHaveBeenCalledWith(401);
  });

  it('returns error analysis data', async () => {
    setupAuth();
    mockGetErrorAnalysis.mockResolvedValue(errorData);
    const { req, res, mockJson } = makeReqRes();

    await handler(req, res);

    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: errorData })
    );
  });

  it('caps limit at 100', async () => {
    setupAuth();
    mockGetErrorAnalysis.mockResolvedValue([]);
    const { req, res } = makeReqRes('GET', { limit: '500' });

    await handler(req, res);

    expect(mockGetErrorAnalysis).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));
  });

  it('returns 503 on DB error', async () => {
    setupAuth();
    mockGetErrorAnalysis.mockRejectedValue(new Error('DB down'));
    const { req, res, mockStatus } = makeReqRes();

    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(503);
  });
});

describe('GET /api/v1/analytics/duration-distribution', () => {
  let handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

  beforeAll(async () => {
    const mod = await import('../../src/pages/api/v1/analytics/duration-distribution');
    handler = mod.default;
  });

  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null);
    const { req, res, mockStatus } = makeReqRes();
    await handler(req, res);
    expect(mockStatus).toHaveBeenCalledWith(401);
  });

  it('returns duration distribution data', async () => {
    setupAuth();
    mockGetDurationDistribution.mockResolvedValue(durationData);
    const { req, res, mockJson } = makeReqRes();

    await handler(req, res);

    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: durationData })
    );
  });

  it('returns 503 on DB error', async () => {
    setupAuth();
    mockGetDurationDistribution.mockRejectedValue(new Error('DB down'));
    const { req, res, mockStatus } = makeReqRes();

    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(503);
  });
});
