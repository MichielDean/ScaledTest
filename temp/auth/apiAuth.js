'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.createRoleConfig = void 0;
exports.verifyToken = verifyToken;
exports.hasRequiredRole = hasRequiredRole;
exports.withApiAuth = withApiAuth;
exports.withMethodAuth = withMethodAuth;
exports.createApiHandler = createApiHandler;
const keycloak_1 = require('./keycloak');
const jose_1 = require('jose');
const logger_1 = require('../utils/logger');
const keycloak_2 = require('../config/keycloak');
// Create a remote JWKS fetcher that automatically handles caching and certificate parsing
const JWKS = (0, jose_1.createRemoteJWKSet)(new URL(keycloak_2.keycloakEndpoints.jwks));
// Function to verify JWT token using the jose library
async function verifyToken(token) {
  const issuer = `${keycloak_2.keycloakConfig.url}/realms/${keycloak_2.keycloakConfig.realm}`;
  try {
    // Verify with strict audience validation
    const { payload } = await (0, jose_1.jwtVerify)(token, JWKS, {
      issuer,
      audience: keycloak_2.keycloakConfig.clientId,
    });
    return payload;
  } catch (error) {
    // Log and throw any verification errors
    (0, logger_1.logError)(logger_1.authLogger, 'Token verification failed', error, {
      realm: keycloak_2.keycloakConfig.realm,
      isTokenProvided: !!token,
      tokenType: token?.startsWith('Bearer ') ? 'Bearer' : 'Unknown',
    });
    throw new Error(
      `Token verification failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
// Function to check if the user has the required role
function hasRequiredRole(payload, requiredRoles) {
  // Check realm roles
  const realmRoles = payload.realm_access?.roles || [];
  // Check client specific roles
  const clientRoles = payload.resource_access?.[keycloak_2.keycloakConfig.clientId]?.roles || [];
  // Combine all roles
  const userRoles = [...realmRoles, ...clientRoles];
  // Check if the user has any of the required roles
  return requiredRoles.some(role => userRoles.includes(role));
}
// Middleware to protect API routes
function withApiAuth(handler, requiredRoles = []) {
  return async (req, res) => {
    try {
      // Debug logging
      logger_1.authLogger.info('Middleware called for:', req.url);
      logger_1.authLogger.info('Method:', req.method);
      logger_1.authLogger.info('Required roles:', requiredRoles);
      // Extract the bearer token from the Authorization header
      const authHeader = req.headers.authorization;
      logger_1.authLogger.info('Auth header present:', !!authHeader);
      logger_1.authLogger.info(
        'Auth header value:',
        authHeader ? authHeader.substring(0, 20) + '...' : 'NONE'
      );
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger_1.authLogger.warn('No valid bearer token found');
        return res.status(401).json({
          success: false,
          error: 'Unauthorized - No valid token provided',
        });
      }
      const token = authHeader.split(' ')[1];
      logger_1.authLogger.info('Token extracted, length:', token ? token.length : 0);
      try {
        // Verify the token
        logger_1.authLogger.info('Verifying token...');
        const payload = await verifyToken(token);
        logger_1.authLogger.info('Token verified successfully');
        logger_1.authLogger.info('User payload:', {
          sub: payload.sub,
          preferred_username: payload.preferred_username,
          realm_access: payload.realm_access,
          resource_access: payload.resource_access,
        });
        // Check if the user has the required role
        if (requiredRoles.length > 0 && !hasRequiredRole(payload, requiredRoles)) {
          logger_1.authLogger.warn('User does not have required roles');
          return res.status(403).json({
            success: false,
            error: 'Forbidden - Insufficient permissions',
          });
        }
        logger_1.authLogger.info('Role check passed, proceeding to handler');
        req.user = payload;
        // Call the original handler
        return handler(req, res);
      } catch (error) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized - Invalid token',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    } catch (error) {
      // Get request-specific logger
      const reqLogger = (0, logger_1.getRequestLogger)(req);
      (0, logger_1.logError)(reqLogger, 'API authentication error', error, {
        path: req.url,
        method: req.method,
        requiredRoles,
      });
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  };
}
// Enhanced middleware with method-specific role requirements
function withMethodAuth(handler, roleConfig) {
  return async (req, res) => {
    try {
      // First, authenticate the user
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized - No valid token provided',
        });
      }
      const token = authHeader.split(' ')[1];
      try {
        // Verify the token
        const payload = await verifyToken(token);
        // Add the decoded token to the request object
        const authReq = req;
        authReq.user = payload;
        // Check method-specific role requirements
        const method = req.method;
        const requiredRoles = roleConfig[method];
        if (requiredRoles && !hasRequiredRole(payload, requiredRoles)) {
          return res.status(403).json({
            success: false,
            error: `Forbidden - ${method} operations require ${requiredRoles.join(' or ')} privileges`,
          });
        }
        // Call the handler with the authenticated request
        return handler(authReq, res);
      } catch (error) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized - Invalid token',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    } catch (error) {
      const reqLogger = (0, logger_1.getRequestLogger)(req);
      (0, logger_1.logError)(reqLogger, 'API authentication error', error, {
        path: req.url,
        method: req.method,
        roleConfig,
      });
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  };
}
// Helper function to create common role configurations
exports.createRoleConfig = {
  readOnly: () => ({
    GET: [keycloak_1.UserRole.READONLY, keycloak_1.UserRole.MAINTAINER, keycloak_1.UserRole.OWNER],
  }),
  readWrite: () => ({
    GET: [keycloak_1.UserRole.READONLY, keycloak_1.UserRole.MAINTAINER, keycloak_1.UserRole.OWNER],
    POST: [keycloak_1.UserRole.MAINTAINER, keycloak_1.UserRole.OWNER],
    PUT: [keycloak_1.UserRole.MAINTAINER, keycloak_1.UserRole.OWNER],
    PATCH: [keycloak_1.UserRole.MAINTAINER, keycloak_1.UserRole.OWNER],
    DELETE: [keycloak_1.UserRole.MAINTAINER, keycloak_1.UserRole.OWNER],
  }),
  adminOnly: () => ({
    GET: [keycloak_1.UserRole.OWNER],
    POST: [keycloak_1.UserRole.OWNER],
    PUT: [keycloak_1.UserRole.OWNER],
    PATCH: [keycloak_1.UserRole.OWNER],
    DELETE: [keycloak_1.UserRole.OWNER],
  }),
  custom: config => config,
};
/**
 * Creates a generic API handler that handles method routing, logging, and error handling
 * This eliminates boilerplate code across API endpoints
 */
function createApiHandler(methods, options = {}) {
  return async (req, res) => {
    const reqLogger = (0, logger_1.getRequestLogger)(req);
    try {
      // Run optional setup (e.g., ensuring database indexes exist)
      if (options.setup) {
        await options.setup();
      }
      // Route to the appropriate method handler
      const methodHandler = methods[req.method];
      if (!methodHandler) {
        const allowedMethods = Object.keys(methods).join(', ');
        return res.status(405).json({
          success: false,
          error: `Method not allowed. Supported methods: ${allowedMethods}`,
        });
      }
      return await methodHandler(req, res, reqLogger);
    } catch (error) {
      // Use custom error handler if provided, otherwise use default
      if (options.errorHandler) {
        return await options.errorHandler(error, req, res, reqLogger);
      }
      // Default error handling
      (0, logger_1.logError)(reqLogger, 'Unexpected error in API handler', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  };
}
