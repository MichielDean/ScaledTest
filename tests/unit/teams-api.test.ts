/**
 * Unit tests for /api/teams (also served as /api/v1/teams)
 *
 * Covers:
 * - GET /api/teams — list all teams
 * - GET /api/teams?users=true — list users with team assignments
 * - POST /api/teams (name) — create team
 * - POST /api/teams (userId+teamId) — assign user to team
 * - DELETE /api/teams — remove user from team
 * - Auth: 401 unauthenticated, 403 insufficient role
 * - Validation: required fields, UUID format, string length
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
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
  dbLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
  logError: jest.fn(),
}));

jest.mock('@/lib/teamManagement', () => ({
  getAllTeams: jest.fn(),
  createTeam: jest.fn(),
  addUserToTeam: jest.fn(),
  removeUserFromTeam: jest.fn(),
  getUserTeams: jest.fn(),
}));

jest.mock('@/lib/validation', () => ({
  validateUuids: jest.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { auth } from '@/lib/auth';
import {
  getAllTeams,
  createTeam,
  addUserToTeam,
  removeUserFromTeam,
  getUserTeams,
} from '@/lib/teamManagement';
import { validateUuids } from '@/lib/validation';
import handler from '@/pages/api/teams';

// ── Typed mocks ───────────────────────────────────────────────────────────────

const mockGetSession = auth.api.getSession as unknown as jest.Mock;
const mockGetAllTeams = getAllTeams as jest.Mock;
const mockCreateTeam = createTeam as jest.Mock;
const mockAddUserToTeam = addUserToTeam as jest.Mock;
const mockRemoveUserFromTeam = removeUserFromTeam as jest.Mock;
const mockGetUserTeams = getUserTeams as jest.Mock;
const mockValidateUuids = validateUuids as jest.Mock;

// ── Helpers ───────────────────────────────────────────────────────────────────

const TEAM_ID = 'e448a171-c510-46a8-bf0a-dc3a99b404b7';
const USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const ownerSession = {
  user: {
    id: 'user-owner',
    email: 'owner@example.com',
    name: 'Owner User',
    role: 'owner',
  },
  session: { id: 'sess-owner', userId: 'user-owner', token: 'tok-owner' },
};

const maintainerSession = {
  user: {
    id: 'user-maintainer',
    email: 'maintainer@example.com',
    name: 'Maint User',
    role: 'maintainer',
  },
  session: { id: 'sess-maint', userId: 'user-maintainer', token: 'tok-maint' },
};

const readonlySession = {
  user: {
    id: 'user-readonly',
    email: 'readonly@example.com',
    name: 'RO User',
    role: 'readonly',
  },
  session: { id: 'sess-ro', userId: 'user-readonly', token: 'tok-ro' },
};

const sampleTeam = {
  id: TEAM_ID,
  name: 'Alpha Team',
  description: 'Test team',
  memberCount: 5,
  isDefault: false,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

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
    headers: { cookie: 'session=test', ...opts.headers },
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

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('Teams API auth', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = makeRes();
    await handler(makeReq('GET') as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Unauthorized' })
    );
  });

  it('returns 401 when session has no user', async () => {
    mockGetSession.mockResolvedValue({ session: { id: 's1' } });
    const res = makeRes();
    await handler(makeReq('GET') as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 403 for readonly users', async () => {
    mockGetSession.mockResolvedValue(readonlySession);
    const res = makeRes();
    await handler(makeReq('GET') as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('returns 403 for users with no role', async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'u1', email: 'a@b.com', name: 'No Role' },
      session: { id: 's1' },
    });
    const res = makeRes();
    await handler(makeReq('GET') as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 405 for unsupported methods', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    const res = makeRes();
    await handler(makeReq('PATCH') as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});

// ── GET /api/teams ────────────────────────────────────────────────────────────

describe('GET /api/teams', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with teams list for maintainer', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    mockGetAllTeams.mockResolvedValue([sampleTeam]);

    const res = makeRes();
    await handler(makeReq('GET') as NextApiRequest, res as unknown as NextApiResponse);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(TEAM_ID);
    expect(body.data[0].name).toBe('Alpha Team');
  });

  it('returns 200 with empty array when no teams', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    mockGetAllTeams.mockResolvedValue([]);

    const res = makeRes();
    await handler(makeReq('GET') as NextApiRequest, res as unknown as NextApiResponse);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data).toEqual([]);
  });

  it('includes permissions for maintainer', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    mockGetAllTeams.mockResolvedValue([]);

    const res = makeRes();
    await handler(makeReq('GET') as NextApiRequest, res as unknown as NextApiResponse);

    const body = res.json.mock.calls[0][0];
    expect(body.permissions).toBeDefined();
    expect(body.permissions.canCreateTeam).toBe(true);
    expect(body.permissions.canAssignUsers).toBe(true);
    expect(body.permissions.canDeleteTeam).toBe(false);
    expect(body.permissions.assignableTeams).toEqual([]);
  });

  it('includes expanded permissions for owner', async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    mockGetAllTeams.mockResolvedValue([sampleTeam]);

    const res = makeRes();
    await handler(makeReq('GET') as NextApiRequest, res as unknown as NextApiResponse);

    const body = res.json.mock.calls[0][0];
    expect(body.permissions.canDeleteTeam).toBe(true);
    expect(body.permissions.assignableTeams).toContain(TEAM_ID);
  });

  it('returns 500 when getAllTeams throws', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    mockGetAllTeams.mockRejectedValue(new Error('DB error'));

    const res = makeRes();
    await handler(makeReq('GET') as NextApiRequest, res as unknown as NextApiResponse);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].success).toBe(false);
  });
});

// ── POST /api/teams — create team ─────────────────────────────────────────────

describe('POST /api/teams — create team', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a team and returns 201', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    mockCreateTeam.mockResolvedValue({
      id: 'new-team-id',
      name: 'New Team',
      description: 'A new team',
      isDefault: false,
      createdAt: new Date('2024-06-01'),
      updatedAt: new Date('2024-06-01'),
    });

    const res = makeRes();
    await handler(
      makeReq('POST', { body: { name: 'New Team', description: 'A new team' } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );

    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('New Team');
    expect(body.message).toBe('Team created successfully');
    expect(mockCreateTeam).toHaveBeenCalledWith(
      { name: 'New Team', description: 'A new team' },
      maintainerSession.user.id
    );
  });

  it('returns 400 when name is missing', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    const res = makeRes();
    await handler(
      makeReq('POST', { body: { description: 'no name' } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when name is empty string', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    const res = makeRes();
    await handler(
      makeReq('POST', { body: { name: '   ' } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when name exceeds 100 characters', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    const res = makeRes();
    await handler(
      makeReq('POST', { body: { name: 'x'.repeat(101) } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toContain('100');
  });

  it('returns 400 when name is not a string', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    const res = makeRes();
    await handler(
      makeReq('POST', { body: { name: 42 } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when description exceeds 500 characters', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    const res = makeRes();
    await handler(
      makeReq('POST', { body: { name: 'Team', description: 'x'.repeat(501) } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toContain('500');
  });

  it('returns 400 when description is not a string', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    const res = makeRes();
    await handler(
      makeReq('POST', { body: { name: 'Team', description: 123 } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('trims team name before creating', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    mockCreateTeam.mockResolvedValue({
      id: 'new-id',
      name: 'Trimmed',
      description: undefined,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = makeRes();
    await handler(
      makeReq('POST', { body: { name: '  Trimmed  ' } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );

    expect(mockCreateTeam).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Trimmed' }),
      expect.any(String)
    );
  });

  it('returns 500 when createTeam throws', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    mockCreateTeam.mockRejectedValue(new Error('Duplicate name'));

    const res = makeRes();
    await handler(
      makeReq('POST', { body: { name: 'Dupe' } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].error).toContain('Duplicate name');
  });
});

// ── POST /api/teams — assign user ─────────────────────────────────────────────

describe('POST /api/teams — assign user to team', () => {
  beforeEach(() => jest.clearAllMocks());

  it('assigns user to team and returns 200', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    mockValidateUuids.mockImplementation(() => {}); // no throw = valid
    mockAddUserToTeam.mockResolvedValue(undefined);

    const res = makeRes();
    await handler(
      makeReq('POST', { body: { userId: USER_ID, teamId: TEAM_ID } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].success).toBe(true);
    expect(res.json.mock.calls[0][0].message).toContain('assigned');
    expect(mockAddUserToTeam).toHaveBeenCalledWith(USER_ID, TEAM_ID, maintainerSession.user.id);
  });

  it('returns 400 when userId is missing', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    const res = makeRes();
    await handler(
      makeReq('POST', { body: { teamId: TEAM_ID } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toContain('User ID');
  });

  it('returns 400 when teamId is missing', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    const res = makeRes();
    await handler(
      makeReq('POST', { body: { userId: USER_ID } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toContain('Team ID');
  });

  it('returns 400 when userId is not a string', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    const res = makeRes();
    await handler(
      makeReq('POST', { body: { userId: 123, teamId: TEAM_ID } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when UUIDs are invalid format', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    mockValidateUuids.mockImplementation(() => {
      throw new Error('Invalid UUID format for User ID');
    });

    const res = makeRes();
    await handler(
      makeReq('POST', { body: { userId: 'bad-uuid', teamId: 'bad-uuid' } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toContain('UUID');
  });

  it('returns 500 when addUserToTeam throws', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    mockValidateUuids.mockImplementation(() => {});
    mockAddUserToTeam.mockRejectedValue(new Error('User not found'));

    const res = makeRes();
    await handler(
      makeReq('POST', { body: { userId: USER_ID, teamId: TEAM_ID } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].error).toContain('User not found');
  });
});

// ── DELETE /api/teams ─────────────────────────────────────────────────────────

describe('DELETE /api/teams — remove user from team', () => {
  beforeEach(() => jest.clearAllMocks());

  it('removes user from team and returns 200', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    mockValidateUuids.mockImplementation(() => {});
    mockRemoveUserFromTeam.mockResolvedValue(undefined);

    const res = makeRes();
    await handler(
      makeReq('DELETE', { body: { userId: USER_ID, teamId: TEAM_ID } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].success).toBe(true);
    expect(res.json.mock.calls[0][0].message).toContain('removed');
    expect(mockRemoveUserFromTeam).toHaveBeenCalledWith(USER_ID, TEAM_ID);
  });

  it('returns 400 when userId is missing', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    const res = makeRes();
    await handler(
      makeReq('DELETE', { body: { teamId: TEAM_ID } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when teamId is missing', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    const res = makeRes();
    await handler(
      makeReq('DELETE', { body: { userId: USER_ID } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when UUIDs are invalid format', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    mockValidateUuids.mockImplementation(() => {
      throw new Error('Invalid UUID format');
    });

    const res = makeRes();
    await handler(
      makeReq('DELETE', { body: { userId: 'not-uuid', teamId: 'not-uuid' } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 500 when removeUserFromTeam throws', async () => {
    mockGetSession.mockResolvedValue(maintainerSession);
    mockValidateUuids.mockImplementation(() => {});
    mockRemoveUserFromTeam.mockRejectedValue(new Error('Team not found'));

    const res = makeRes();
    await handler(
      makeReq('DELETE', { body: { userId: USER_ID, teamId: TEAM_ID } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].error).toContain('Team not found');
  });
});

// ── GET /api/teams?users=true ─────────────────────────────────────────────────

describe('GET /api/teams?users=true', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns users with team assignments for owner', async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    // The handler calls auth.api.listUsers internally (cast onto auth)
    // We need to mock the admin API call. The handler does:
    //   (auth as ...).api.listUsers(...)
    // Since auth.api is already mocked, we add listUsers to it:
    (auth.api as Record<string, unknown>).listUsers = jest.fn().mockResolvedValue({
      users: [
        { id: 'u1', email: 'user1@example.com', name: 'User One', role: 'maintainer' },
        { id: 'u2', email: 'user2@example.com', name: 'User Two', role: 'readonly' },
      ],
      total: 2,
    });
    mockGetAllTeams.mockResolvedValue([sampleTeam]);
    mockGetUserTeams.mockResolvedValue([{ id: TEAM_ID, name: 'Alpha Team' }]);

    const res = makeRes();
    await handler(
      makeReq('GET', { query: { users: 'true' } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(2);
    expect(body.data[0]).toHaveProperty('id');
    expect(body.data[0]).toHaveProperty('email');
    expect(body.data[0]).toHaveProperty('teams');
  });

  it('returns 500 when listUsers throws', async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    (auth.api as Record<string, unknown>).listUsers = jest
      .fn()
      .mockRejectedValue(new Error('Admin API down'));

    const res = makeRes();
    await handler(
      makeReq('GET', { query: { users: 'true' } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('handles pagination parameters', async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    const mockListUsers = jest.fn().mockResolvedValue({ users: [], total: 0 });
    (auth.api as Record<string, unknown>).listUsers = mockListUsers;
    mockGetAllTeams.mockResolvedValue([]);

    const res = makeRes();
    await handler(
      makeReq('GET', { query: { users: 'true', page: '2', size: '10' } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );

    expect(res.status).toHaveBeenCalledWith(200);
    // The handler passes offset = (page - 1) * pageSize to listUsers
    expect(mockListUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({
          offset: '10',
          limit: '10',
        }),
      })
    );
  });

  it('caps page size at 100', async () => {
    mockGetSession.mockResolvedValue(ownerSession);
    const mockListUsers = jest.fn().mockResolvedValue({ users: [], total: 0 });
    (auth.api as Record<string, unknown>).listUsers = mockListUsers;
    mockGetAllTeams.mockResolvedValue([]);

    const res = makeRes();
    await handler(
      makeReq('GET', { query: { users: 'true', size: '999' } }) as NextApiRequest,
      res as unknown as NextApiResponse
    );

    expect(mockListUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({
          limit: '100',
        }),
      })
    );
  });
});
