import { setupOpenSearchTestEnv } from '../utils/testEnvSetup';

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

setupOpenSearchTestEnv();
