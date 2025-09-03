import { NextApiRequest, NextApiResponse } from 'next';
import { auth } from '@/lib/auth';
import { roleNames } from '@/lib/auth-shared';
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

    // Check if user has owner role (required for role management)
    const userWithRole = session.user as { role?: string };
    const userRole = userWithRole.role;

    if (userRole !== 'owner') {
      return res.status(403).json({
        error: 'Insufficient permissions - owner role required for role management',
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
    const validRoles = Object.values(roleNames);
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        error: 'Invalid role. Must be one of: ' + validRoles.join(', '),
      });
    }

    // Validate user exists first
    const targetUser = await auth.api.getUser({
      body: { userId },
    });

    if (!targetUser) {
      return res.status(404).json({
        error: 'User not found',
      });
    }

    // Assign role using Better Auth admin API
    await auth.api.setRole({
      body: {
        userId,
        role,
      },
    });

    apiLogger.info(
      {
        userId,
        role,
        assignedBy: session?.user?.id || 'unknown',
      },
      'Role assigned successfully'
    );

    return res.status(200).json({
      success: true,
      message: 'Role assigned successfully',
      userId,
      role,
    });
  } catch (error) {
    apiLogger.error(
      {
        error,
        userId: req.body?.userId,
        role: req.body?.role,
      },
      'Error assigning role'
    );

    // Check if this is a Better Auth error
    if (error instanceof Error && error.message.includes('User not found')) {
      return res.status(404).json({
        error: 'User not found',
      });
    }

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

    // Get user with role from Better Auth
    const user = await auth.api.getUser({
      body: { userId },
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
      });
    }

    // Extract role from user object
    const userWithRole = user as { role?: string };
    const userRole = userWithRole.role || 'readonly'; // Default to readonly if no role set

    apiLogger.info({ userId, role: userRole }, 'Role retrieved successfully');

    return res.status(200).json({
      success: true,
      userId,
      role: userRole,
      email: user.email,
      name: user.name,
    });
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
