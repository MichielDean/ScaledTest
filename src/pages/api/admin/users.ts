// Admin API for user management - ONLY uses Better Auth admin API (never direct database queries)
import { BetterAuthMethodHandler, createBetterAuthApi } from '../../../auth/betterAuthApi';
import { auth } from '../../../lib/auth';

/**
 * Handle GET requests - retrieve all users with their roles using Better Auth admin API
 */
const handleGet: BetterAuthMethodHandler = async (req, res, reqLogger) => {
  try {
    // Parse pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(parseInt(req.query.size as string) || 100, 100); // Max 100 users per page
    const offset = (page - 1) * pageSize;
    const search = req.query.search as string;

    reqLogger.info({ page, pageSize, offset, search }, 'Fetching users via Better Auth admin API');

    // Verify the current user has admin permissions
    const session = await auth.api.getSession({
      headers: new Headers(req.headers as Record<string, string>),
    });

    if (!session?.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const currentUserRole = (session.user as { role?: string }).role;
    if (!currentUserRole || currentUserRole !== 'admin') {
      return res.status(403).json({
        error: 'Insufficient permissions - admin role required',
      });
    }

    // Use Better Auth server-side admin API to list users
    const adminApi = auth.api as unknown as {
      listUsers: (args: {
        headers: Headers;
        query: Record<string, unknown>;
      }) => Promise<{ users: unknown[]; total: number; limit?: number; offset?: number }>;
    };
    const usersResponse = await adminApi.listUsers({
      headers: new Headers(req.headers as Record<string, string>),
      query: {
        limit: pageSize,
        offset: offset,
        ...(search && { searchValue: search, searchField: 'email' }),
      },
    });

    if (!usersResponse) {
      reqLogger.error('No response from Better Auth admin API');
      return res.status(500).json({ error: 'Failed to fetch users from Better Auth' });
    }

    reqLogger.info(
      { userCount: usersResponse.users.length, total: usersResponse.total },
      'Successfully fetched users via Better Auth admin API'
    );

    return res.status(200).json({
      users: usersResponse.users,
      total: usersResponse.total,
      page,
      pageSize,
    });
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

    // Verify the current user has admin permissions
    const session = await auth.api.getSession({
      headers: new Headers(req.headers as Record<string, string>),
    });

    if (!session?.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const currentUserRole = (session.user as { role?: string }).role;
    if (!currentUserRole || currentUserRole !== 'admin') {
      return res.status(403).json({
        error: 'Insufficient permissions - admin role required',
      });
    }

    // Use Better Auth server-side admin API to remove user
    const adminApi = auth.api as unknown as {
      removeUser: (args: { body: { userId: string } }) => Promise<unknown>;
    };
    const deletedUser = await adminApi.removeUser({
      body: { userId },
    });

    if (!deletedUser) {
      reqLogger.error({ userId }, 'Failed to delete user via Better Auth admin API');
      return res.status(500).json({ error: 'Failed to delete user' });
    }

    reqLogger.info({ userId }, 'User deleted successfully via Better Auth admin API');
    return res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    reqLogger.error({ error }, 'Error deleting user');
    return res.status(500).json({ error: 'Failed to delete user' });
  }
};

/**
 * Handle PUT requests - update user roles using Better Auth admin API
 */
const handlePut: BetterAuthMethodHandler = async (req, res, reqLogger) => {
  try {
    const { userId, role } = req.body;

    // Validate inputs
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'Invalid or missing User ID' });
    }

    if (!role || typeof role !== 'string') {
      return res.status(400).json({ error: 'Invalid or missing role' });
    }

    // Verify the current user has admin permissions
    const session = await auth.api.getSession({
      headers: new Headers(req.headers as Record<string, string>),
    });

    if (!session?.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const currentUserRole = (session.user as { role?: string }).role;
    if (!currentUserRole || currentUserRole !== 'admin') {
      return res.status(403).json({
        error: 'Insufficient permissions - admin role required',
      });
    }

    // Use Better Auth server-side admin API to set role
    const adminApi = auth.api as unknown as {
      setRole: (args: { body: { userId: string; role: string } }) => Promise<void>;
    };
    await adminApi.setRole({
      body: { userId, role },
    });

    reqLogger.info(
      { userId: userId.slice(0, 8) + '...', role },
      'User role updated successfully via Better Auth admin API'
    );

    return res.status(200).json({ message: 'User role updated successfully' });
  } catch (error) {
    reqLogger.error({ error }, 'Error updating user role');
    return res.status(500).json({ error: 'Failed to update user role' });
  }
};

export default createBetterAuthApi({
  GET: handleGet,
  DELETE: handleDelete,
  PUT: handlePut,
});
