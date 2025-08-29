import { NextApiRequest, NextApiResponse } from 'next';
import { UserRole } from './keycloak';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { authLogger as logger, logError, getRequestLogger } from '../logging/logger';
import { keycloakConfig, keycloakEndpoints } from '../config/keycloak';
import { KeycloakTokenPayload, AuthenticatedRequest, MethodRoleConfig } from '../types/auth';
import { ErrorResponse } from '../types/api';

// Export types for external use
export type { AuthenticatedRequest } from '../types/auth';

// Generic API handler type
export type ApiHandler<T = unknown> = (
  req: NextApiRequest,
  res: NextApiResponse<T>
) => Promise<void>;

// Authenticated API handler type
export type AuthenticatedApiHandler<T = unknown> = (
  req: AuthenticatedRequest,
  res: NextApiResponse<T>
) => Promise<void>;

// Generic method handler type
export type MethodHandler<T = unknown> = (
  req: AuthenticatedRequest,
  res: NextApiResponse<T>,
  logger: ReturnType<typeof getRequestLogger>
) => Promise<void>;

// Method handlers configuration
export type MethodHandlers = {
  GET?: MethodHandler;
  POST?: MethodHandler;
  PUT?: MethodHandler;
  DELETE?: MethodHandler;
  PATCH?: MethodHandler;
};

// Handler options for customization
export type HandlerOptions = {
  setup?: () => Promise<void>;
  errorHandler?: (
    error: unknown,
    req: AuthenticatedRequest,
    res: NextApiResponse,
    logger: ReturnType<typeof getRequestLogger>
  ) => Promise<void>;
};

// Create a remote JWKS fetcher that automatically handles caching and certificate parsing
const JWKS = createRemoteJWKSet(new URL(keycloakEndpoints.jwks));

