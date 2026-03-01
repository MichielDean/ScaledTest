import type { NextApiResponse } from 'next';
import type { BetterAuthenticatedRequest } from '../../src/auth/betterAuthApi';
import type { Logger } from 'pino';
import { handleGet } from '../../src/pages/api/analytics';
import { getUserTeams } from '../../src/lib/teamManagement';
import { getTimescalePool } from '../../src/lib/timescaledb';

jest.mock('../../src/lib/teamManagement', () => ({
  getUserTeams: jest.fn(),
}));

jest.mock('../../src/lib/timescaledb', () => ({
  getTimescalePool: jest.fn(),
}));

// Minimal pino-compatible logger stub for tests
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
  trace: jest.fn(),
  silent: jest.fn(),
  child: jest.fn(),
  level: 'silent',
  msgPrefix: '',
} as unknown as Logger;

type MockResponse = NextApiResponse & {
  status: jest.Mock;
  json: jest.Mock;
};

// Query comment tokens used in analytics.ts to identify which query is running
type QueryToken = 'analytics_stats' | 'analytics_trends' | 'analytics_top_failing';

describe('GET /api/analytics', () => {
  let mockReq: BetterAuthenticatedRequest;
  let mockRes: MockResponse;
  const mockClient = { query: jest.fn(), release: jest.fn() };
  const mockPool = { connect: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      method: 'GET',
      user: {
        id: 'user-123',
        email: 'user@example.com',
      },
    } as BetterAuthenticatedRequest;

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as MockResponse;

    mockPool.connect.mockResolvedValue(mockClient);
    (getTimescalePool as jest.Mock).mockReturnValue(mockPool);
    mockClient.release.mockResolvedValue(undefined);

    (getUserTeams as jest.Mock).mockResolvedValue([{ id: 'team-123', name: 'QA' }]);
  });

  const setQueryResponses = (options?: {
    stats?: Array<Record<string, number>>;
    trends?: Array<{ date: string; total: number; passed: number; failed: number }>;
    topFailing?: Array<{ name: string; suite: string; fail_count: number; total_runs: number }>;
    throwOn?: QueryToken;
    error?: Error;
  }) => {
    const statsRows = options?.stats ?? [
      {
        total_reports: 10,
        total_tests: 200,
        total_passed: 150,
        total_failed: 50,
        recent_reports: 4,
      },
    ];

    const trendRows = options?.trends ?? [
      { date: '2024-01-01', total: 20, passed: 15, failed: 5 },
      { date: '2024-01-02', total: 30, passed: 25, failed: 5 },
    ];

    const topFailingRows = options?.topFailing ?? [
      { name: 'test A', suite: 'suite 1', fail_count: 3, total_runs: 5 },
    ];

    mockClient.query.mockImplementation(async (query: string) => {
      if (options?.throwOn && query.includes(options.throwOn)) {
        throw options.error ?? new Error('DB error');
      }

      if (query.includes('analytics_stats')) {
        return { rows: statsRows };
      }

      if (query.includes('analytics_trends')) {
        return { rows: trendRows };
      }

      if (query.includes('analytics_top_failing')) {
        return { rows: topFailingRows };
      }

      throw new Error(`Unexpected query: ${query.slice(0, 80)}`);
    });
  };

  it('returns 401 when request lacks authenticated user', async () => {
    mockReq.user = undefined as unknown as BetterAuthenticatedRequest['user'];

    setQueryResponses();

    await handleGet(mockReq, mockRes, mockLogger);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'User identification required' })
    );
  });

  it('returns analytics data when database queries succeed', async () => {
    setQueryResponses();

    await handleGet(mockReq, mockRes, mockLogger);

    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        stats: expect.objectContaining({
          totalReports: 10,
          totalTests: 200,
          passRate: expect.any(Number),
          recentReports: 4,
        }),
        trends: expect.arrayContaining([expect.objectContaining({ date: '2024-01-01' })]),
        topFailingTests: expect.arrayContaining([
          expect.objectContaining({ name: 'test A', failRate: expect.any(Number) }),
        ]),
      })
    );
  });

  it('returns 503 when TimescaleDB connection fails', async () => {
    setQueryResponses({
      throwOn: 'analytics_stats',
      error: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
    });

    await handleGet(mockReq, mockRes, mockLogger);

    expect(mockRes.status).toHaveBeenCalledWith(503);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Database service unavailable' })
    );
  });

  it('calculates pass rate to one decimal place', async () => {
    setQueryResponses({
      stats: [
        {
          total_reports: 5,
          total_tests: 3,
          total_passed: 2,
          total_failed: 1,
          recent_reports: 1,
        },
      ],
    });

    await handleGet(mockReq, mockRes, mockLogger);

    const responsePayload = mockRes.json.mock.calls[0][0] as {
      stats: { passRate: number; failRate: number };
    };

    expect(responsePayload.stats.passRate).toBeCloseTo(66.7, 1);
    expect(responsePayload.stats.failRate).toBeCloseTo(33.3, 1);
  });

  it('includes trend entries with pass rate calculations', async () => {
    setQueryResponses({
      trends: [{ date: '2024-01-03', total: 10, passed: 7, failed: 3 }],
    });

    await handleGet(mockReq, mockRes, mockLogger);

    const responsePayload = mockRes.json.mock.calls[0][0] as {
      trends: Array<{
        date: string;
        total: number;
        passed: number;
        failed: number;
        passRate: number;
      }>;
    };

    expect(responsePayload.trends).toEqual([
      expect.objectContaining({
        date: '2024-01-03',
        total: 10,
        passed: 7,
        failed: 3,
        passRate: 70,
      }),
    ]);
  });
});
