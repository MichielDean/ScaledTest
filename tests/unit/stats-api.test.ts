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

// Mock teamManagement — getUserTeams returns a default team for the test user
const mockGetUserTeams = jest.fn();
jest.mock('../../src/lib/teamManagement', () => ({
  getUserTeams: (...args: unknown[]) => mockGetUserTeams(...args),
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
    setHeader: jest.fn(),
  } as unknown as NextApiResponse;

  return { req, res, mockJson, mockStatus };
}

const DEFAULT_TEAM_ID = '550e8400-e29b-41d4-a716-446655440000';

function setupAuth() {
  mockGetSession.mockResolvedValue({
    user: {
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'owner',
    },
  });
  mockGetUserTeams.mockResolvedValue([{ id: DEFAULT_TEAM_ID, name: 'Default Team' }]);
}

/**
 * Sets up all 4 DB query mocks in Promise.all() order:
 * 1. COUNT(*) FROM test_reports → { count }
 * 2. SUM(summary_tests) FROM test_reports → { sum }
 * 3. pass rate last 7d → { passed, total }
 * 4. Single query FROM test_executions → { total: totalExecutions, active: activeExecutions }
 */
function setupDBResponses(overrides?: {
  count?: string;
  sum?: string | null;
  passed?: string;
  total?: string;
  totalExecutions?: string;
  activeExecutions?: string;
}) {
  const {
    count = '42',
    sum = '1234',
    passed = '90',
    total = '100',
    totalExecutions = '7',
    activeExecutions = '3',
  } = overrides ?? {};
  mockPoolQuery
    .mockResolvedValueOnce({ rows: [{ count }] })
    .mockResolvedValueOnce({ rows: [{ sum }] })
    .mockResolvedValueOnce({ rows: [{ passed, total }] })
    .mockResolvedValueOnce({ rows: [{ total: totalExecutions, active: activeExecutions }] });
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
          totalExecutions: expect.any(Number),
          activeExecutions: expect.any(Number),
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
    expect(responseData.data.totalExecutions).toBe(0);
    expect(responseData.data.activeExecutions).toBe(0);
  });

  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null);

    const { req, res, mockStatus } = makeReqRes();
    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(401);
  });

  it('totalExecutions is queried from test_executions and returned correctly', async () => {
    setupAuth();
    setupDBResponses({ totalExecutions: '15' });

    const { req, res, mockJson } = makeReqRes();
    await handler(req, res);

    expect(mockJson.mock.calls[0][0].data.totalExecutions).toBe(15);

    // Verify the handler actually queries test_executions for the total count
    const executionsQuery = mockPoolQuery.mock.calls[3]?.[0] as string;
    expect(typeof executionsQuery).toBe('string');
    expect(executionsQuery).toContain('FROM test_executions');
  });

  it('activeExecutions counts only queued and running statuses', async () => {
    setupAuth();
    setupDBResponses({ totalExecutions: '10', activeExecutions: '4' });

    const { req, res, mockJson } = makeReqRes();
    await handler(req, res);

    expect(mockJson.mock.calls[0][0].data.activeExecutions).toBe(4);

    // Verify the SQL filters by the correct active statuses
    const hasQueuedAndRunningFilter = mockPoolQuery.mock.calls.some(([sql]) => {
      return typeof sql === 'string' && sql.includes("'queued'") && sql.includes("'running'");
    });
    expect(hasQueuedAndRunningFilter).toBe(true);
  });

  it('totalExecutions and activeExecutions are both 0 when test_executions table is empty', async () => {
    setupAuth();
    setupDBResponses({ totalExecutions: '0', activeExecutions: '0' });

    const { req, res, mockJson } = makeReqRes();
    await handler(req, res);

    expect(mockJson.mock.calls[0][0].data.totalExecutions).toBe(0);
    expect(mockJson.mock.calls[0][0].data.activeExecutions).toBe(0);
  });

  it('activeExecutions is 0 when all executions are completed (none queued or running)', async () => {
    setupAuth();
    // 8 total executions, all completed/failed/cancelled — none active
    setupDBResponses({ totalExecutions: '8', activeExecutions: '0' });

    const { req, res, mockJson } = makeReqRes();
    await handler(req, res);

    expect(mockJson.mock.calls[0][0].data.totalExecutions).toBe(8);
    expect(mockJson.mock.calls[0][0].data.activeExecutions).toBe(0);
  });

  it('activeExecutions equals totalExecutions when all are queued or running', async () => {
    setupAuth();
    // 5 total, all active (queued or running)
    setupDBResponses({ totalExecutions: '5', activeExecutions: '5' });

    const { req, res, mockJson } = makeReqRes();
    await handler(req, res);

    expect(mockJson.mock.calls[0][0].data.totalExecutions).toBe(5);
    expect(mockJson.mock.calls[0][0].data.activeExecutions).toBe(5);
  });

  it('cache returns same value within 60s (mock Date.now)', async () => {
    setupAuth();
    const now = 1_700_000_000_000;
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(now);

    // First call: set up DB responses
    setupDBResponses({
      count: '99',
      sum: '5000',
      passed: '80',
      total: '100',
      totalExecutions: '12',
      activeExecutions: '2',
    });

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
    expect(mockJson2.mock.calls[0][0].data.totalExecutions).toBe(12);
    expect(mockJson2.mock.calls[0][0].data.activeExecutions).toBe(2);

    dateSpy.mockRestore();
  });

  it('cache expires after 60s and re-queries DB', async () => {
    setupAuth();
    const now = 1_700_000_000_000;
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(now);

    // First call
    setupDBResponses({ count: '10', sum: '100' });
    const { req: req1, res: res1 } = makeReqRes();
    await handler(req1, res1);

    const firstQueryCount = mockPoolQuery.mock.calls.length;
    expect(firstQueryCount).toBe(4); // 4 parallel queries

    // Advance 61s — past TTL
    dateSpy.mockReturnValue(now + 61_000);

    // Second call — should hit DB again
    setupDBResponses({ count: '20', sum: '200' });
    const { req: req2, res: res2, mockJson: mockJson2 } = makeReqRes();
    await handler(req2, res2);

    // New DB queries were made
    expect(mockPoolQuery.mock.calls.length).toBe(8); // 4 + 4
    expect(mockJson2.mock.calls[0][0].data.totalReports).toBe(20);

    dateSpy.mockRestore();
  });

  it('caches zero stats when DB throws (serves zeros from cache on next call)', async () => {
    setupAuth();
    const now = 1_700_000_000_000;
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(now);

    // First call — DB fails
    mockPoolQuery.mockRejectedValue(new Error('DB down'));
    const { req: req1, res: res1, mockJson: mockJson1 } = makeReqRes();
    await handler(req1, res1);
    expect(mockJson1.mock.calls[0][0].data.totalReports).toBe(0);

    // Second call within TTL — should serve cached zeros without querying DB
    dateSpy.mockReturnValue(now + 10_000);
    const queryCountAfterFirst = mockPoolQuery.mock.calls.length;

    const { req: req2, res: res2, mockJson: mockJson2 } = makeReqRes();
    await handler(req2, res2);

    expect(mockPoolQuery.mock.calls.length).toBe(queryCountAfterFirst);
    expect(mockJson2.mock.calls[0][0].data.totalReports).toBe(0);

    dateSpy.mockRestore();
  });

  it('returns 405 for non-GET methods', async () => {
    setupAuth();

    const { req, res, mockStatus, mockJson } = makeReqRes('POST');
    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(405);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('not allowed'),
      })
    );
  });

  it('handles null sum from DB gracefully (totalTests defaults to 0)', async () => {
    setupAuth();
    setupDBResponses({ sum: null });

    const { req, res, mockJson } = makeReqRes();
    await handler(req, res);

    expect(mockJson.mock.calls[0][0].data.totalTests).toBe(0);
  });

  it('rounds passRateLast7d to nearest integer (e.g. 2/3 → 67)', async () => {
    setupAuth();
    setupDBResponses({ passed: '2', total: '3' });

    const { req, res, mockJson } = makeReqRes();
    await handler(req, res);

    // 2/3 = 0.6667 → Math.round(66.67) = 67
    expect(mockJson.mock.calls[0][0].data.passRateLast7d).toBe(67);
  });

  it('handles empty rows from DB (missing row data)', async () => {
    setupAuth();
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const { req, res, mockJson } = makeReqRes();
    await handler(req, res);

    const data = mockJson.mock.calls[0][0].data;
    expect(data.totalReports).toBe(0);
    expect(data.totalTests).toBe(0);
    expect(data.passRateLast7d).toBe(0);
    expect(data.totalExecutions).toBe(0);
    expect(data.activeExecutions).toBe(0);
  });

  it('makes exactly 4 parallel DB queries per uncached request', async () => {
    setupAuth();
    setupDBResponses();

    const { req, res } = makeReqRes();
    await handler(req, res);

    expect(mockPoolQuery).toHaveBeenCalledTimes(4);
  });
});
