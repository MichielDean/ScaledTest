// Admin API for user management
import { BetterAuthMethodHandler, createBetterAuthApi } from '../../../auth/betterAuthApi';
import { apiLogger } from '../../../logging/logger';
import { verifyUserExists } from '../../../lib/teamManagement';
import { AuthAdminApi, authAdminApi } from '../../../lib/auth';

interface ListUser {
  id: string;
  email: string;
  name?: string;
  role?: string;
  emailVerified?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface ListUsersResponse {
  users: ListUser[];
  total: number;
}

/**
 * Handle GET requests - retrieve all users with their roles
 */
const handleGet: BetterAuthMethodHandler = async (req, res, reqLogger) => {
  try {
    // Parse pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(parseInt(req.query.size as string) || 100, 1000); // Max 1000 users per page
    const offset = (page - 1) * pageSize;

    // Prefer using Better Auth admin API for listing users. Support both
    // shapes: `api.listUsers` and `api.admin.listUsers` depending on
    // Better Auth client versions.
    type ListUsersFn = (opts?: {
      query?: { limit?: number; offset?: number };
    }) => Promise<ListUsersResponse>;

    const maybeAdmin = authAdminApi as unknown as {
      listUsers?: ListUsersFn;
      admin?: { listUsers?: ListUsersFn };
    } | null;

    const listFn: ListUsersFn | undefined =
      typeof maybeAdmin?.listUsers === 'function'
        ? maybeAdmin.listUsers.bind(maybeAdmin)
        : typeof maybeAdmin?.admin?.listUsers === 'function'
          ? maybeAdmin.admin.listUsers.bind(maybeAdmin.admin)
          : undefined;

    if (!listFn) {
      apiLogger.warn('Auth admin API listUsers not available');
      return res.status(501).json({ error: 'User listing not supported by current auth provider' });
    }

    const listResp = await listFn({ query: { limit: pageSize, offset } });
    const paginatedUsers = listResp?.users ?? [];
    const total = listResp?.total ?? 0;

    reqLogger.info(
      {
        page,
        pageSize,
        offset,
        totalUsers: total,
        returnedUsers: paginatedUsers.length,
      },
      'User list retrieved with server-side pagination'
    );

    // Transform Better Auth users to include role information
    const usersWithRoles = paginatedUsers.map((user: ListUser) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      role: user.role || 'readonly', // Default to readonly if no role specified
    }));

    // Add pagination metadata to response
    const response = {
      users: usersWithRoles,
      pagination: {
        page,
        pageSize,
        total: total,
        totalPages: Math.ceil(total / pageSize),
        hasNext: offset + pageSize < total,
        hasPrev: page > 1,
      },
    };

    return res.status(200).json(response);
  } catch (error) {
    apiLogger.error({ error }, 'Error fetching users');
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
};

/**
 * Handle DELETE requests - delete user from Better Auth
 */
const handleDelete: BetterAuthMethodHandler = async (req, res, reqLogger) => {
  try {
    const { userId } = req.query;

    // Validate userId
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'Invalid or missing User ID' });
    }

    // Centralized verification helper will use auth admin API only

    // Prefer using Better Auth admin API for deletion
    const adminApiDel: AuthAdminApi | null = authAdminApi;
    if (!adminApiDel || typeof adminApiDel.deleteUser !== 'function') {
      apiLogger.warn('Auth admin API deleteUser not available');
      return res
        .status(501)
        .json({ error: 'User deletion not supported by current auth provider' });
    }

    // Verify user exists via admin API
    const exists = await verifyUserExists(userId);
    if (!exists) return res.status(404).json({ error: 'User not found' });

    await adminApiDel.deleteUser({ userId });
    reqLogger.info({ userId }, 'User deleted successfully via auth API');

    return res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    apiLogger.error({ error }, 'Error deleting user');

    // Handle specific Better Auth errors
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({ error: 'User not found' });
      }
      if (error.message.includes('permission')) {
        return res.status(403).json({ error: 'Insufficient permissions to delete user' });
      }
    }

    return res.status(500).json({ error: 'Failed to delete user' });
  }
};

/**
 * Handle POST requests - update user roles (grant/revoke maintainer)
 */
const handlePost: BetterAuthMethodHandler = async (req, res, reqLogger) => {
  try {
    const { userId, grantMaintainer } = req.body;

    // Validate userId
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'Invalid or missing User ID' });
    }

    // Determine desired role
    const newRole = grantMaintainer ? 'maintainer' : 'readonly';

    try {
      // Use Better Auth admin API for role updates
      const adminApi: AuthAdminApi | null = authAdminApi;
      if (!adminApi || typeof adminApi.updateUser !== 'function') {
        apiLogger.warn('Auth admin API updateUser not available');
        return res
          .status(501)
          .json({ error: 'Role updates not supported by current auth provider' });
      }

      await adminApi.updateUser({ userId, role: newRole });

      const message = grantMaintainer
        ? 'Successfully granted maintainer role'
        : 'Successfully revoked maintainer role';

      reqLogger.info(
        {
          userIdHash: userId.slice(0, 8) + '...',
          grantMaintainer,
          requestedRole: newRole,
        },
        'User role update completed'
      );

      return res.status(200).json({ message });
    } catch (err) {
      apiLogger.error({ err, userId, grantMaintainer }, 'Failed to update user role');
      return res.status(500).json({ error: 'Failed to update user role' });
    }
  } catch (error) {
    apiLogger.error(
      {
        error,
        userId: req.body?.userId,
        grantMaintainer: req.body?.grantMaintainer,
      },
      'Error updating user role'
    );
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(500).json({ error: 'Failed to update user role' });
  }
};

/**
 * Admin API for user management
 * GET    /api/admin/users - Get all users with their roles
 * POST   /api/admin/users - Update user roles (grant/revoke maintainer)
 * DELETE /api/admin/users?userId=<id> - Delete user from system
 *
 * This endpoint requires OWNER role for all operations
 * Manages user roles through Better Auth API
 */

// Export the API with admin-only access (owner role required)
export default createBetterAuthApi(
  {
    GET: handleGet,
    POST: handlePost,
    DELETE: handleDelete,
  },
  'owner'
);
