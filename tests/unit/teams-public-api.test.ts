/**
 * Unit tests for GET /api/teams/public
 *
 * This is a public endpoint — no auth required.
 * Returns basic team info (id, name, description) for unauthenticated users
 * (e.g., the registration page needs to show available teams).
 */

import { NextApiRequest, NextApiResponse } from 'next';

// Mock teamManagement
jest.mock('@/lib/teamManagement', () => ({
  getAllTeams: jest.fn(),
}));

// Mock logger
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
}));

import { getAllTeams } from '@/lib/teamManagement';
import handler from '@/pages/api/teams/public';

const mockGetAllTeams = getAllTeams as jest.Mock;

function makeReq(method: string = 'GET'): Partial<NextApiRequest> {
  return { method, headers: {} };
}

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
  };
}

describe('GET /api/teams/public', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 with team list when teams exist', async () => {
    mockGetAllTeams.mockResolvedValue([
      {
        id: 'team-1',
        name: 'Alpha Team',
        description: 'First team',
        isDefault: true,
        memberCount: 5,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
      {
        id: 'team-2',
        name: 'Beta Team',
        description: 'Second team',
        isDefault: false,
        memberCount: 3,
        createdAt: new Date('2024-01-02'),
        updatedAt: new Date('2024-01-02'),
      },
    ]);

    const req = makeReq('GET');
    const res = makeRes();
    await handler(req as NextApiRequest, res as unknown as NextApiResponse);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        teams: expect.arrayContaining([
          expect.objectContaining({ id: 'team-1', name: 'Alpha Team' }),
          expect.objectContaining({ id: 'team-2', name: 'Beta Team' }),
        ]),
      })
    );
  });

  it('returns 200 with empty array when no teams exist', async () => {
    mockGetAllTeams.mockResolvedValue([]);
    const req = makeReq('GET');
    const res = makeRes();
    await handler(req as NextApiRequest, res as unknown as NextApiResponse);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, teams: [] }));
  });

  it('does NOT expose memberCount in public response', async () => {
    mockGetAllTeams.mockResolvedValue([
      {
        id: 'team-1',
        name: 'Alpha Team',
        description: 'First team',
        isDefault: true,
        memberCount: 42,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const req = makeReq('GET');
    const res = makeRes();
    await handler(req as NextApiRequest, res as unknown as NextApiResponse);

    const teams = (res.json.mock.calls[0][0] as { teams: Record<string, unknown>[] }).teams;
    expect(teams[0]).not.toHaveProperty('memberCount');
  });

  it('returns only id, name, description, isDefault fields', async () => {
    mockGetAllTeams.mockResolvedValue([
      {
        id: 'team-1',
        name: 'Alpha Team',
        description: 'First team',
        isDefault: true,
        memberCount: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const req = makeReq('GET');
    const res = makeRes();
    await handler(req as NextApiRequest, res as unknown as NextApiResponse);

    const teams = (res.json.mock.calls[0][0] as { teams: Record<string, unknown>[] }).teams;
    const keys = Object.keys(teams[0]);
    expect(keys).toEqual(expect.arrayContaining(['id', 'name', 'description', 'isDefault']));
    // Should not contain internal/sensitive fields
    expect(keys).not.toContain('memberCount');
    expect(keys).not.toContain('createdAt');
    expect(keys).not.toContain('updatedAt');
  });

  it('returns 405 for non-GET methods', async () => {
    const req = makeReq('POST');
    const res = makeRes();
    await handler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('returns 500 when getAllTeams throws', async () => {
    mockGetAllTeams.mockRejectedValue(new Error('DB connection failed'));
    const req = makeReq('GET');
    const res = makeRes();
    await handler(req as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('does not require authorization headers', async () => {
    mockGetAllTeams.mockResolvedValue([]);
    // No auth header at all
    const req = { method: 'GET', headers: {} } as Partial<NextApiRequest>;
    const res = makeRes();
    await handler(req as NextApiRequest, res as unknown as NextApiResponse);
    // Should succeed (200) without auth
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
