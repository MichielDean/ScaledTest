// Admin API for user management
import { BetterAuthMethodHandler, createBetterAuthApi } from '../../../auth/betterAuthApi';
import { apiLogger } from '../../../logging/logger';
import { getAuthDbPool, verifyUserExists } from '../../../lib/teamManagement';
import { AuthAdminApi, authAdminApi } from '../../../lib/auth';

/**
 * Handle GET requests - retrieve all users with their roles
 */
const handleGet: BetterAuthMethodHandler = async (req, res, reqLogger) => {
  try {
    // Parse pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(parseInt(req.query.size as string) || 100, 1000); // Max 1000 users per page
    const offset = (page - 1) * pageSize;

    // Get users from database with server-side pagination using shared pool
    const pool = getAuthDbPool();

    // Get total count
    const countResult = await pool.query('SELECT COUNT(*) FROM "user"');
    const total = parseInt(countResult.rows[0].count, 10);

    // Get paginated users
    const usersResult = await pool.query(
      'SELECT id, email, name, "emailVerified", "createdAt", "updatedAt", role FROM "user" ORDER BY "createdAt" DESC LIMIT $1 OFFSET $2',
      [pageSize, offset]
    );

    const paginatedUsers = usersResult.rows;

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
    const usersWithRoles = paginatedUsers.map(
      (user: {
        id: string;
        email: string;
        name?: string;
        emailVerified?: boolean;
        createdAt?: string;
        updatedAt?: string;
        role?: string;
      }) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        role: user.role || 'readonly', // Default to readonly if no role specified
      })
    );

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

    // Use shared auth DB pool and centralized verification helper
    const pool = getAuthDbPool();

    // Verify user exists via auth API or DB
    const exists = await verifyUserExists(userId);
    if (!exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete user from database
    await pool.query('DELETE FROM "user" WHERE id = $1', [userId]);

    reqLogger.info({ userId }, 'User deleted successfully');

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
      // Prefer using Better Auth admin API when available
      const adminApi: AuthAdminApi | null = authAdminApi;
      if (adminApi && typeof adminApi.updateUser === 'function') {
        // Attempt to use admin API to update role
        await adminApi.updateUser({ userId, role: newRole });
      } else {
        // Fallback: update role column in auth DB directly
        const pool = getAuthDbPool();
        await pool.query('UPDATE "user" SET role = $1, "updatedAt" = now() WHERE id = $2', [
          newRole,
          userId,
        ]);
      }

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
