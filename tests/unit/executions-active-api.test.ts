/**
 * Tests for GET /api/v1/executions/active endpoint
 * TDD: written BEFORE implementation per project convention.
 *
 * Covers:
 * - Zero executions across all teams
 * - Active-only count (no teamId filter)
 * - Mixed statuses (only queued/running count as active)
 * - DB error path (503 response)
 * - With teamId filter
 * - Without teamId filter
 * - Authentication required (401 when unauthenticated)
 * - Response shape: { success: true, data: { activeExecutions: number } }
 * - Invalid UUID teamId returns 400
 * - string[] teamId (Next.js array query) is unwrapped to first element
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
import handler from '../../src/pages/api/v1/executions/active';

const mockGetSession = auth.api.getSession as unknown as jest.Mock;

function makeReqRes(
  query: Record<string, string | string[]> = {},
  method = 'GET',
  headers: Record<string, string> = {}
) {
  const mockJson = jest.fn();
  const mockStatus = jest.fn().mockReturnThis();

  const req = {
    headers: { authorization: 'Bearer test-token', ...headers },
    method,
    query,
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
      role: 'readonly',
    },
  });
  mockGetUserTeams.mockResolvedValue([{ id: DEFAULT_TEAM_ID, name: 'Default Team' }]);
}

describe('GET /api/v1/executions/active', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null);
    const { req, res, mockStatus } = makeReqRes();
    await handler(req, res);
    expect(mockStatus).toHaveBeenCalledWith(401);
  });

  it('returns 200 with correct response shape', async () => {
    setupAuth();
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ count: '3' }] });
    const { req, res, mockJson } = makeReqRes();
    await handler(req, res);
    expect(mockJson).toHaveBeenCalledWith({
      success: true,
      data: { activeExecutions: 3 },
    });
  });

  it('returns activeExecutions: 0 when table is empty (zero executions)', async () => {
    setupAuth();
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
    const { req, res, mockJson } = makeReqRes();
    await handler(req, res);
    expect(mockJson).toHaveBeenCalledWith({
      success: true,
      data: { activeExecutions: 0 },
    });
  });

  it('returns only active (queued+running) executions count — active-only scenario', async () => {
    setupAuth();
    // 5 active executions (all queued or running)
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ count: '5' }] });
    const { req, res, mockJson } = makeReqRes();
    await handler(req, res);
    expect(mockJson).toHaveBeenCalledWith({
      success: true,
      data: { activeExecutions: 5 },
    });
    // Verify SQL filters for 'queued' and 'running' statuses
    const sql = mockPoolQuery.mock.calls[0][0] as string;
    expect(sql).toContain("'queued'");
    expect(sql).toContain("'running'");
  });

  it('counts only active statuses in mixed-status scenario', async () => {
    setupAuth();
    // Even though table has completed/failed executions, COUNT query only returns active ones
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] });
    const { req, res, mockJson } = makeReqRes();
    await handler(req, res);
    expect(mockJson).toHaveBeenCalledWith({
      success: true,
      data: { activeExecutions: 2 },
    });
    // The SQL must use WHERE status IN ('queued','running')
    const sql = mockPoolQuery.mock.calls[0][0] as string;
    expect(sql).toContain('WHERE');
    expect(sql).toContain('status');
  });

  it('returns 503 on DB error', async () => {
    setupAuth();
    mockPoolQuery.mockRejectedValueOnce(new Error('DB connection failed'));
    const { req, res, mockStatus, mockJson } = makeReqRes();
    await handler(req, res);
    expect(mockStatus).toHaveBeenCalledWith(503);
    expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('returns active count scoped to user teams when no teamId provided', async () => {
    setupAuth();
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ count: '7' }] });
    const { req, res, mockJson } = makeReqRes(); // no teamId in query
    await handler(req, res);
    expect(mockJson).toHaveBeenCalledWith({
      success: true,
      data: { activeExecutions: 7 },
    });
    // Verify team_id filter is applied using user's teams
    const [sql, params] = mockPoolQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('team_id');
    expect(params).toEqual([[DEFAULT_TEAM_ID]]);
  });

  it('returns active count filtered by teamId when teamId query param is provided', async () => {
    setupAuth();
    // Use the DEFAULT_TEAM_ID which the user belongs to
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ count: '4' }] });
    const { req, res, mockJson } = makeReqRes({ teamId: DEFAULT_TEAM_ID });
    await handler(req, res);
    expect(mockJson).toHaveBeenCalledWith({
      success: true,
      data: { activeExecutions: 4 },
    });
    // Verify parameterized query uses team_id = $1 and passes teamId as param
    const [sql, params] = mockPoolQuery.mock.calls[0] as [string, string[]];
    expect(sql).toContain('team_id');
    expect(sql).toContain('$1');
    expect(params).toEqual([DEFAULT_TEAM_ID]);
  });

  it('uses COUNT(*) FROM test_executions in query', async () => {
    setupAuth();
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });
    const { req, res } = makeReqRes();
    await handler(req, res);
    const sql = mockPoolQuery.mock.calls[0][0] as string;
    expect(sql).toContain('COUNT(*)');
    expect(sql).toContain('test_executions');
  });

  it('activeExecutions is a number, not a string', async () => {
    setupAuth();
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ count: '9' }] });
    const { req, res, mockJson } = makeReqRes();
    await handler(req, res);
    const result = mockJson.mock.calls[0][0] as {
      success: boolean;
      data: { activeExecutions: unknown };
    };
    expect(typeof result.data.activeExecutions).toBe('number');
    expect(result.data.activeExecutions).toBe(9);
  });

  it('returns 405 for non-GET methods', async () => {
    setupAuth();
    const { req, res, mockStatus } = makeReqRes({}, 'POST');
    await handler(req, res);
    expect(mockStatus).toHaveBeenCalledWith(405);
  });

  it('returns 400 when teamId is not a valid UUID', async () => {
    setupAuth();
    const { req, res, mockStatus, mockJson } = makeReqRes({ teamId: 'not-a-uuid' });
    await handler(req, res);
    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    // DB should NOT be called for invalid input
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed UUID (wrong segment lengths)', async () => {
    setupAuth();
    const { req, res, mockStatus } = makeReqRes({ teamId: '12345678-1234-1234-1234-12345678' });
    await handler(req, res);
    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it('unwraps string[] teamId (Next.js array query) to the first element', async () => {
    setupAuth();
    // Use the DEFAULT_TEAM_ID which the user belongs to
    // Next.js passes duplicate query params as string[]
    const arrayTeamId: string[] = [DEFAULT_TEAM_ID, 'another-value'];
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] });
    const { req, res, mockJson } = makeReqRes({ teamId: arrayTeamId });
    await handler(req, res);
    // Should succeed and pass the first element to the DB
    expect(mockJson).toHaveBeenCalledWith({
      success: true,
      data: { activeExecutions: 2 },
    });
    const [, params] = mockPoolQuery.mock.calls[0] as [string, string[]];
    expect(params).toEqual([DEFAULT_TEAM_ID]);
  });

  // --- QA edge cases ---

  it('returns 400 for empty string teamId', async () => {
    // Empty string is not undefined — it should fail UUID validation
    setupAuth();
    const { req, res, mockStatus, mockJson } = makeReqRes({ teamId: '' });
    await handler(req, res);
    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it('returns 400 for teamId with only whitespace', async () => {
    // Whitespace strings should not reach the DB
    setupAuth();
    const { req, res, mockStatus } = makeReqRes({ teamId: '   ' });
    await handler(req, res);
    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it('returns 400 when string[] teamId has an invalid UUID as first element', async () => {
    // Array unwrap uses first element — if it's invalid, should return 400
    setupAuth();
    const arrayTeamId: string[] = ['not-a-uuid', '550e8400-e29b-41d4-a716-446655440000'];
    const { req, res, mockStatus } = makeReqRes({ teamId: arrayTeamId });
    await handler(req, res);
    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it('returns 0 when user has no teams', async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'user-1', email: 'test@example.com', name: 'Test User', role: 'readonly' },
    });
    mockGetUserTeams.mockResolvedValue([]);
    const { req, res, mockJson } = makeReqRes();
    await handler(req, res);
    expect(mockJson).toHaveBeenCalledWith({
      success: true,
      data: { activeExecutions: 0 },
    });
    // DB should NOT be called when user has no teams
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it('returns 0 when DB returns empty rows array (no rows at all)', async () => {
    // Edge: rows is [] instead of [{ count: '0' }] — guard against undefined.count
    setupAuth();
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    const { req, res, mockJson } = makeReqRes();
    await handler(req, res);
    expect(mockJson).toHaveBeenCalledWith({
      success: true,
      data: { activeExecutions: 0 },
    });
  });

  it('returns 0 when DB count value is null (unexpected NULL from DB)', async () => {
    // Edge: count field comes back as null instead of a string
    setupAuth();
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ count: null }] });
    const { req, res, mockJson } = makeReqRes();
    await handler(req, res);
    expect(mockJson).toHaveBeenCalledWith({
      success: true,
      data: { activeExecutions: 0 },
    });
  });

  it('returns 0 when DB count value is unparseable (NaN path)', async () => {
    // Edge: parseInt returns NaN — the || 0 guard should kick in
    setupAuth();
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ count: 'not-a-number' }] });
    const { req, res, mockJson } = makeReqRes();
    await handler(req, res);
    expect(mockJson).toHaveBeenCalledWith({
      success: true,
      data: { activeExecutions: 0 },
    });
  });

  it('accepts uppercase UUID as valid teamId (UUID regex is case-insensitive)', async () => {
    // Use uppercase version of DEFAULT_TEAM_ID — user belongs to it (case-insensitive match)
    const upperUuid = DEFAULT_TEAM_ID.toUpperCase();
    mockGetSession.mockResolvedValue({
      user: { id: 'user-1', email: 'test@example.com', name: 'Test User', role: 'readonly' },
    });
    mockGetUserTeams.mockResolvedValue([{ id: upperUuid, name: 'Default Team' }]);
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });
    const { req, res, mockJson, mockStatus } = makeReqRes({ teamId: upperUuid });
    await handler(req, res);
    // Should NOT return 400 — regex has /i flag
    expect(mockStatus).not.toHaveBeenCalledWith(400);
    expect(mockJson).toHaveBeenCalledWith({
      success: true,
      data: { activeExecutions: 1 },
    });
  });

  it('returns 400 for UUID version 0 (regex only allows v1-v5)', async () => {
    // Version nibble must be 1-5 per RFC 4122; v0 should be rejected
    setupAuth();
    const v0Uuid = '550e8400-e29b-01d4-a716-446655440000'; // '0' in version position
    const { req, res, mockStatus } = makeReqRes({ teamId: v0Uuid });
    await handler(req, res);
    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it('returns 405 for DELETE method', async () => {
    setupAuth();
    const { req, res, mockStatus } = makeReqRes({}, 'DELETE');
    await handler(req, res);
    expect(mockStatus).toHaveBeenCalledWith(405);
  });

  it('returns 405 for PUT method', async () => {
    setupAuth();
    const { req, res, mockStatus } = makeReqRes({}, 'PUT');
    await handler(req, res);
    expect(mockStatus).toHaveBeenCalledWith(405);
  });

  it('returns 405 for PATCH method', async () => {
    setupAuth();
    const { req, res, mockStatus } = makeReqRes({}, 'PATCH');
    await handler(req, res);
    expect(mockStatus).toHaveBeenCalledWith(405);
  });

  it('does not call DB for unauthenticated requests', async () => {
    // Verify no DB leakage when auth fails
    mockGetSession.mockResolvedValue(null);
    const { req, res } = makeReqRes();
    await handler(req, res);
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it('returns 503 error body with success: false on DB failure', async () => {
    setupAuth();
    mockPoolQuery.mockRejectedValueOnce(new Error('Connection timeout'));
    const { req, res, mockStatus, mockJson } = makeReqRes();
    await handler(req, res);
    expect(mockStatus).toHaveBeenCalledWith(503);
    expect(mockJson).toHaveBeenCalledWith({
      success: false,
      error: 'Database unavailable',
    });
  });
});
