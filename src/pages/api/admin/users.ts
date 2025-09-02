// Admin API for user management
import { BetterAuthMethodHandler, createBetterAuthApi } from '../../../auth/betterAuthApi';
import { logError } from '../../../logging/logger';
import { auth } from '../../../lib/auth';

/**
 * Handle GET requests - retrieve all users with their roles
 */
const handleGet: BetterAuthMethodHandler = async (req, res, reqLogger) => {
  try {
    const users = await auth.api.listUsers();

    // Transform Better Auth users to include role information
    const usersWithRoles = users.map(
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

    return res.status(200).json(usersWithRoles);
  } catch (error) {
    logError(reqLogger, 'Error fetching users', error);
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

    // Delete user from Better Auth
    await auth.api.deleteUser({ userId });

    reqLogger.info('User deleted successfully', { userId });

    return res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    logError(reqLogger, 'Error deleting user', error, {
      userId: req.query?.userId,
    });

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

    // Update user role in Better Auth
    const newRole = grantMaintainer ? 'maintainer' : 'readonly';

    await auth.api.updateUser({
      userId,
      role: newRole,
    });

    const message = grantMaintainer
      ? 'Successfully granted maintainer role'
      : 'Successfully revoked maintainer role';

    reqLogger.info('User role updated successfully', {
      userId,
      grantMaintainer,
      newRole,
    });

    return res.status(200).json({ message });
  } catch (error) {
    logError(reqLogger, 'Error updating user role', error, {
      userId: req.body?.userId,
      grantMaintainer: req.body?.grantMaintainer,
    });

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
