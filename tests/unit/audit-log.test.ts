/**
 * Unit tests for the audit log — ScaledTest-nt1
 *
 * Covers:
 *   - appendAuditLog: happy path, error-swallowing behaviour
 *   - listAuditLog: filter combinations, pagination edge cases
 *   - GET /api/v1/admin/audit-log: auth, role gating, query parameter validation
 */

import { NextApiRequest, NextApiResponse } from 'next';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
}));

jest.mock('@/logging/logger', () => ({
  apiLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  dbLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  logError: jest.fn(),
  getRequestLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

// Mock the timescaledb pool — we don't want real DB connections in unit tests.
const mockQuery = jest.fn();
jest.mock('@/lib/timescaledb', () => ({
  getTimescalePool: jest.fn(() => ({ query: mockQuery })),
}));

// Mock apiTokens validateApiToken (used by createBetterAuthApi).
jest.mock('@/lib/apiTokens', () => ({
  ...jest.requireActual<typeof import('@/lib/apiTokens')>('@/lib/apiTokens'),
  validateApiToken: jest.fn().mockResolvedValue(null),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { auth } from '@/lib/auth';
import { AuditAction, appendAuditLog, listAuditLog } from '@/lib/auditLog';
import auditLogHandler from '@/pages/api/v1/admin/audit-log';

// ── Typed mocks ───────────────────────────────────────────────────────────────

const mockGetSession = auth.api.getSession as unknown as jest.Mock;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ownerSession = {
  user: { id: 'owner-1', email: 'owner@example.com', role: 'owner', name: 'Owner' },
  session: { id: 's1', userId: 'owner-1', token: 'tok' },
};

const maintainerSession = {
  user: { id: 'main-1', email: 'main@example.com', role: 'maintainer', name: 'Main' },
  session: { id: 's2', userId: 'main-1', token: 'tok2' },
};

const sampleEntry = {
  id: 'aaaa-bbbb',
  actor_id: 'owner-1',
  actor_email: 'owner@example.com',
  action: 'execution.created',
  resource_type: 'execution',
  resource_id: 'exec-1',
  team_id: null,
  metadata: { parallelism: 2 },
  ip_address: '127.0.0.1',
  created_at: new Date('2026-01-01T00:00:00Z'),
};

function makeReq(
  method: string,
  opts: { query?: Record<string, string>; headers?: Record<string, string> } = {}
): Partial<NextApiRequest> {
  return {
    method,
    headers: { cookie: 'session=test', ...opts.headers },
    query: opts.query ?? {},
    body: {},
  };
}

function makeRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
  };
  return res;
}

// ── appendAuditLog ────────────────────────────────────────────────────────────

describe('appendAuditLog', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('inserts a row with all provided fields', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await appendAuditLog({
      actorId: 'user-1',
      actorEmail: 'user@example.com',
      action: AuditAction.EXECUTION_CREATED,
      resourceType: 'execution',
      resourceId: 'exec-123',
      teamId: '550e8400-e29b-41d4-a716-446655440000',
      metadata: { parallelism: 4 },
      ipAddress: '10.0.0.1',
    });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO audit_log/);
    expect(params).toEqual([
      'user-1',
      'user@example.com',
      'execution.created',
      'execution',
      'exec-123',
      '550e8400-e29b-41d4-a716-446655440000',
      '{"parallelism":4}',
      '10.0.0.1',
    ]);
  });

  it('uses null for optional fields when not provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await appendAuditLog({
      actorId: null,
      actorEmail: null,
      action: AuditAction.REPORT_SUBMITTED,
      resourceType: 'report',
      resourceId: null,
      teamId: null,
    });

    const [, params] = mockQuery.mock.calls[0];
    expect(params[0]).toBeNull(); // actorId
    expect(params[1]).toBeNull(); // actorEmail
    expect(params[4]).toBeNull(); // resourceId
    expect(params[5]).toBeNull(); // teamId
    expect(params[7]).toBeNull(); // ipAddress
  });

  it('swallows DB errors and does not throw', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB connection refused'));

    // Must not throw
    await expect(
      appendAuditLog({
        actorId: 'user-1',
        actorEmail: null,
        action: AuditAction.ADMIN_ROLE_CHANGED,
        resourceType: 'user',
        resourceId: 'user-2',
        teamId: null,
      })
    ).resolves.toBeUndefined();
  });

  it('serialises metadata as JSON', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await appendAuditLog({
      actorId: 'user-1',
      actorEmail: null,
      action: AuditAction.ADMIN_ROLE_CHANGED,
      resourceType: 'user',
      resourceId: 'user-2',
      teamId: null,
      metadata: { from: 'readonly', to: 'maintainer' },
    });

    const [, params] = mockQuery.mock.calls[0];
    expect(params[6]).toBe('{"from":"readonly","to":"maintainer"}');
  });

  it('defaults metadata to empty object when not provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await appendAuditLog({
      actorId: 'user-1',
      actorEmail: null,
      action: AuditAction.TEAM_MEMBER_ADDED,
      resourceType: 'user',
      resourceId: 'user-3',
      teamId: null,
    });

    const [, params] = mockQuery.mock.calls[0];
    expect(params[6]).toBe('{}');
  });
});

