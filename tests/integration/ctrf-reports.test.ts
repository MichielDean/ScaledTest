import { NextApiRequest, NextApiResponse } from 'next';
import { AuthenticatedRequest } from '../../src/auth/apiAuth';

// Type alias for promises with abort capability
// (similar to OpenSearchPromise but with jest mock)
type AbortablePromise<T> = Promise<T> & {
  abort: jest.Mock;
};

jest.mock('keycloak-js', () => {
  return function () {
    return {};
  };
});

jest.mock('jose', () => ({
  jwtVerify: jest.fn().mockResolvedValue({
    payload: {
      sub: 'user-123',
      aud: 'scaledtest-client',
      resource_access: {
        'scaledtest-client': {
          roles: ['owner', 'maintainer', 'readonly'],
        },
      },
    },
  }),
  createRemoteJWKSet: jest.fn().mockReturnValue('mocked-jwks'),
}));

jest.mock('../../src/auth/apiAuth', () => ({
  validateToken: jest
    .fn()
    .mockImplementation((req: NextApiRequest, res: NextApiResponse, next: () => void) => {
      const authenticatedReq = req as AuthenticatedRequest;
      authenticatedReq.user = {
        sub: 'user-123',
        auth_time: Date.now(),
        typ: 'Bearer',
        azp: 'scaledtest-client',
        session_state: 'test-session',
        acr: '1',
        realm_access: { roles: ['owner', 'maintainer', 'readonly'] },
        resource_access: {
          'scaledtest-client': {
            roles: ['owner', 'maintainer', 'readonly'],
          },
        },
        scope: 'openid profile email',
        sid: 'test-sid',
        email_verified: true,
        email: 'test@example.com',
        name: 'Test User',
        preferred_username: 'test-user',
      };
      if (typeof next === 'function') {
        return next();
      }
      return (handler: (req: NextApiRequest, res: NextApiResponse) => void) => handler(req, res);
    }),
  requireRole: jest
    .fn()
    .mockImplementation(
      (role: string) => (req: NextApiRequest, res: NextApiResponse, next: () => void) => {
        // Role is intentionally unused in this mock
        void role;
        if (typeof next === 'function') {
          return next();
        }
        return (handler: (req: NextApiRequest, res: NextApiResponse) => void) => handler(req, res);
      }
    ),
  createApi: {
    readWrite: jest.fn((handlers, options) => {
      return async (req: NextApiRequest, res: NextApiResponse) => {
        // Run setup if provided
        if (options?.setup) {
          await options.setup();
        }

        const authenticatedReq = req as AuthenticatedRequest;
        authenticatedReq.user = {
          sub: 'user-123',
          auth_time: Date.now(),
          typ: 'Bearer',
          azp: 'scaledtest-client',
          session_state: 'test-session',
          acr: '1',
          realm_access: { roles: ['owner', 'maintainer', 'readonly'] },
          resource_access: {
            'scaledtest-client': {
              roles: ['owner', 'maintainer', 'readonly'],
            },
          },
          scope: 'openid profile email',
          sid: 'test-sid',
          email_verified: true,
          email: 'test@example.com',
          name: 'Test User',
          preferred_username: 'test-user',
        };

        const method = req.method?.toUpperCase() || 'GET';
        const handler = handlers[method as keyof typeof handlers];

        if (handler) {
          const reqLogger = {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
          };
          return handler(authenticatedReq, res, reqLogger);
        } else {
          const supportedMethods = Object.keys(handlers).join(', ');
          return res.status(405).json({
            success: false,
            error: `Method not allowed. Supported methods: ${supportedMethods}`,
          });
        }
      };
    }),
  },
  withApiAuth: jest
    .fn()
    .mockImplementation(
      (handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>, roles?: string[]) => {
        // Roles parameter is intentionally unused in this mock
        void roles;
        return async (req: NextApiRequest, res: NextApiResponse) => {
          const authenticatedReq = req as AuthenticatedRequest;
          authenticatedReq.user = {
            sub: 'user-123',
            auth_time: Date.now(),
            typ: 'Bearer',
            azp: 'scaledtest-client',
            session_state: 'test-session',
            acr: '1',
            realm_access: { roles: ['owner', 'maintainer', 'readonly'] },
            resource_access: {
              'scaledtest-client': {
                roles: ['owner', 'maintainer', 'readonly'],
              },
            },
            scope: 'openid profile email',
            sid: 'test-sid',
            email_verified: true,
            email: 'test@example.com',
            name: 'Test User',
            preferred_username: 'test-user',
          };
          return handler(req, res);
        };
      }
    ),
}));

jest.mock('../../src/auth/keycloak', () => ({
  UserRole: {
    READONLY: 'readonly',
    MAINTAINER: 'maintainer',
    OWNER: 'owner',
  },
}));

import { getAuthToken } from '../authentication/tokenService';
import testReportsHandler from '../../src/pages/api/test-reports';

jest.mock('../authentication/tokenService');
jest.mock('../../src/lib/opensearch', () => {
  return {
    __esModule: true,
    ensureCtrfReportsIndexExists: jest.fn().mockImplementation(() => Promise.resolve()),
    default: {
      indices: {
        exists: jest.fn(),
        create: jest.fn(),
      },
      index: jest.fn(),
      search: jest.fn(),
    },
    TEST_RESULTS_INDEX: 'test-results',
    checkConnection: jest.fn(),
    ensureIndexExists: jest.fn(),
  };
});
