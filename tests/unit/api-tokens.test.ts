/**
 * Unit tests for API tokens — ScaledTest-xjo
 * Headless authentication for CI pipelines and worker pods.
 *
 * Tests cover:
 * - Token generation helpers (generateToken, hashToken)
 * - POST /api/v1/teams/[teamId]/tokens — create token
 * - GET  /api/v1/teams/[teamId]/tokens — list tokens
 * - DELETE /api/v1/teams/[teamId]/tokens/[tokenId] — revoke token
 */

import { NextApiRequest, NextApiResponse } from 'next';

// ── Mocks (must be before imports) ────────────────────────────────────────────

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

// Mock the entire apiTokens module.
// We spread the real module so that pure helpers (generateToken, hashToken,
// TOKEN_PREFIX) are still the real implementations — only the DB-backed
// functions are replaced with jest mocks.
jest.mock('@/lib/apiTokens', () => {
  const actual = jest.requireActual<typeof import('@/lib/apiTokens')>('@/lib/apiTokens');
  return {
    ...actual,
    createApiToken: jest.fn(),
    listApiTokens: jest.fn(),
    revokeApiToken: jest.fn(),
    validateApiToken: jest.fn(),
  };
});

// Mock teamManagement for team membership checks.
// Maintainer is a member of TEAM_ID; readonly user is not.
const TEAM_ID_FOR_MOCK = 'e448a171-c510-46a8-bf0a-dc3a99b404b7';
const mockGetUserTeams = jest.fn().mockImplementation((userId: string) => {
  if (userId === 'user-maintainer') {
    return Promise.resolve([{ id: TEAM_ID_FOR_MOCK, name: 'Test Team' }]);
  }
  return Promise.resolve([]);
});
jest.mock('@/lib/teamManagement', () => ({
  ...jest.requireActual('@/lib/teamManagement'),
  getUserTeams: (...args: unknown[]) => mockGetUserTeams(...args),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { auth } from '@/lib/auth';
import {
  generateToken,
  hashToken,
  TOKEN_PREFIX,
  createApiToken,
  listApiTokens,
  revokeApiToken,
} from '@/lib/apiTokens';
import createHandler from '@/pages/api/v1/teams/[teamId]/tokens/index';
import revokeHandler from '@/pages/api/v1/teams/[teamId]/tokens/[tokenId]';

// ── Typed mocks ───────────────────────────────────────────────────────────────

const mockGetSession = auth.api.getSession as unknown as jest.Mock;
const mockCreateApiToken = createApiToken as jest.Mock;
const mockListApiTokens = listApiTokens as jest.Mock;
const mockRevokeApiToken = revokeApiToken as jest.Mock;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(
  method: string,
  opts: {
    query?: Record<string, string>;
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  } = {}
): Partial<NextApiRequest> {
  return {
    method,
    headers: { authorization: 'Bearer test-token', ...opts.headers },
    query: opts.query ?? {},
    body: opts.body ?? {},
  };
}

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
    end: jest.fn(),
  };
}

// ── Test data ─────────────────────────────────────────────────────────────────

const TEAM_ID = 'e448a171-c510-46a8-bf0a-dc3a99b404b7';
const TOKEN_ID = 'd9b7389e-0b82-45fc-abcb-03b7664a296b';

const maintainerSession = {
  user: {
    id: 'user-maintainer',
    email: 'maintainer@example.com',
    name: 'Maint',
    role: 'maintainer',
  },
  session: { id: 'sess1', userId: 'user-maintainer', token: 'tok1' },
};

const readonlySession = {
  user: { id: 'user-readonly', email: 'readonly@example.com', name: 'RO', role: 'readonly' },
  session: { id: 'sess2', userId: 'user-readonly', token: 'tok2' },
};

const storedToken = {
  id: TOKEN_ID,
  name: 'CI Token',
  tokenPrefix: 'sct_abcd1234',
  teamId: TEAM_ID,
  createdByUserId: 'user-maintainer',
  createdAt: new Date('2026-01-01'),
  lastUsedAt: null,
  expiresAt: null,
};

// ── Pure helpers ──────────────────────────────────────────────────────────────

describe('apiTokens lib', () => {
  describe('generateToken', () => {
    it('produces a string starting with the prefix', () => {
      const token = generateToken();
      expect(token.startsWith(TOKEN_PREFIX)).toBe(true);
    });

    it('produces unique tokens on every call', () => {
      const t1 = generateToken();
      const t2 = generateToken();
      expect(t1).not.toBe(t2);
    });

    it('is long enough to be a secure secret (>= 60 chars)', () => {
      expect(generateToken().length).toBeGreaterThanOrEqual(60);
    });
  });

  describe('hashToken', () => {
    it('returns a deterministic sha-256 hex string', () => {
      const h = hashToken('secret');
      expect(h).toBe(hashToken('secret'));
      expect(h).toHaveLength(64);
      expect(/^[0-9a-f]+$/.test(h)).toBe(true);
    });

    it('different inputs produce different hashes', () => {
      expect(hashToken('a')).not.toBe(hashToken('b'));
    });
  });
});

// ── POST /api/v1/teams/[teamId]/tokens ────────────────────────────────────────

describe('POST /api/v1/teams/[teamId]/tokens', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = makeRes();
    await createHandler(
      makeReq('POST', {
        query: { teamId: TEAM_ID },
        body: { name: 'CI' },
        headers: {},
      }) as NextApiRequest,
      res as unknown as NextApiResponse
    );
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 403 when authenticated as readonly', async () => {
    mockGetSession.mockResolvedValue(readonlySession);
    const res = makeRes();
    await createHandler(
      makeReq('POST', { query: { teamId: TEAM_ID }, body: { name: 'CI' } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 400 when name is missing', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    const res = makeRes();
    await createHandler(
      makeReq('POST', { query: { teamId: TEAM_ID }, body: {} }) as NextApiRequest,
      res as unknown as NextApiResponse
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when teamId is not a valid UUID', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    const res = makeRes();
    await createHandler(
      makeReq('POST', { query: { teamId: 'not-a-uuid' }, body: { name: 'CI' } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('creates a token and returns the raw secret once', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    mockCreateApiToken.mockResolvedValue(storedToken);

    const res = makeRes();
    await createHandler(
      makeReq('POST', { query: { teamId: TEAM_ID }, body: { name: 'CI Token' } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );

    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(typeof body.data.token).toBe('string');
    expect(body.data.token.startsWith(TOKEN_PREFIX)).toBe(true);
    expect(body.data.id).toBe(TOKEN_ID);
    expect(body.data.name).toBe('CI Token');
    expect(body.data.tokenPrefix).toBeDefined();
  });

  it('returns 405 for unsupported method', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    const res = makeRes();
    await createHandler(
      makeReq('PATCH', { query: { teamId: TEAM_ID } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );
    expect(res.status).toHaveBeenCalledWith(405);
  });
});

// ── GET /api/v1/teams/[teamId]/tokens ─────────────────────────────────────────

describe('GET /api/v1/teams/[teamId]/tokens', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = makeRes();
    await createHandler(
      makeReq('GET', { query: { teamId: TEAM_ID }, headers: {} }) as NextApiRequest,
      res as unknown as NextApiResponse
    );
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 403 when authenticated as readonly', async () => {
    mockGetSession.mockResolvedValue(readonlySession);
    const res = makeRes();
    await createHandler(
      makeReq('GET', { query: { teamId: TEAM_ID } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('lists tokens without exposing raw secret or hash', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    mockListApiTokens.mockResolvedValue([storedToken]);

    const res = makeRes();
    await createHandler(
      makeReq('GET', { query: { teamId: TEAM_ID } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    body.data.forEach((t: Record<string, unknown>) => {
      expect(t.token).toBeUndefined();
      expect(t.tokenHash).toBeUndefined();
    });
    expect(body.data[0].id).toBe(TOKEN_ID);
    expect(body.data[0].name).toBe('CI Token');
    expect(body.data[0].tokenPrefix).toBeDefined();
  });
});

// ── DELETE /api/v1/teams/[teamId]/tokens/[tokenId] ────────────────────────────

describe('DELETE /api/v1/teams/[teamId]/tokens/[tokenId]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = makeRes();
    await revokeHandler(
      makeReq('DELETE', {
        query: { teamId: TEAM_ID, tokenId: TOKEN_ID },
        headers: {},
      }) as NextApiRequest,
      res as unknown as NextApiResponse
    );
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 403 when authenticated as readonly', async () => {
    mockGetSession.mockResolvedValue(readonlySession);
    const res = makeRes();
    await revokeHandler(
      makeReq('DELETE', { query: { teamId: TEAM_ID, tokenId: TOKEN_ID } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 400 when tokenId is not a valid UUID', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    const res = makeRes();
    await revokeHandler(
      makeReq('DELETE', { query: { teamId: TEAM_ID, tokenId: 'bad-id' } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when token not found', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    mockRevokeApiToken.mockResolvedValue(false);
    const res = makeRes();
    await revokeHandler(
      makeReq('DELETE', { query: { teamId: TEAM_ID, tokenId: TOKEN_ID } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('revokes the token successfully', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    mockRevokeApiToken.mockResolvedValue(true);
    const res = makeRes();
    await revokeHandler(
      makeReq('DELETE', { query: { teamId: TEAM_ID, tokenId: TOKEN_ID } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].success).toBe(true);
  });

  it('returns 405 for unsupported method', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    const res = makeRes();
    await revokeHandler(
      makeReq('POST', { query: { teamId: TEAM_ID, tokenId: TOKEN_ID } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );
    expect(res.status).toHaveBeenCalledWith(405);
  });
});