// ── listAuditLog ──────────────────────────────────────────────────────────────

describe('listAuditLog', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  function mockCountAndData(total: number, rows: object[]) {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: String(total) }] }) // COUNT
      .mockResolvedValueOnce({ rows }); // data
  }

  it('returns entries mapped to camelCase fields', async () => {
    mockCountAndData(1, [sampleEntry]);

    const result = await listAuditLog();

    expect(result.total).toBe(1);
    expect(result.entries).toHaveLength(1);
    const entry = result.entries[0];
    expect(entry.actorId).toBe('owner-1');
    expect(entry.actorEmail).toBe('owner@example.com');
    expect(entry.action).toBe('execution.created');
    expect(entry.resourceType).toBe('execution');
    expect(entry.resourceId).toBe('exec-1');
    expect(entry.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('applies no WHERE clause when no filters are provided', async () => {
    mockCountAndData(0, []);

    await listAuditLog();

    const countSql: string = mockQuery.mock.calls[0][0];
    expect(countSql).not.toContain('WHERE');
  });

  it('applies actorId filter', async () => {
    mockCountAndData(0, []);

    await listAuditLog({ actorId: 'user-42' });

    const countSql: string = mockQuery.mock.calls[0][0];
    const countParams: string[] = mockQuery.mock.calls[0][1];
    expect(countSql).toContain('actor_id = $1');
    expect(countParams[0]).toBe('user-42');
  });

  it('applies actionPrefix filter using starts_with with dot suffix', async () => {
    mockCountAndData(0, []);

    await listAuditLog({ actionPrefix: 'execution' });

    const countSql: string = mockQuery.mock.calls[0][0];
    const countParams: string[] = mockQuery.mock.calls[0][1];
    expect(countSql).toContain('starts_with');
    expect(countParams[0]).toBe('execution.');
  });

  it('passes actionPrefix value verbatim (no escaping needed with starts_with)', async () => {
    mockCountAndData(0, []);

    // With starts_with() there is no LIKE escaping — the prefix is passed as-is.
    await listAuditLog({ actionPrefix: 'weird\\prefix' });

    const countParams: string[] = mockQuery.mock.calls[0][1];
    // First param is the starts_with prefix — no escaping applied
    expect(countParams[0]).toBe('weird\\prefix.');
  });

  it('passes actionPrefix with percent signs verbatim (starts_with is not LIKE)', async () => {
    mockCountAndData(0, []);

    await listAuditLog({ actionPrefix: '100%done' });

    const countParams: string[] = mockQuery.mock.calls[0][1];
    expect(countParams[0]).toBe('100%done.');
  });

  it('passes actionPrefix with underscores verbatim (starts_with is not LIKE)', async () => {
    mockCountAndData(0, []);

    await listAuditLog({ actionPrefix: 'my_action' });

    const countParams: string[] = mockQuery.mock.calls[0][1];
    expect(countParams[0]).toBe('my_action.');
  });

  it('applies resourceType filter', async () => {
    mockCountAndData(0, []);

    await listAuditLog({ resourceType: 'report' });

    const countSql: string = mockQuery.mock.calls[0][0];
    expect(countSql).toContain('resource_type = $');
  });

  it('applies teamId filter', async () => {
    mockCountAndData(0, []);

    await listAuditLog({ teamId: '550e8400-e29b-41d4-a716-446655440000' });

    const countSql: string = mockQuery.mock.calls[0][0];
    expect(countSql).toContain('team_id = $');
  });

  it('applies dateFrom and dateTo filters', async () => {
    mockCountAndData(0, []);

    await listAuditLog({
      dateFrom: '2026-01-01T00:00:00Z',
      dateTo: '2026-01-31T23:59:59Z',
    });

    const countSql: string = mockQuery.mock.calls[0][0];
    expect(countSql).toContain('created_at >=');
    expect(countSql).toContain('created_at <=');
  });

  it('clamps size to max 200', async () => {
    mockCountAndData(0, []);

    const result = await listAuditLog({ size: 9999 });

    expect(result.size).toBe(200);
    // The LIMIT in the data query should be 200
    const dataParams: (string | number)[] = mockQuery.mock.calls[1][1];
    expect(dataParams[dataParams.length - 2]).toBe(200);
  });

  it('floors size to minimum 1', async () => {
    mockCountAndData(0, []);

    const result = await listAuditLog({ size: 0 });

    expect(result.size).toBe(1);
  });

  it('computes pagination metadata correctly', async () => {
    mockCountAndData(105, []);

    const result = await listAuditLog({ page: 2, size: 50 });

    expect(result.total).toBe(105);
    expect(result.totalPages).toBe(3);
    expect(result.hasNext).toBe(true);
    expect(result.hasPrev).toBe(true);
  });

  it('hasNext=false on last page', async () => {
    mockCountAndData(10, []);

    const result = await listAuditLog({ page: 1, size: 50 });

    expect(result.hasNext).toBe(false);
    expect(result.hasPrev).toBe(false);
  });

  it('handles DB Date objects and converts them to ISO strings', async () => {
    const entryWithDate = { ...sampleEntry, created_at: new Date('2026-03-01T12:00:00Z') };
    mockCountAndData(1, [entryWithDate]);

    const result = await listAuditLog();

    expect(result.entries[0].createdAt).toBe('2026-03-01T12:00:00.000Z');
  });
});

// ── GET /api/v1/admin/audit-log ───────────────────────────────────────────────

describe('GET /api/v1/admin/audit-log', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockGetSession.mockReset();
  });

  function mockCountAndData(total: number, rows: object[]) {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: String(total) }] })
      .mockResolvedValueOnce({ rows });
  }

  it('returns 401 when unauthenticated', async () => {
    mockGetSession.mockResolvedValue(null);

    const req = makeReq('GET');
    const res = makeRes();

    await auditLogHandler(req as NextApiRequest, res as unknown as NextApiResponse);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 403 when authenticated as maintainer', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);

    const req = makeReq('GET');
    const res = makeRes();

    await auditLogHandler(req as NextApiRequest, res as unknown as NextApiResponse);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 200 with results for owner', async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    mockCountAndData(1, [sampleEntry]);

    const req = makeReq('GET');
    const res = makeRes();

    await auditLogHandler(req as NextApiRequest, res as unknown as NextApiResponse);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.total).toBe(1);
    expect(body.data.entries).toHaveLength(1);
  });

  it('returns 405 for non-GET methods', async () => {
    mockGetSession.mockResolvedValue(ownerSession);

    const req = makeReq('POST');
    const res = makeRes();

    await auditLogHandler(req as NextApiRequest, res as unknown as NextApiResponse);

    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('returns 400 for invalid teamId', async () => {
    mockGetSession.mockResolvedValue(ownerSession);

    const req = makeReq('GET', { query: { teamId: 'not-a-uuid' } });
    const res = makeRes();

    await auditLogHandler(req as NextApiRequest, res as unknown as NextApiResponse);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error).toMatch(/Invalid teamId/);
  });

  it('returns 400 for actorId that is too long', async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    const longActorId = 'x'.repeat(256);

    const req = makeReq('GET', { query: { actorId: longActorId } });
    const res = makeRes();

    await auditLogHandler(req as NextApiRequest, res as unknown as NextApiResponse);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('passes query parameters to listAuditLog', async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    mockCountAndData(0, []);

    const req = makeReq('GET', {
      query: {
        actorId: 'user-1',
        actionPrefix: 'admin',
        resourceType: 'user',
        page: '2',
        size: '25',
      },
    });
    const res = makeRes();

    await auditLogHandler(req as NextApiRequest, res as unknown as NextApiResponse);

    expect(res.status).toHaveBeenCalledWith(200);
    // Verify the query was passed through — the COUNT query should contain actorId and action filters
    const countSql: string = mockQuery.mock.calls[0][0];
    expect(countSql).toContain('actor_id = $');
    expect(countSql).toContain('starts_with');
    expect(countSql).toContain('resource_type = $');
  });

  it('returns empty entries list when no results', async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    mockCountAndData(0, []);

    const req = makeReq('GET');
    const res = makeRes();

    await auditLogHandler(req as NextApiRequest, res as unknown as NextApiResponse);

    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.data.entries).toHaveLength(0);
    expect(body.data.total).toBe(0);
    expect(body.data.hasNext).toBe(false);
    expect(body.data.hasPrev).toBe(false);
  });
});

