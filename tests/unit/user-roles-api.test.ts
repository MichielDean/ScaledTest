/**
 * Unit tests for /api/admin/user-roles
 *
 * Tests for the real Better Auth admin API integration:
 * - handleAssignRole uses auth.api.setRole (NOT a stub)
 * - handleGetUserRole uses auth.api.listUsers (NOT auth.api.getUser which doesn't exist)
 */

import { NextApiRequest, NextApiResponse } from 'next';

// Mock Better Auth
jest.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: jest.fn(),
      setRole: jest.fn(),
      listUsers: jest.fn(),
    },
  },
  authAdminApi: null,
}));

// Mock logger
jest.mock('@/logging/logger', () => ({
  apiLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Use real validateUuid — it's pure logic with no side effects
jest.unmock('@/lib/validation');

import { auth } from '@/lib/auth';
import handler from '@/pages/api/admin/user-roles';
import type { BetterAuthAdminApi } from '@/pages/api/admin/user-roles';

// The mock replaces auth.api with a plain object that includes setRole and listUsers.
// Better Auth's TypeScript types don't include admin plugin methods, so we cast
// using the same BetterAuthAdminApi interface exported from the production module.
const mockApi = auth.api as unknown as BetterAuthAdminApi;
const mockGetSession = mockApi.getSession as jest.Mock;
const mockSetRole = mockApi.setRole as jest.Mock;
const mockListUsers = mockApi.listUsers as jest.Mock;

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
  session: { id: 's1', userId: 'owner-id', token: 'tok' },
};

const maintainerSession = {
  user: { id: 'maintainer-id', email: 'main@example.com', role: 'maintainer' },
  session: { id: 's2', userId: 'maintainer-id', token: 'tok2' },
};

describe('/api/admin/user-roles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication and Authorization', () => {
    it('returns 401 when no session', async () => {
      mockGetSession.mockResolvedValue(null);
      const req = makeReq('POST', {
        userId: '550e8400-e29b-41d4-a716-446655440001',
        role: 'maintainer',
      });
      const res = makeRes();
      await handler(req as NextApiRequest, res as unknown as NextApiResponse);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 403 when user is not owner', async () => {
      mockGetSession.mockResolvedValue(maintainerSession);
      const req = makeReq('POST', {
        userId: '550e8400-e29b-41d4-a716-446655440001',
        role: 'maintainer',
      });
      const res = makeRes();
      await handler(req as NextApiRequest, res as unknown as NextApiResponse);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('returns 405 for unsupported methods', async () => {
      mockGetSession.mockResolvedValue(ownerSession);
      const req = makeReq('DELETE');
      const res = makeRes();
      await handler(req as NextApiRequest, res as unknown as NextApiResponse);
      expect(res.status).toHaveBeenCalledWith(405);
    });
  });

  describe('POST - assign role', () => {
    it('returns 400 when userId is missing', async () => {
      mockGetSession.mockResolvedValue(ownerSession);
      const req = makeReq('POST', { role: 'maintainer' });
      const res = makeRes();
      await handler(req as NextApiRequest, res as unknown as NextApiResponse);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when role is missing', async () => {
      mockGetSession.mockResolvedValue(ownerSession);
      const req = makeReq('POST', { userId: '550e8400-e29b-41d4-a716-446655440001' });
      const res = makeRes();
      await handler(req as NextApiRequest, res as unknown as NextApiResponse);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for invalid role', async () => {
      mockGetSession.mockResolvedValue(ownerSession);
      const req = makeReq('POST', {
        userId: '550e8400-e29b-41d4-a716-446655440000',
        role: 'superadmin',
      });
      const res = makeRes();
      await handler(req as NextApiRequest, res as unknown as NextApiResponse);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for non-UUID userId', async () => {
      mockGetSession.mockResolvedValue(ownerSession);
      const req = makeReq('POST', { userId: 'not-a-uuid', role: 'maintainer' });
      const res = makeRes();
      await handler(req as NextApiRequest, res as unknown as NextApiResponse);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('UUID') })
      );
    });

    it('calls auth.api.setRole and returns 200 on success', async () => {
      mockGetSession.mockResolvedValue(ownerSession);
      mockSetRole.mockResolvedValue({
        user: { id: '550e8400-e29b-41d4-a716-446655440001', role: 'maintainer' },
      });

      const req = makeReq('POST', {
        userId: '550e8400-e29b-41d4-a716-446655440001',
        role: 'maintainer',
      });
      const res = makeRes();
      await handler(req as NextApiRequest, res as unknown as NextApiResponse);

      expect(mockSetRole).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { userId: '550e8400-e29b-41d4-a716-446655440001', role: 'maintainer' },
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          userId: '550e8400-e29b-41d4-a716-446655440001',
          role: 'maintainer',
        })
      );
    });

    it('calls auth.api.setRole with readonly role', async () => {
      mockGetSession.mockResolvedValue(ownerSession);
      mockSetRole.mockResolvedValue({
        user: { id: '550e8400-e29b-41d4-a716-446655440002', role: 'readonly' },
      });

      const req = makeReq('POST', {
        userId: '550e8400-e29b-41d4-a716-446655440002',
        role: 'readonly',
      });
      const res = makeRes();
      await handler(req as NextApiRequest, res as unknown as NextApiResponse);

      expect(mockSetRole).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { userId: '550e8400-e29b-41d4-a716-446655440002', role: 'readonly' },
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('calls auth.api.setRole with owner role', async () => {
      mockGetSession.mockResolvedValue(ownerSession);
      mockSetRole.mockResolvedValue({
        user: { id: '550e8400-e29b-41d4-a716-446655440003', role: 'owner' },
      });

      const req = makeReq('POST', {
        userId: '550e8400-e29b-41d4-a716-446655440003',
        role: 'owner',
      });
      const res = makeRes();
      await handler(req as NextApiRequest, res as unknown as NextApiResponse);

      expect(mockSetRole).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { userId: '550e8400-e29b-41d4-a716-446655440003', role: 'owner' },
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 500 when setRole throws', async () => {
      mockGetSession.mockResolvedValue(ownerSession);
      mockSetRole.mockRejectedValue(new Error('DB error'));

      const req = makeReq('POST', {
        userId: '550e8400-e29b-41d4-a716-446655440001',
        role: 'maintainer',
      });
      const res = makeRes();
      await handler(req as NextApiRequest, res as unknown as NextApiResponse);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('does NOT return 501 (stub response) — setRole is always called', async () => {
      mockGetSession.mockResolvedValue(ownerSession);
      mockSetRole.mockResolvedValue({
        user: { id: '550e8400-e29b-41d4-a716-446655440001', role: 'maintainer' },
      });

      const req = makeReq('POST', {
        userId: '550e8400-e29b-41d4-a716-446655440001',
        role: 'maintainer',
      });
      const res = makeRes();
      await handler(req as NextApiRequest, res as unknown as NextApiResponse);

      // Must NOT be 501
      expect(res.status).not.toHaveBeenCalledWith(501);
      expect(res.status).not.toHaveBeenCalledWith(502);
    });
  });

  describe('GET - get user role', () => {
    it('returns 400 when userId is missing', async () => {
      mockGetSession.mockResolvedValue(ownerSession);
      const req = makeReq('GET', {}, {});
      const res = makeRes();
      await handler(req as NextApiRequest, res as unknown as NextApiResponse);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for non-UUID userId', async () => {
      mockGetSession.mockResolvedValue(ownerSession);
      const req = makeReq('GET', {}, { userId: 'not-a-uuid' });
      const res = makeRes();
      await handler(req as NextApiRequest, res as unknown as NextApiResponse);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('UUID') })
      );
    });

    it('calls auth.api.listUsers and returns 200 with role when user found', async () => {
      mockGetSession.mockResolvedValue(ownerSession);
      mockListUsers.mockResolvedValue({
        users: [
          {
            id: '550e8400-e29b-41d4-a716-446655440001',
            email: 'user@example.com',
            name: 'Test User',
            role: 'maintainer',
          },
        ],
        total: 1,
      });

      const req = makeReq('GET', {}, { userId: '550e8400-e29b-41d4-a716-446655440001' });
      const res = makeRes();
      await handler(req as NextApiRequest, res as unknown as NextApiResponse);

      expect(mockListUsers).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          userId: '550e8400-e29b-41d4-a716-446655440001',
          role: 'maintainer',
          email: 'user@example.com',
        })
      );
    });

    it('returns 404 when user not found in listUsers results', async () => {
      mockGetSession.mockResolvedValue(ownerSession);
      mockListUsers.mockResolvedValue({
        users: [
          {
            id: 'cccccccc-dddd-eeee-ffff-000000000001',
            email: 'other@example.com',
            name: 'Other',
            role: 'readonly',
          },
        ],
        total: 1,
      });

      const req = makeReq('GET', {}, { userId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' });
      const res = makeRes();
      await handler(req as NextApiRequest, res as unknown as NextApiResponse);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns readonly as default role when role is not set', async () => {
      mockGetSession.mockResolvedValue(ownerSession);
      mockListUsers.mockResolvedValue({
        users: [
          {
            id: '550e8400-e29b-41d4-a716-446655440001',
            email: 'user@example.com',
            name: 'No Role User',
          },
        ],
        total: 1,
      });

      const req = makeReq('GET', {}, { userId: '550e8400-e29b-41d4-a716-446655440001' });
      const res = makeRes();
      await handler(req as NextApiRequest, res as unknown as NextApiResponse);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ role: 'readonly' }));
    });

    it('returns 500 when listUsers throws', async () => {
      mockGetSession.mockResolvedValue(ownerSession);
      mockListUsers.mockRejectedValue(new Error('DB error'));

      const req = makeReq('GET', {}, { userId: '550e8400-e29b-41d4-a716-446655440001' });
      const res = makeRes();
      await handler(req as NextApiRequest, res as unknown as NextApiResponse);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('does NOT return 501 (stub response) — listUsers is always called', async () => {
      mockGetSession.mockResolvedValue(ownerSession);
      mockListUsers.mockResolvedValue({
        users: [
          {
            id: '550e8400-e29b-41d4-a716-446655440001',
            email: 'user@example.com',
            name: 'User',
            role: 'readonly',
          },
        ],
        total: 1,
      });

      const req = makeReq('GET', {}, { userId: '550e8400-e29b-41d4-a716-446655440001' });
      const res = makeRes();
      await handler(req as NextApiRequest, res as unknown as NextApiResponse);

      expect(res.status).not.toHaveBeenCalledWith(501);
      expect(res.status).not.toHaveBeenCalledWith(502);
    });
  });
});
