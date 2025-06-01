import { NextApiRequest, NextApiResponse } from 'next';
import { UserRole } from './keycloak';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { authLogger as logger, logError, getRequestLogger } from '../utils/logger';
import { keycloakConfig, keycloakEndpoints } from '../config/keycloak';

// Interface for error responses
interface ErrorResponse {
  success: false;
  error: string;
  details?: unknown;
}

// Interface for JWT token payload with roles
interface KeycloakTokenPayload {
  exp: number;
  iat: number;
  auth_time: number;
  jti: string;
  iss: string;
  aud: string | string[];
  sub: string;
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
    return payload as unknown as KeycloakTokenPayload;
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
        return res.status(401).json({
          success: false,
          error: 'Unauthorized - No valid token provided',
        } as ErrorResponse);
      }

      const token = authHeader.split(' ')[1];

      try {
        // Verify the token
        const payload = await verifyToken(token);

        // Check if the user has the required role
        if (requiredRoles.length > 0 && !hasRequiredRole(payload, requiredRoles)) {
          return res.status(403).json({
            success: false,
            error: 'Forbidden - Insufficient permissions',
          } as ErrorResponse);
        } // Add the decoded token to the request object for future use
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
