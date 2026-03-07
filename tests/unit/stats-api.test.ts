/**
 * Tests for GET /api/v1/stats endpoint
 * Written BEFORE implementation per TDD requirement.
 */
import type { NextApiRequest, NextApiResponse } from 'next';

// Mock auth — must be before imports
jest.mock('../../src/lib/auth', () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
}));

// Mock timescaledb — pool.query is the key
const mockPoolQuery = jest.fn();
jest.mock('../../src/lib/timescaledb', () => ({
  getTimescalePool: jest.fn(() => ({ query: mockPoolQuery })),
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
  logError: jest.fn(),
  getRequestLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  })),
}));

import { auth } from '../../src/lib/auth';
import handler, { statsCache } from '../../src/pages/api/v1/stats';

const mockGetSession = auth.api.getSession as unknown as jest.Mock;

function makeReqRes(method = 'GET', headers: Record<string, string> = {}) {
  const mockJson = jest.fn();
  const mockStatus = jest.fn().mockReturnThis();

  const req = {
    headers: { authorization: 'Bearer test-token', ...headers },
    method,
  } as unknown as NextApiRequest;

  const res = {
    status: mockStatus,
    json: mockJson,
  } as unknown as NextApiResponse;

  return { req, res, mockJson, mockStatus };
}

function setupAuth() {
  mockGetSession.mockResolvedValue({
    user: {
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'owner',
    },
  });
}

function setupDBResponses(overrides?: {
  count?: string;
  sum?: string | null;
  passed?: string;
  total?: string;
}) {
  const { count = '42', sum = '1234', passed = '90', total = '100' } = overrides ?? {};
  mockPoolQuery
    .mockResolvedValueOnce({ rows: [{ count }] })
    .mockResolvedValueOnce({ rows: [{ sum }] })
    .mockResolvedValueOnce({ rows: [{ passed, total }] });
}

describe('GET /api/v1/stats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear module-level cache between tests
    statsCache.clear();
  });

  it('returns success:true with all required fields', async () => {
    setupAuth();
    setupDBResponses();

    const { req, res, mockJson } = makeReqRes();
    await handler(req, res);

    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          totalReports: expect.any(Number),
          totalTests: expect.any(Number),
          passRateLast7d: expect.any(Number),
          totalExecutions: 0,
          activeExecutions: 0,
        }),
      })
    );
  });

  it('totalReports is parsed from DB COUNT result', async () => {
    setupAuth();
    setupDBResponses({ count: '42' });

    const { req, res, mockJson } = makeReqRes();
    await handler(req, res);

    expect(mockJson.mock.calls[0][0].data.totalReports).toBe(42);
  });

  it('totalTests is parsed from DB SUM result', async () => {
    setupAuth();
    setupDBResponses({ sum: '1234' });

    const { req, res, mockJson } = makeReqRes();
    await handler(req, res);

    expect(mockJson.mock.calls[0][0].data.totalTests).toBe(1234);
  });

  it('passRateLast7d is correct when passed=90, total=100 → 90', async () => {
    setupAuth();
    setupDBResponses({ passed: '90', total: '100' });

    const { req, res, mockJson } = makeReqRes();
    await handler(req, res);

    expect(mockJson.mock.calls[0][0].data.passRateLast7d).toBe(90);
  });

  it('passRateLast7d is 0 when total=0 (no division by zero)', async () => {
    setupAuth();
    setupDBResponses({ count: '0', sum: null, passed: '0', total: '0' });

    const { req, res, mockJson } = makeReqRes();
    await handler(req, res);

    expect(mockJson.mock.calls[0][0].data.passRateLast7d).toBe(0);
  });

  it('returns zeros when DB pool throws', async () => {
    setupAuth();
    mockPoolQuery.mockRejectedValue(new Error('DB connection failed'));

    const { req, res, mockJson, mockStatus } = makeReqRes();
    await handler(req, res);

    expect(mockStatus).not.toHaveBeenCalledWith(500);
    const responseData = mockJson.mock.calls[0][0];
    expect(responseData.success).toBe(true);
    expect(responseData.data.totalReports).toBe(0);
    expect(responseData.data.totalTests).toBe(0);
    expect(responseData.data.passRateLast7d).toBe(0);
  });

  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null);

    const { req, res, mockStatus } = makeReqRes();
    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(401);
  });

  it('totalExecutions and activeExecutions are always 0', async () => {
    setupAuth();
    setupDBResponses();

    const { req, res, mockJson } = makeReqRes();
    await handler(req, res);

    expect(mockJson.mock.calls[0][0].data.totalExecutions).toBe(0);
    expect(mockJson.mock.calls[0][0].data.activeExecutions).toBe(0);
  });

  it('cache returns same value within 60s (mock Date.now)', async () => {
    setupAuth();
    const now = 1_700_000_000_000;
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(now);

    // First call: set up DB responses
    setupDBResponses({ count: '99', sum: '5000', passed: '80', total: '100' });

    const { req: req1, res: res1, mockJson: mockJson1 } = makeReqRes();
    await handler(req1, res1);

    const firstQueryCount = mockPoolQuery.mock.calls.length;
    expect(mockJson1.mock.calls[0][0].success).toBe(true);

    // Advance 30s — within TTL
    dateSpy.mockReturnValue(now + 30_000);

    // Second call — same auth
    const { req: req2, res: res2, mockJson: mockJson2 } = makeReqRes();
    await handler(req2, res2);

    const secondQueryCount = mockPoolQuery.mock.calls.length;

    // No new DB queries — served from cache
    expect(secondQueryCount).toBe(firstQueryCount);
    expect(mockJson2.mock.calls[0][0].success).toBe(true);
    expect(mockJson2.mock.calls[0][0].data.totalReports).toBe(99);

    dateSpy.mockRestore();
  });
});
