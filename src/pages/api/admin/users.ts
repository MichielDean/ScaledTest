// Admin API for user management
import { BetterAuthMethodHandler, createBetterAuthApi } from '../../../auth/betterAuthApi';
import { apiLogger } from '../../../logging/logger';
import { verifyUserExists } from '../../../lib/teamManagement';
import { AuthAdminApi, authAdminApi } from '../../../lib/auth';

/**
 * Handle GET requests - retrieve all users with their roles
 */
const handleGet: BetterAuthMethodHandler = async (req, res, reqLogger) => {
  try {
    // Parse pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(parseInt(req.query.size as string) || 100, 100); // Max 100 users per page
    const offset = (page - 1) * pageSize;
    const search = req.query.search as string;

    reqLogger.info({ page, pageSize, offset, search }, 'Fetching users with direct database query');

    // Direct database query for user listing
    const { Pool } = await import('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    let query =
      'SELECT id, email, name, role, "emailVerified", "createdAt", "updatedAt" FROM "user"';
    let countQuery = 'SELECT COUNT(*) as total FROM "user"';
    const queryParams: (string | number)[] = [];
    const countParams: string[] = [];

    // Add search filter if provided
    if (search) {
      query += ' WHERE email ILIKE $1 OR name ILIKE $1';
      countQuery += ' WHERE email ILIKE $1 OR name ILIKE $1';
      queryParams.push(`%${search}%`);
      countParams.push(`%${search}%`);
    }

    // Add ordering and pagination
    query += ' ORDER BY "createdAt" DESC';
    if (search) {
      query += ' LIMIT $2 OFFSET $3';
      queryParams.push(pageSize, offset);
    } else {
      query += ' LIMIT $1 OFFSET $2';
      queryParams.push(pageSize, offset);
    }

    const [result, countResult] = await Promise.all([
      pool.query(query, queryParams),
      pool.query(countQuery, countParams),
    ]);

    const total = parseInt(countResult.rows[0]?.total || '0');
    await pool.end();

    const users = result.rows.map(row => ({
      id: row.id,
      email: row.email,
      name: row.name,
      emailVerified: row.emailVerified,
      createdAt: row.createdAt?.toISOString(),
      updatedAt: row.updatedAt?.toISOString(),
      role: row.role || 'readonly',
    }));

    reqLogger.info(
      {
        page,
        pageSize,
        offset,
        search,
        totalUsers: total,
        returnedUsers: users.length,
      },
      'User list retrieved via direct database query'
    );

    const response = {
      users,
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
    reqLogger.error({ error }, 'Error fetching users');
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
