// tests/unit/setup.ts
import { setupOpenSearchTestEnv } from '../utils/testEnvSetup';

// Mock keycloak-js module to fix the ES module issue
jest.mock('keycloak-js', () => {
  return function () {
    return {};
  };
});

// Mock jose for JWT verification
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

// This file is run before each unit test
setupOpenSearchTestEnv();