// Function to verify JWT token using the jose library
export async function verifyToken(token: string): Promise<KeycloakTokenPayload> {
  const issuer = `${keycloakConfig.url}/realms/${keycloakConfig.realm}`;

  try {
    // Verify with strict audience validation
    const { payload } = await jwtVerify(token, JWKS, {
      issuer,
      audience: keycloakConfig.clientId,
    });

    return payload as KeycloakTokenPayload;
  } catch (error) {
    // Log and throw any verification errors
    logError(logger, 'Token verification failed', error, {
      realm: keycloakConfig.realm,
      isTokenProvided: !!token,
      tokenType: token?.startsWith('Bearer ') ? 'Bearer' : 'Unknown',
    });
    throw new Error(
      `Token verification failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// Function to check if the user has the required role
export function hasRequiredRole(payload: KeycloakTokenPayload, requiredRoles: UserRole[]): boolean {
  // Check realm roles
  const realmRoles = payload.realm_access?.roles || [];

  // Check client specific roles
  const clientRoles = payload.resource_access?.[keycloakConfig.clientId]?.roles || [];

  // Combine all roles
  const userRoles = [...realmRoles, ...clientRoles];

  // Check if the user has any of the required roles
  return requiredRoles.some(role => userRoles.includes(role));
}

// Middleware to protect API routes
export function withApiAuth(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>,
  requiredRoles: UserRole[] = []
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      // Extract the bearer token from the Authorization header
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.warn('No valid bearer token found');
        return res.status(401).json({
          success: false,
          error: 'Unauthorized - No valid token provided',
        } as ErrorResponse);
      }

      const token = authHeader.split(' ')[1];

      try {
        // Verify the token
        const payload = await verifyToken(token);
        logger.info('User payload:', {
          sub: payload.sub,
          preferred_username: payload.preferred_username,
          realm_access: payload.realm_access,
          resource_access: payload.resource_access,
        });

        // Check if the user has the required role
        if (requiredRoles.length > 0 && !hasRequiredRole(payload, requiredRoles)) {
          logger.warn('User does not have required roles');
          return res.status(403).json({
            success: false,
            error: 'Forbidden - Insufficient permissions',
          } as ErrorResponse);
        }

        logger.info('Role check passed, proceeding to handler');

        // Add the decoded token to the request object for future use
        (req as AuthenticatedRequest).user = payload;

        // Call the original handler
        return handler(req, res);
      } catch (error) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized - Invalid token',
          details: error instanceof Error ? error.message : String(error),
        } as ErrorResponse);
      }
    } catch (error) {
      // Get request-specific logger
      const reqLogger = getRequestLogger(req);
      logError(reqLogger, 'API authentication error', error, {
        path: req.url,
        method: req.method,
        requiredRoles,
      });
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      } as ErrorResponse);
    }
  };
}

// Enhanced middleware with method-specific role requirements
export function withMethodAuth(handler: AuthenticatedApiHandler, roleConfig: MethodRoleConfig) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const reqLogger = getRequestLogger(req);

    try {
      // First, authenticate the user
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        reqLogger.error('No valid authorization header found');
        return res.status(401).json({
          success: false,
          error: 'Unauthorized - No valid token provided',
        } as ErrorResponse);
      }

      const token = authHeader.split(' ')[1];

      try {
        // Verify the token
        const payload = await verifyToken(token);
        reqLogger.info('Token verified successfully', { userSub: payload.sub });

        // Add the decoded token to the request object
        const authReq = req as AuthenticatedRequest;
        authReq.user = payload;

        // Check method-specific role requirements
        const method = req.method as keyof MethodRoleConfig;
        const requiredRoles = roleConfig[method];

        reqLogger.info('Role check', {
          method,
          requiredRoles,
          userRoles: payload.realm_access?.roles || [],
          clientRoles: payload.resource_access?.[keycloakConfig.clientId]?.roles || [],
        });

        if (requiredRoles && !hasRequiredRole(payload, requiredRoles)) {
          reqLogger.error('Insufficient privileges', {
            method,
            requiredRoles,
            userRoles: payload.realm_access?.roles || [],
          });
          return res.status(403).json({
            success: false,
            error: `Forbidden - ${method} operations require ${requiredRoles.join(' or ')} privileges`,
          } as ErrorResponse);
        }

        reqLogger.info('Authentication successful, calling handler', { userSub: payload.sub });
        // Call the handler with the authenticated request
        return handler(authReq, res);
      } catch (error) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized - Invalid token',
          details: error instanceof Error ? error.message : String(error),
        } as ErrorResponse);
      }
    } catch (error) {
      const reqLogger = getRequestLogger(req);
      logError(reqLogger, 'API authentication error', error, {
        path: req.url,
        method: req.method,
        roleConfig,
      });
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      } as ErrorResponse);
    }
  };
}

// Helper function to create common role configurations
export const createRoleConfig = {
  readOnly: (): MethodRoleConfig => ({
    GET: [UserRole.READONLY, UserRole.MAINTAINER, UserRole.OWNER],
  }),

  readWrite: (): MethodRoleConfig => ({
    GET: [UserRole.READONLY, UserRole.MAINTAINER, UserRole.OWNER],
    POST: [UserRole.MAINTAINER, UserRole.OWNER],
    PUT: [UserRole.MAINTAINER, UserRole.OWNER],
    PATCH: [UserRole.MAINTAINER, UserRole.OWNER],
    DELETE: [UserRole.MAINTAINER, UserRole.OWNER],
  }),

  adminOnly: (): MethodRoleConfig => ({
    GET: [UserRole.OWNER],
    POST: [UserRole.OWNER],
    PUT: [UserRole.OWNER],
    PATCH: [UserRole.OWNER],
    DELETE: [UserRole.OWNER],
  }),

  custom: (config: MethodRoleConfig): MethodRoleConfig => config,
};

// Generic API handler factory that eliminates boilerplate
export function createApiHandler(
  methods: MethodHandlers,
  options: HandlerOptions = {}
): AuthenticatedApiHandler {
  return async (req: AuthenticatedRequest, res: NextApiResponse) => {
    const reqLogger = getRequestLogger(req);

    try {
      // Run setup function if provided
      if (options.setup) {
        await options.setup();
      }

      // Check if method is supported
      const method = req.method as keyof MethodHandlers;
      const handler = methods[method];

      if (!handler) {
        const supportedMethods = Object.keys(methods).join(', ');
        return res.status(405).json({
          success: false,
          error: `Method not allowed. Supported methods: ${supportedMethods}`,
        });
      }

      // Call the appropriate method handler
      return await handler(req, res, reqLogger);
    } catch (error) {
      // Use custom error handler if provided, otherwise use default
      if (options.errorHandler) {
        return await options.errorHandler(error, req, res, reqLogger);
      }

      // Default error handling
      logError(reqLogger, 'Unexpected error in API handler', error, {
        path: req.url,
        method: req.method,
      });

      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  };
}

// Complete API handler factory with authentication, logging, and error handling
export interface CompleteApiHandlerOptions {
  setup?: () => Promise<void>;
  roleConfig?: MethodRoleConfig;
  errorHandler?: (
    error: unknown,
    req: AuthenticatedRequest,
    res: NextApiResponse,
    logger: ReturnType<typeof getRequestLogger>
  ) => Promise<void>;
}

/**
 * Creates a complete API handler with authentication, method routing, logging, and error handling.
 * This is the most generic version that eliminates all boilerplate code.
 *
 * @param methods - Object mapping HTTP methods to handler functions
 * @param options - Configuration options for roles, setup, and error handling
 * @returns A complete Next.js API handler ready for export
 */
export function createCompleteApiHandler(
  methods: MethodHandlers,
  options: CompleteApiHandlerOptions = {}
): ApiHandler {
  // Create the base handler with method routing and logging
  const baseHandler = createApiHandler(methods, {
    setup: options.setup,
    errorHandler: options.errorHandler,
  });

  // Apply authentication with role configuration
  const roleConfig = options.roleConfig || createRoleConfig.readWrite();

  return withMethodAuth(baseHandler, roleConfig);
}

/**
 * Quick factory functions for common API patterns
 */
export const createApi = {
  /**
   * Read-only API (GET only, all authenticated users)
   */
  readOnly: (
    getHandler: MethodHandler,
    options: Omit<CompleteApiHandlerOptions, 'roleConfig'> = {}
  ) =>
    createCompleteApiHandler(
      { GET: getHandler },
      { ...options, roleConfig: createRoleConfig.readOnly() }
    ),

  /**
   * Read-write API (GET for all, POST/PUT/PATCH/DELETE for maintainers+)
   */
  readWrite: (
    handlers: MethodHandlers,
    options: Omit<CompleteApiHandlerOptions, 'roleConfig'> = {}
  ) => createCompleteApiHandler(handlers, { ...options, roleConfig: createRoleConfig.readWrite() }),

  /**
   * Admin-only API (all methods require owner role)
   */
  adminOnly: (
    handlers: MethodHandlers,
    options: Omit<CompleteApiHandlerOptions, 'roleConfig'> = {}
  ) => createCompleteApiHandler(handlers, { ...options, roleConfig: createRoleConfig.adminOnly() }),

  /**
   * Custom API with specific role configuration
   */
  custom: (
    handlers: MethodHandlers,
    roleConfig: MethodRoleConfig,
    options: Omit<CompleteApiHandlerOptions, 'roleConfig'> = {}
  ) => createCompleteApiHandler(handlers, { ...options, roleConfig }),
};
