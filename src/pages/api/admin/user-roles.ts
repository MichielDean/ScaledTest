import { NextApiRequest, NextApiResponse } from 'next';
import { auth } from '@/lib/auth';
import { authClient } from '@/lib/auth-client';
import { apiLogger } from '@/logging/logger';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Get session from Better Auth
    const session = await auth.api.getSession({
      headers: new Headers(req.headers as Record<string, string>),
    });

    if (!session?.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user has admin role (required for role management)
    const userWithRole = session.user as { role?: string };
    const userRole = userWithRole.role;

    if (userRole !== 'admin') {
      return res.status(403).json({
        error: 'Insufficient permissions - admin role required for role management',
      });
    }

    if (req.method === 'POST') {
      return handleAssignRole(req, res);
    } else if (req.method === 'GET') {
      return handleGetUserRole(req, res);
    } else {
      res.setHeader('Allow', ['POST', 'GET']);
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    apiLogger.error({ error }, 'Error in user roles API authentication');
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleAssignRole(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { userId, role } = req.body;

    if (!userId || !role) {
      return res.status(400).json({
        error: 'Missing required fields: userId and role',
      });
    }

    // Get session for audit logging
    const session = await auth.api.getSession({
      headers: new Headers(req.headers as Record<string, string>),
    });

    // Validate role
    const validRoles = ['admin', 'user'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        error: 'Invalid role. Must be one of: ' + validRoles.join(', '),
      });
    }

    // Use Better Auth admin client to set the role
    const { data, error } = await authClient.admin.setRole({
      userId,
      role,
    });

    if (error) {
      apiLogger.error(
        { error, userId, role },
        'Better Auth admin API error during role assignment'
      );
      return res.status(500).json({ error: 'Failed to assign role via Better Auth' });
    }

    apiLogger.info(
      {
        userId,
        role,
        assignedBy: session?.user?.id || 'unknown',
      },
      'Role assigned successfully via Better Auth admin API'
    );

    return res
      .status(200)
      .json({ success: true, message: 'Role assigned successfully', userId, role, data });
  } catch (error) {
    apiLogger.error(
      {
        error,
        userId: req.body?.userId,
        role: req.body?.role,
      },
      'Error assigning role'
    );

    return res.status(500).json({
      error: 'Failed to assign role',
    });
  }
}

async function handleGetUserRole(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { userId } = req.query;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid userId parameter',
      });
    }

    // Type guard for BetterAuthApi
    interface BetterAuthApi {
      getUser: (params: { body: { userId: string } }) => Promise<unknown>;
    }
    function isBetterAuthApi(obj: unknown): obj is BetterAuthApi {
      return (
        typeof obj === 'object' &&
        obj !== null &&
        typeof (obj as { getUser?: unknown }).getUser === 'function'
      );
    }

    try {
      if (auth?.api && isBetterAuthApi(auth.api)) {
        const user = await auth.api.getUser({
          body: { userId },
        });
        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }
        const userWithRole = user as { role?: string; email?: string; name?: string };
        const userRole = userWithRole.role || 'user';

        apiLogger.info(
          { userId, role: userRole },
          'Role retrieved successfully via Better Auth API'
        );
        return res.status(200).json({
          success: true,
          userId,
          role: userRole,
          email: userWithRole.email || '',
          name: userWithRole.name || '',
        });
      }
    } catch (err) {
      apiLogger.error({ err, userId }, 'Better Auth API getUser failed');
      return res.status(502).json({ error: 'Failed to retrieve user role from auth provider' });
    }

    apiLogger.warn({ userId }, 'Role retrieval not implemented for current auth API');
    return res
      .status(501)
      .json({ error: 'Role retrieval is not implemented for the current auth provider' });
  } catch (error) {
    apiLogger.error(
      {
        error,
        userId: req.query.userId,
      },
      'Error retrieving user role'
    );

    // Check if this is a Better Auth error
    if (error instanceof Error && error.message.includes('User not found')) {
      return res.status(404).json({
        error: 'User not found',
      });
    }

    return res.status(500).json({
      error: 'Failed to get user role',
    });
  }
}

export default handler;