// ── AuditAction constants ─────────────────────────────────────────────────────

describe('AuditAction constants', () => {
  it('all action strings contain a dot separator', () => {
    for (const value of Object.values(AuditAction)) {
      expect(value).toMatch(/\./);
    }
  });

  it('covers all major resource categories', () => {
    const categories = new Set(Object.values(AuditAction).map(v => v.split('.')[0]));
    expect(categories).toContain('report');
    expect(categories).toContain('execution');
    expect(categories).toContain('admin');
    expect(categories).toContain('team');
  });
});

// ── Additional regression tests (from code review findings) ──────────────────

describe('GET /api/v1/admin/audit-log — review fixes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockGetSession.mockReset();
  });

  function mockCountAndData(total: number, rows: object[]) {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: String(total) }] })
      .mockResolvedValueOnce({ rows });
  }

  it('returns 503 when listAuditLog throws (DB unavailable)', async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    mockQuery.mockRejectedValue(new Error('DB connection refused'));

    const req = makeReq('GET');
    const res = makeRes();

    await auditLogHandler(req as NextApiRequest, res as unknown as NextApiResponse);

    expect(res.status).toHaveBeenCalledWith(503);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/unavailable/i);
  });

  it('normalizes array query params — takes first element when param appears multiple times', async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    mockCountAndData(0, []);

    // Simulate Next.js passing an array when the same param appears twice
    const req = {
      method: 'GET',
      headers: { cookie: 'session=test' },
      query: { actorId: ['user-1', 'user-2'] as unknown as string },
      body: {},
    };
    const res = makeRes();

    await auditLogHandler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);

    // Should not 400 — first element taken, length check is on a string
    expect(res.status).toHaveBeenCalledWith(200);
    // actorId filter should use 'user-1' (first element)
    const countParams: string[] = mockQuery.mock.calls[0][1];
    expect(countParams[0]).toBe('user-1');
  });

  it('returns 400 for invalid dateFrom (non-ISO string)', async () => {
    mockGetSession.mockResolvedValue(ownerSession);

    const req = makeReq('GET', { query: { dateFrom: 'not-a-date' } });
    const res = makeRes();

    await auditLogHandler(req as NextApiRequest, res as unknown as NextApiResponse);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error).toMatch(/dateFrom/);
  });

  it('returns 400 for invalid dateTo (non-ISO string)', async () => {
    mockGetSession.mockResolvedValue(ownerSession);

    const req = makeReq('GET', { query: { dateTo: 'yesterday' } });
    const res = makeRes();

    await auditLogHandler(req as NextApiRequest, res as unknown as NextApiResponse);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error).toMatch(/dateTo/);
  });

  it('accepts valid ISO dateFrom/dateTo', async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    mockCountAndData(0, []);

    const req = makeReq('GET', {
      query: { dateFrom: '2026-01-01T00:00:00Z', dateTo: '2026-12-31T23:59:59Z' },
    });
    const res = makeRes();

    await auditLogHandler(req as NextApiRequest, res as unknown as NextApiResponse);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('listAuditLog — invalid date handling', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('throws on invalid dateFrom to prevent PostgreSQL cast error (500 risk)', async () => {
    await expect(listAuditLog({ dateFrom: 'not-a-date' })).rejects.toThrow(/dateFrom/);
  });

  it('throws on invalid dateTo to prevent PostgreSQL cast error (500 risk)', async () => {
    await expect(listAuditLog({ dateTo: 'yesterday' })).rejects.toThrow(/dateTo/);
  });

  it('accepts valid ISO dateFrom/dateTo without throwing', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      listAuditLog({ dateFrom: '2026-01-01T00:00:00Z', dateTo: '2026-12-31T23:59:59Z' })
    ).resolves.not.toThrow();
  });
});
