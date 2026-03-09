/**
 * Unit tests for User Invitation Flow — ScaledTest-j83
 *
 * Tests cover:
 * - Pure token helpers (generateInviteToken, hashInviteToken)
 * - DB helpers (createInvitation, getInvitationByToken, listInvitations, revokeInvitation)
 * - POST /api/admin/invitations — create invitation (owner/maintainer)
 * - GET  /api/admin/invitations — list invitations (owner/maintainer)
 * - GET  /api/admin/invitations/[token] — fetch invite details (public)
 * - POST /api/admin/invitations/[token]/accept — accept invite (public)
 */

import { NextApiRequest, NextApiResponse } from 'next';

// ── Mocks (must be before imports) ────────────────────────────────────────────

jest.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
  authAdminApi: {
    updateUser: jest.fn(),
    deleteUser: jest.fn(),
  },
}));

jest.mock('@/lib/auth-client', () => ({
  authClient: {
    signUp: {
      email: jest.fn(),
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

// Mock invitations module — keep pure helpers real, stub DB ops.
jest.mock('@/lib/invitations', () => {
  const actual = jest.requireActual<typeof import('@/lib/invitations')>('@/lib/invitations');
  return {
    ...actual,
    createInvitation: jest.fn(),
    getInvitationByToken: jest.fn(),
    claimInvitationForAcceptance: jest.fn(),
    unclaimInvitation: jest.fn(),
    listInvitations: jest.fn(),
    revokeInvitation: jest.fn(),
    markInvitationAccepted: jest.fn(),
  };
});

// ── Imports ───────────────────────────────────────────────────────────────────

import { auth, authAdminApi } from '@/lib/auth';
import { authClient } from '@/lib/auth-client';
import {
  generateInviteToken,
  hashInviteToken,
  INVITE_TOKEN_PREFIX,
  createInvitation,
  getInvitationByToken,
  claimInvitationForAcceptance,
  unclaimInvitation,
  listInvitations,
  revokeInvitation,
  markInvitationAccepted,
  type Invitation,
} from '@/lib/invitations';
import indexHandler from '@/pages/api/admin/invitations/index';
import tokenHandler from '@/pages/api/admin/invitations/[token]';

// ── Typed mocks ───────────────────────────────────────────────────────────────

const mockGetSession = auth.api.getSession as unknown as jest.Mock;
const mockUpdateUser = (authAdminApi as { updateUser: jest.Mock }).updateUser;
const mockDeleteUser = (authAdminApi as { deleteUser: jest.Mock }).deleteUser;
const mockSignUp = authClient.signUp.email as jest.Mock;
const mockCreateInvitation = createInvitation as jest.Mock;
const mockGetInvitationByToken = getInvitationByToken as jest.Mock;
const mockClaimInvitationForAcceptance = claimInvitationForAcceptance as jest.Mock;
const mockUnclaimInvitation = unclaimInvitation as jest.Mock;
const mockListInvitations = listInvitations as jest.Mock;
const mockRevokeInvitation = revokeInvitation as jest.Mock;
const mockMarkInvitationAccepted = markInvitationAccepted as jest.Mock;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(
  method: string,
  body: Record<string, unknown> = {},
  query: Record<string, string> = {}
): Partial<NextApiRequest> {
  return {
    method,
    headers: { authorization: 'Bearer test-token' },
    body,
    query,
  };
}

function makeRes(): { status: jest.Mock; json: jest.Mock; setHeader: jest.Mock } {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
  };
  return res;
}

const ownerSession = {
  user: { id: 'owner-id', email: 'owner@example.com', role: 'owner' },
  session: { id: 's1', userId: 'owner-id', token: 'tok1' },
};

const maintainerSession = {
  user: { id: 'maintainer-id', email: 'maint@example.com', role: 'maintainer' },
  session: { id: 's2', userId: 'maintainer-id', token: 'tok2' },
};

const readonlySession = {
  user: { id: 'readonly-id', email: 'read@example.com', role: 'readonly' },
  session: { id: 's3', userId: 'readonly-id', token: 'tok3' },
};

function makeInvitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: '550e8400-e29b-41d4-a716-446655440001',
    email: 'invitee@example.com',
    role: 'readonly',
    tokenHash: 'abc123hash',
    tokenPrefix: 'inv_abc123',
    invitedByUserId: 'owner-id',
    teamId: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    acceptedAt: null,
    revokedAt: null,
    createdAt: new Date('2026-03-01T00:00:00Z'),
    ...overrides,
  };
}

// ── Pure helper tests ─────────────────────────────────────────────────────────

describe('invitation token helpers', () => {
  describe('generateInviteToken', () => {
    it('generates a token with the correct prefix', () => {
      const token = generateInviteToken();
      expect(token.startsWith(INVITE_TOKEN_PREFIX)).toBe(true);
    });

    it('generates tokens with sufficient entropy (length > 40)', () => {
      const token = generateInviteToken();
      expect(token.length).toBeGreaterThan(40);
    });

    it('generates unique tokens on repeated calls', () => {
      const tokens = new Set(Array.from({ length: 10 }, () => generateInviteToken()));
      expect(tokens.size).toBe(10);
    });
  });

  describe('hashInviteToken', () => {
    it('returns a 64-character hex string', () => {
      const token = generateInviteToken();
      const hash = hashInviteToken(token);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces consistent hashes for the same input', () => {
      const token = 'inv_testtoken';
      expect(hashInviteToken(token)).toBe(hashInviteToken(token));
    });

    it('produces different hashes for different tokens', () => {
      expect(hashInviteToken('inv_aaa')).not.toBe(hashInviteToken('inv_bbb'));
    });
  });
});

// ── POST /api/admin/invitations ───────────────────────────────────────────────

describe('POST /api/admin/invitations', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null);
    const req = makeReq('POST', { email: 'test@example.com', role: 'readonly' });
    const res = makeRes();
    await indexHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 403 when user is readonly', async () => {
    mockGetSession.mockResolvedValue(readonlySession);
    const req = makeReq('POST', { email: 'test@example.com', role: 'readonly' });
    const res = makeRes();
    await indexHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 400 when email is missing', async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    const req = makeReq('POST', { role: 'readonly' });
    const res = makeRes();
    await indexHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when email is invalid', async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    const req = makeReq('POST', { email: 'not-an-email', role: 'readonly' });
    const res = makeRes();
    await indexHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when role is invalid', async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    const req = makeReq('POST', { email: 'test@example.com', role: 'superadmin' });
    const res = makeRes();
    await indexHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when maintainer tries to invite an owner', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    const req = makeReq('POST', { email: 'test@example.com', role: 'owner' });
    const res = makeRes();
    await indexHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 201 with invitation when owner creates invite', async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    const inv = makeInvitation();
    mockCreateInvitation.mockResolvedValue(inv);
    const req = makeReq('POST', { email: 'invitee@example.com', role: 'readonly' });
    const res = makeRes();
    await indexHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(mockCreateInvitation).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(201);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.invitation).toBeDefined();
    // The raw token must be included in the response (only time it's returned)
    expect(jsonArg.token).toBeDefined();
    expect(typeof jsonArg.token).toBe('string');
  });

  it('returns 201 when maintainer creates a readonly invite', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    const inv = makeInvitation();
    mockCreateInvitation.mockResolvedValue(inv);
    const req = makeReq('POST', { email: 'invitee@example.com', role: 'readonly' });
    const res = makeRes();
    await indexHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('returns 201 when maintainer creates a maintainer invite', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    const inv = makeInvitation({ role: 'maintainer' });
    mockCreateInvitation.mockResolvedValue(inv);
    const req = makeReq('POST', { email: 'invitee@example.com', role: 'maintainer' });
    const res = makeRes();
    await indexHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('returns 500 when DB create fails', async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    mockCreateInvitation.mockRejectedValue(new Error('DB failure'));
    const req = makeReq('POST', { email: 'test@example.com', role: 'readonly' });
    const res = makeRes();
    await indexHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('does not expose the token hash in the response', async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    const inv = makeInvitation();
    mockCreateInvitation.mockResolvedValue(inv);
    const req = makeReq('POST', { email: 'invitee@example.com', role: 'readonly' });
    const res = makeRes();
    await indexHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.invitation?.tokenHash).toBeUndefined();
  });

  it('returns 405 for unsupported methods (PUT)', async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    const req = makeReq('PUT', {});
    const res = makeRes();
    await indexHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});

