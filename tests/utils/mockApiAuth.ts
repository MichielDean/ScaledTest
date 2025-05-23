// tests/utils/mockApiAuth.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { UserRole } from '../../src/auth/keycloak';
import jwt from 'jsonwebtoken';

// Mock version of withApiAuth that bypasses actual token verification for testing
export function mockWithApiAuth(
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
        });
      }

      // For tests, we don't actually verify the token
      // We just assume it's valid and contains the required roles
      const mockPayload = {
        preferred_username: 'test-user',
        sub: '123456',
        realm_access: {
          roles: ['maintainer', 'readonly'],
        },
        resource_access: {
          'scaledtest-client': {
            roles: [],
          },
        },
      };

      // Add the mock payload to the request
      (req as any).user = mockPayload;

      // Call the original handler
      return handler(req, res);
    } catch (error) {
      console.error('API authentication error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  };
}
