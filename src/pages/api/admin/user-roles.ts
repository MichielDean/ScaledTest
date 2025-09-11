import { NextApiRequest, NextApiResponse } from 'next';
import { auth } from '@/lib/auth';
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

/**
 * Typed interface for the subset of Better Auth admin API used here.
 * Keeping this narrow avoids pervasive `as unknown as` assertions.
 */
interface BetterAuthAdminApi {
  getUser: (opts: {
    body: { userId: string };
  }) => Promise<{ id: string; role?: string; email?: string; name?: string } | null>;
  setRole: (opts: { body: { userId: string; role: string } }) => Promise<void>;
}

function isBetterAuthAdminApi(candidate: unknown): candidate is BetterAuthAdminApi {
  const obj = candidate as Record<string, unknown> | undefined;
  return !!obj && typeof obj.getUser === 'function' && typeof obj.setRole === 'function';
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
    const validRoles = ['readonly', 'maintainer', 'owner'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        error: 'Invalid role. Must be one of: ' + validRoles.join(', '),
      });
    }

    // Prefer to use the Better Auth admin API if available
    try {
      const maybeAdmin = (auth as unknown as { api?: unknown }).api;
      if (maybeAdmin && isBetterAuthAdminApi(maybeAdmin)) {
        // Validate user exists
        const targetUser = await maybeAdmin.getUser({ body: { userId } });
        if (!targetUser) {
          return res.status(404).json({ error: 'User not found' });
        }

        await maybeAdmin.setRole({ body: { userId, role } });
        apiLogger.info(
          {
            userId,
            role,
            assignedBy: session?.user?.id || 'unknown',
          },
          'Role assigned successfully via Better Auth API'
        );

        return res
          .status(200)
          .json({ success: true, message: 'Role assigned successfully', userId, role });
      }
    } catch (err) {
      apiLogger.error({ err, userId, role }, 'Better Auth API role assignment failed');
      // Fallthrough to fallback behavior with explanatory response
      return res.status(502).json({ error: 'Failed to assign role via auth provider' });
    }

    // If Better Auth API not available, return informative 501 response
    apiLogger.warn(
      { userId, role },
      'Role assignment endpoint not implemented for current auth API'
    );
    return res
      .status(501)
      .json({ error: 'Role assignment is not implemented for the current auth provider' });
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

    try {
      if (
        auth?.api &&
        typeof (auth.api as unknown as Record<string, unknown>).getUser === 'function'
      ) {
        // @ts-expect-error - runtime check above ensures method presence
        const user = await (auth.api as unknown as Record<string, unknown>).getUser({
          body: { userId },
        });
        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }
        const userWithRole = user as { role?: string; email?: string; name?: string };
        const userRole = userWithRole.role || 'readonly';

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