// ── GET /api/admin/invitations ────────────────────────────────────────────────

describe('GET /api/admin/invitations', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null);
    const req = makeReq('GET');
    const res = makeRes();
    await indexHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 403 when user is readonly', async () => {
    mockGetSession.mockResolvedValue(readonlySession);
    const req = makeReq('GET');
    const res = makeRes();
    await indexHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 200 with invitation list for owner', async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    mockListInvitations.mockResolvedValue([
      makeInvitation(),
      makeInvitation({ id: 'id-2', email: 'b@b.com' }),
    ]);
    const req = makeReq('GET');
    const res = makeRes();
    await indexHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(200);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.invitations).toHaveLength(2);
  });

  it('returns 200 with invitation list for maintainer', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    mockListInvitations.mockResolvedValue([makeInvitation()]);
    const req = makeReq('GET');
    const res = makeRes();
    await indexHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('does not expose tokenHash in list response', async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    mockListInvitations.mockResolvedValue([makeInvitation()]);
    const req = makeReq('GET');
    const res = makeRes();
    await indexHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    const jsonArg = res.json.mock.calls[0][0];
    for (const inv of jsonArg.invitations) {
      expect(inv.tokenHash).toBeUndefined();
    }
  });

  it('returns 500 when DB list fails', async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    mockListInvitations.mockRejectedValue(new Error('DB failure'));
    const req = makeReq('GET');
    const res = makeRes();
    await indexHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── GET /api/admin/invitations/[token] ────────────────────────────────────────

describe('GET /api/admin/invitations/[token]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when token query param is missing', async () => {
    const req = makeReq('GET', {}, {});
    const res = makeRes();
    await tokenHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when invitation not found', async () => {
    mockGetInvitationByToken.mockResolvedValue(null);
    const req = makeReq('GET', {}, { token: 'inv_notfound' });
    const res = makeRes();
    await tokenHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 410 when invitation has expired', async () => {
    mockGetInvitationByToken.mockResolvedValue(
      makeInvitation({ expiresAt: new Date(Date.now() - 1000) })
    );
    const req = makeReq('GET', {}, { token: 'inv_expired' });
    const res = makeRes();
    await tokenHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(410);
  });

  it('returns 410 when invitation has already been accepted', async () => {
    mockGetInvitationByToken.mockResolvedValue(makeInvitation({ acceptedAt: new Date() }));
    const req = makeReq('GET', {}, { token: 'inv_accepted' });
    const res = makeRes();
    await tokenHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(410);
  });

  it('returns 410 when invitation has been revoked', async () => {
    mockGetInvitationByToken.mockResolvedValue(makeInvitation({ revokedAt: new Date() }));
    const req = makeReq('GET', {}, { token: 'inv_revoked' });
    const res = makeRes();
    await tokenHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(410);
  });

  it('returns 200 with safe invitation details for a valid token', async () => {
    const inv = makeInvitation();
    mockGetInvitationByToken.mockResolvedValue(inv);
    const req = makeReq('GET', {}, { token: 'inv_valid' });
    const res = makeRes();
    await tokenHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(200);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.invitation).toBeDefined();
    expect(jsonArg.invitation.email).toBe(inv.email);
    expect(jsonArg.invitation.role).toBe(inv.role);
    // tokenHash must never be exposed
    expect(jsonArg.invitation.tokenHash).toBeUndefined();
  });

  it('returns 500 when DB lookup fails', async () => {
    mockGetInvitationByToken.mockRejectedValue(new Error('DB error'));
    const req = makeReq('GET', {}, { token: 'inv_error' });
    const res = makeRes();
    await tokenHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── POST /api/admin/invitations/[token] (accept) ─────────────────────────────

describe('POST /api/admin/invitations/[token] (accept)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when token query param is missing', async () => {
    const req = makeReq('POST', { name: 'Test User', password: 'Pass1234!' }, {});
    const res = makeRes();
    await tokenHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when name is missing', async () => {
    const req = makeReq('POST', { password: 'Pass1234!' }, { token: 'inv_valid' });
    const res = makeRes();
    await tokenHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when password is missing', async () => {
    const req = makeReq('POST', { name: 'Test User' }, { token: 'inv_valid' });
    const res = makeRes();
    await tokenHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when email confirmation is missing', async () => {
    // The handler validates email presence before hitting the DB.
    const req = makeReq(
      'POST',
      { name: 'Test User', password: 'Pass1234!' },
      { token: 'inv_valid' }
    );
    const res = makeRes();
    await tokenHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 410 when invitation is not claimable (not found / expired / already accepted / revoked)', async () => {
    // claimInvitationForAcceptance returns null for all invalid states —
    // not found, expired, accepted, revoked — the handler collapses them all to 410.
    mockClaimInvitationForAcceptance.mockResolvedValue(null);
    const req = makeReq(
      'POST',
      { name: 'Test User', password: 'Pass1234!', email: 'invitee@example.com' },
      { token: 'inv_missing' }
    );
    const res = makeRes();
    await tokenHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(410);
  });

  it('returns 400 when supplied email does not match invitation email', async () => {
    const inv = makeInvitation(); // email: 'invitee@example.com'
    mockClaimInvitationForAcceptance.mockResolvedValue(inv);
    mockUnclaimInvitation.mockResolvedValue(undefined);
    const req = makeReq(
      'POST',
      { name: 'Test User', password: 'Pass1234!', email: 'wrong@example.com' },
      { token: 'inv_valid' }
    );
    const res = makeRes();
    await tokenHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(mockUnclaimInvitation).toHaveBeenCalledWith(inv.id);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 201 on successful accept: creates user, assigns role, marks accepted', async () => {
    const inv = makeInvitation();
    mockClaimInvitationForAcceptance.mockResolvedValue(inv);
    mockSignUp.mockResolvedValue({
      data: { user: { id: 'new-user-id', email: inv.email } },
      error: null,
    });
    mockUpdateUser.mockResolvedValue(undefined);
    mockMarkInvitationAccepted.mockResolvedValue(undefined);

    const req = makeReq(
      'POST',
      { name: 'Test User', password: 'SecurePass1!', email: inv.email },
      { token: 'inv_valid' }
    );
    const res = makeRes();
    await tokenHandler(req as NextApiRequest, res as unknown as NextApiResponse);

    expect(mockSignUp).toHaveBeenCalledWith({
      email: inv.email,
      password: 'SecurePass1!',
      name: 'Test User',
    });
    expect(mockUpdateUser).toHaveBeenCalledWith({ userId: 'new-user-id', role: inv.role });
    expect(mockMarkInvitationAccepted).toHaveBeenCalledWith(inv.id);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('rolls back user and unclams invitation if role assignment fails', async () => {
    const inv = makeInvitation();
    mockClaimInvitationForAcceptance.mockResolvedValue(inv);
    mockSignUp.mockResolvedValue({
      data: { user: { id: 'new-user-id', email: inv.email } },
      error: null,
    });
    mockUpdateUser.mockRejectedValue(new Error('role assignment failed'));
    mockDeleteUser.mockResolvedValue(undefined);
    mockUnclaimInvitation.mockResolvedValue(undefined);

    const req = makeReq(
      'POST',
      { name: 'Test User', password: 'SecurePass1!', email: inv.email },
      { token: 'inv_valid' }
    );
    const res = makeRes();
    await tokenHandler(req as NextApiRequest, res as unknown as NextApiResponse);

    expect(mockDeleteUser).toHaveBeenCalledWith({ userId: 'new-user-id' });
    expect(mockUnclaimInvitation).toHaveBeenCalledWith(inv.id);
    expect(mockMarkInvitationAccepted).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('returns 400 when signUp fails (e.g. email already taken)', async () => {
    const inv = makeInvitation();
    mockClaimInvitationForAcceptance.mockResolvedValue(inv);
    mockUnclaimInvitation.mockResolvedValue(undefined);
    mockSignUp.mockResolvedValue({
      data: null,
      error: { message: 'User already exists' },
    });

    const req = makeReq(
      'POST',
      { name: 'Test User', password: 'SecurePass1!', email: inv.email },
      { token: 'inv_valid' }
    );
    const res = makeRes();
    await tokenHandler(req as NextApiRequest, res as unknown as NextApiResponse);

    expect(mockUnclaimInvitation).toHaveBeenCalledWith(inv.id);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 405 for unsupported methods (PUT)', async () => {
    // DELETE is a supported method on this endpoint (revoke). Use PUT instead.
    const req = makeReq('PUT', {}, { token: 'inv_valid' });
    const res = makeRes();
    await tokenHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});

// ── DELETE /api/admin/invitations/[token] (revoke) ──────────────────────────

describe('DELETE /api/admin/invitations/[token] (revoke)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null);
    const req = makeReq('DELETE', {}, { token: 'inv_valid' });
    const res = makeRes();
    await tokenHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 403 when user is readonly', async () => {
    mockGetSession.mockResolvedValue(readonlySession);
    const req = makeReq('DELETE', {}, { token: 'inv_valid' });
    const res = makeRes();
    await tokenHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 404 when invitation not found', async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    mockRevokeInvitation.mockResolvedValue(false);
    const req = makeReq('DELETE', {}, { token: 'inv_missing' });
    const res = makeRes();
    await tokenHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 200 when invitation is successfully revoked by owner', async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    mockRevokeInvitation.mockResolvedValue(true);
    const req = makeReq('DELETE', {}, { token: 'inv_valid' });
    const res = makeRes();
    await tokenHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(mockRevokeInvitation).toHaveBeenCalledWith('inv_valid');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 200 when invitation is successfully revoked by maintainer', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    mockRevokeInvitation.mockResolvedValue(true);
    const req = makeReq('DELETE', {}, { token: 'inv_valid' });
    const res = makeRes();
    await tokenHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 when DB revoke fails', async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    mockRevokeInvitation.mockRejectedValue(new Error('DB error'));
    const req = makeReq('DELETE', {}, { token: 'inv_valid' });
    const res = makeRes();
    await tokenHandler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
