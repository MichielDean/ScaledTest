/**
 * Admin endpoint for managing individual user roles.
 *
 * Uses the Better Auth admin plugin's `setRole` and `listUsers` endpoints
 * (registered under `auth.api` when the admin plugin is active).
 *
 * GET  /api/admin/user-roles?userId=<id>  — retrieve a user's current role
 * POST /api/admin/user-roles              — assign a role to a user
 *   body: { userId: string, role: 'readonly' | 'maintainer' | 'owner' }
 *
 * Requires owner role.
 */
import { NextApiRequest, NextApiResponse } from 'next';
import { auth } from '@/lib/auth';
import { apiLogger } from '@/logging/logger';
import { validateUuid } from '@/lib/validation';

// The Better Auth admin plugin mounts setRole and listUsers on auth.api.
// TypeScript's generated InferAPI type doesn't include admin plugin methods,
// so we cast auth.api to an extended type for the calls we know are there.
export interface BetterAuthAdminApi {
  getSession: (opts: {
    headers: Headers;
  }) => Promise<{ user?: { id?: string; role?: string } } | null>;
  setRole: (opts: { body: { userId: string; role: string }; headers: Headers }) => Promise<{
    user: { id: string; role: string };
  }>;
  listUsers: (opts: {
    query: {
      limit?: string | number;
      offset?: string | number;
      sortBy?: string;
      filterField?: string;
      filterValue?: string;
      filterOperator?: string;
    };
    headers: Record<string, string> | Headers;
  }) => Promise<{
    users: Array<{ id: string; email: string; name?: string; role?: string }>;
    total: number;
  }>;
}

const VALID_ROLES = ['readonly', 'maintainer', 'owner'] as const;
type ValidRole = (typeof VALID_ROLES)[number];

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const requestHeaders = new Headers(req.headers as Record<string, string>);

    // Authenticate via session
    const session = await auth.api.getSession({ headers: requestHeaders });

    if (!session?.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userWithRole = session.user as { role?: string; id?: string };
    if (userWithRole.role !== 'owner') {
      return res.status(403).json({
        error: 'Insufficient permissions - owner role required for role management',
      });
    }

    // Pass requesterId down so sub-handlers don't need to re-fetch the session.
    const requesterId = userWithRole.id || 'unknown';

    if (req.method === 'POST') {
      return handleAssignRole(req, res, requestHeaders, requesterId);
    } else if (req.method === 'GET') {
      return handleGetUserRole(req, res, requestHeaders);
    } else {
      res.setHeader('Allow', ['POST', 'GET']);
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    apiLogger.error({ error }, 'Error in user roles API authentication');
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /api/admin/user-roles
 * body: { userId: string, role: ValidRole }
 *
 * Assigns a role to the specified user via auth.api.setRole (Better Auth admin plugin).
 */
async function handleAssignRole(
  req: NextApiRequest,
  res: NextApiResponse,
  requestHeaders: Headers,
  requesterId: string
) {
  try {
    const { userId, role } = req.body as { userId?: string; role?: string };

    if (!userId || !role) {
      return res.status(400).json({ error: 'Missing required fields: userId and role' });
    }

    // Validate userId is a well-formed UUID before passing it to the auth provider.
    try {
      validateUuid(userId, 'User ID');
    } catch (validationError) {
      return res.status(400).json({
        error:
          validationError instanceof Error ? validationError.message : 'Invalid User ID format',
      });
    }

    if (!VALID_ROLES.includes(role as ValidRole)) {
      return res.status(400).json({
        error: 'Invalid role. Must be one of: ' + VALID_ROLES.join(', '),
      });
    }

    const adminApi = auth.api as unknown as BetterAuthAdminApi;
    await adminApi.setRole({
      body: { userId, role },
      headers: requestHeaders,
    });

    apiLogger.info(
      { userId, role, assignedBy: requesterId },
      'Role assigned successfully via Better Auth admin API'
    );

    return res
      .status(200)
      .json({ success: true, message: 'Role assigned successfully', userId, role });
  } catch (error) {
    apiLogger.error(
      {
        error,
        userId: (req.body as { userId?: string })?.userId,
        role: (req.body as { role?: string })?.role,
      },
      'Error assigning role'
    );

    if (error instanceof Error && error.message.toLowerCase().includes('user not found')) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(500).json({ error: 'Failed to assign role' });
  }
}

/**
 * GET /api/admin/user-roles?userId=<id>
 *
 * Retrieves the role of the specified user via auth.api.listUsers (Better Auth admin plugin).
 * listUsers is used because Better Auth admin plugin does not expose a getUser endpoint.
 *
 * Lookup strategy:
 *   1. Try a filtered query (filterField=id) — O(1) if Better Auth supports it.
 *   2. Fall back to paginated full scan — O(n) but correct for all BA versions.
 */
async function handleGetUserRole(
  req: NextApiRequest,
  res: NextApiResponse,
  requestHeaders: Headers
) {
  try {
    const { userId } = req.query;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid userId parameter' });
    }

    // Validate userId is a well-formed UUID before passing it to the auth provider.
    try {
      validateUuid(userId, 'User ID');
    } catch (validationError) {
      return res.status(400).json({
        error:
          validationError instanceof Error ? validationError.message : 'Invalid User ID format',
      });
    }

    const adminApi = auth.api as unknown as BetterAuthAdminApi;
    let found: { id: string; email: string; name?: string; role?: string } | undefined;

    // Attempt a direct id-filtered lookup first.
    // Better Auth admin plugin supports filterField/filterValue on some versions.
    // We validate the result: if the returned user's id doesn't match, fall through
    // to the paginated scan (the filter may have been applied on a different field).
    try {
      const filtered = await adminApi.listUsers({
        query: { limit: 1, filterField: 'id', filterValue: userId, filterOperator: 'eq' },
        headers: requestHeaders,
      });
      const candidate = filtered?.users?.[0];
      if (candidate?.id === userId) {
        found = candidate;
      }
    } catch {
      // Filter not supported by this Better Auth version — fall through to scan.
    }

    // Paginated fallback scan.
    if (!found) {
      const PAGE_SIZE = 100;
      let offset = 0;

      outerLoop: while (true) {
        const result = await adminApi.listUsers({
          query: { limit: PAGE_SIZE, offset, sortBy: 'createdAt' },
          headers: requestHeaders,
        });

        const users = result?.users ?? [];
        for (const u of users) {
          if (u.id === userId) {
            found = u;
            break outerLoop;
          }
        }

        if (users.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
    }

    if (!found) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userRole = found.role || 'readonly';

    apiLogger.info(
      { userId, role: userRole },
      'Role retrieved successfully via Better Auth admin API'
    );

    return res.status(200).json({
      success: true,
      userId,
      role: userRole,
      email: found.email || '',
      name: found.name || '',
    });
  } catch (error) {
    apiLogger.error({ error, userId: req.query.userId }, 'Error retrieving user role');

    if (error instanceof Error && error.message.toLowerCase().includes('user not found')) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(500).json({ error: 'Failed to get user role' });
  }
}

export default handler;
