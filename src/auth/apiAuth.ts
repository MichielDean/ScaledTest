import { NextApiRequest, NextApiResponse } from 'next';
import { UserRole } from './keycloak';
import { jwtVerify, createRemoteJWKSet, JWTPayload } from 'jose';
import { authLogger as logger, logError, getRequestLogger } from '../utils/logger';
import { keycloakConfig, keycloakEndpoints } from '../config/keycloak';

// Interface for error responses
interface ErrorResponse {
  success: false;
  error: string;
  details?: unknown;
}

// Interface for JWT token payload with Keycloak-specific claims
// Extends the standard JWTPayload from jose library for better compliance
interface KeycloakTokenPayload extends JWTPayload {
  // Keycloak-specific claims not covered by standard JWTPayload
  auth_time: number;
  typ: string;
  azp: string;
  session_state: string;
  acr: string;
  realm_access?: { roles: string[] };
  resource_access?: {
    [key: string]: {
      roles: string[];
    };
  };
  scope: string;
  sid: string;
  email_verified: boolean;
  name?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
}

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
      // Debug logging
      console.log('DEBUG AUTH: Middleware called for:', req.url);
      console.log('DEBUG AUTH: Method:', req.method);
      console.log('DEBUG AUTH: Required roles:', requiredRoles);

      // Extract the bearer token from the Authorization header
      const authHeader = req.headers.authorization;
      console.log('DEBUG AUTH: Auth header present:', !!authHeader);
      console.log(
        'DEBUG AUTH: Auth header value:',
        authHeader ? authHeader.substring(0, 20) + '...' : 'NONE'
      );

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('DEBUG AUTH: No valid bearer token found');
        return res.status(401).json({
          success: false,
          error: 'Unauthorized - No valid token provided',
        } as ErrorResponse);
      }

      const token = authHeader.split(' ')[1];
      console.log('DEBUG AUTH: Token extracted, length:', token ? token.length : 0);

      try {
        // Verify the token
        console.log('DEBUG AUTH: Verifying token...');
        const payload = await verifyToken(token);
        console.log('DEBUG AUTH: Token verified successfully');
        console.log('DEBUG AUTH: User payload:', {
          sub: payload.sub,
          preferred_username: payload.preferred_username,
          realm_access: payload.realm_access,
          resource_access: payload.resource_access,
        });

        // Check if the user has the required role
        if (requiredRoles.length > 0 && !hasRequiredRole(payload, requiredRoles)) {
          console.log('DEBUG AUTH: User does not have required roles');
          return res.status(403).json({
            success: false,
            error: 'Forbidden - Insufficient permissions',
          } as ErrorResponse);
        }

        console.log('DEBUG AUTH: Role check passed, proceeding to handler');

        // Add the decoded token to the request object for future use
        // Extend the NextApiRequest type
        interface AuthenticatedRequest extends NextApiRequest {
          user: KeycloakTokenPayload;
        }
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
