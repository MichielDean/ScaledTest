import { NextApiRequest, NextApiResponse } from 'next';
import { UserRole } from '../../src/auth/keycloak';
import { AuthenticatedRequest } from '../../src/auth/apiAuth';

// Mock version of withApiAuth that bypasses actual token verification for testing
export function mockWithApiAuth(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>,
  requiredRoles: UserRole[] = []
) {
  void requiredRoles; // Indicate this parameter is intentionally unused in mock
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      // Extract the bearer token from the Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized - No valid token provided',
        });
      }

      // For tests, we don't actually verify the token
      // We just assume it's valid and contains the required roles
      const mockPayload = {
        preferred_username: 'test-user',
        sub: '123456',
        aud: 'scaledtest-client',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        iss: 'test-keycloak',
        jti: 'test-jti',
        nbf: Math.floor(Date.now() / 1000),
        auth_time: Math.floor(Date.now() / 1000),
        typ: 'Bearer',
        azp: 'scaledtest-client',
        session_state: 'test-session',
        acr: '1',
        scope: 'openid profile email',
        sid: 'test-sid',
        email_verified: true,
        realm_access: {
          roles: ['maintainer', 'readonly'],
        },
        resource_access: {
          'scaledtest-client': {
            roles: [],
          },
        },
      };

      // Add the mock payload to the request using proper typing
      const authenticatedReq = req as AuthenticatedRequest;
      authenticatedReq.user = mockPayload;

      // Call the original handler
      return handler(req, res);
    } catch (error) {
      // In test environments, prefer structured error handling over console logging
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
