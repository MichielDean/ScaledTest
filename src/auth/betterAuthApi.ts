import { NextApiRequest, NextApiResponse } from 'next';
import { auth } from '../lib/auth';
import { apiLogger as logger, logError, getRequestLogger } from '../logging/logger';
import { type RoleName } from '../lib/auth-shared';

type Role = RoleName;

// Authenticated request type for Better Auth
export interface BetterAuthenticatedRequest extends NextApiRequest {
  user: {
    id: string;
    email: string;
    name?: string;
    role?: Role;
  };
}

// Generic method handler type
export type BetterAuthMethodHandler<T = unknown> = (
  req: BetterAuthenticatedRequest,
  res: NextApiResponse<T>,
  logger: ReturnType<typeof getRequestLogger>
) => Promise<void>;

// Method handlers configuration
export type BetterAuthMethodHandlers = {
  GET?: BetterAuthMethodHandler;
  POST?: BetterAuthMethodHandler;
  PUT?: BetterAuthMethodHandler;
  DELETE?: BetterAuthMethodHandler;
  PATCH?: BetterAuthMethodHandler;
};

/**
 * Better Auth API authentication middleware
 * Supports both session-based (cookies) and Bearer token authentication
 */
export async function authenticateRequest(
  req: NextApiRequest
): Promise<BetterAuthenticatedRequest['user'] | null> {
  try {
    // Extract Bearer token from Authorization header
    const authHeader = req.headers.authorization;
    let token: string | undefined;

    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    // Try session-based authentication first (cookies)
    try {
      const session = await auth.api.getSession({
        headers: new Headers(req.headers as Record<string, string>),
      });

      if (session?.user) {
        return {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
          role: (session.user as { role?: Role }).role || 'readonly',
        };
      }
    } catch (sessionError) {
      logger.debug({ error: sessionError }, 'Session authentication failed, trying token auth');
    }

    // If session auth failed and we have a token, try token validation
    if (token) {
      try {
        // Use Better Auth's session validation with bearer token
        const headers = new Headers();
        headers.set('authorization', `Bearer ${token}`);

        const tokenResult = await auth.api.getSession({
          headers,
        });

        if (tokenResult?.user) {
          return {
            id: tokenResult.user.id,
            email: tokenResult.user.email,
            name: tokenResult.user.name,
            role: (tokenResult.user as { role?: Role }).role || 'readonly',
          };
        }
      } catch (tokenError) {
        logger.debug({ error: tokenError }, 'Bearer token authentication failed');
      }
    }

    return null;
  } catch (error) {
    logger.error({ error }, 'Authentication error');
    return null;
  }
}

/**
 * Check if user has required role
 */
function hasRole(user: { role?: Role }, requiredRole: Role): boolean {
  if (!user.role) return false;

  // Role hierarchy: readonly < maintainer < owner
  if (requiredRole === 'readonly') {
    return true; // All authenticated users have at least readonly access
  }
  if (requiredRole === 'maintainer') {
    return user.role === 'maintainer' || user.role === 'owner';
  }
  if (requiredRole === 'owner') {
    return user.role === 'owner';
  }

  return false;
}

/**
 * Create a Better Auth protected API endpoint
 */
export function createBetterAuthApi(handlers: BetterAuthMethodHandlers, requiredRole?: Role) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const reqLogger = getRequestLogger(req);

    try {
      // Authenticate the request
      const user = await authenticateRequest(req);
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

      // Check role authorization if required
      if (requiredRole && !hasRole(user, requiredRole)) {
        return res.status(403).json({
          success: false,
          error: `Access denied. Required role: ${requiredRole}`,
        });
      }

      // Create authenticated request
      const authenticatedReq = req as BetterAuthenticatedRequest;
      authenticatedReq.user = user;

      // Handle the request based on method
      const method = req.method as keyof BetterAuthMethodHandlers;
      const handler = handlers[method];

      if (!handler) {
        return res.status(405).json({
          success: false,
          error: `Method ${req.method} not allowed`,
        });
      }

      await handler(authenticatedReq, res, reqLogger);
    } catch (error) {
      logError(reqLogger, 'API handler error', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  };
}
