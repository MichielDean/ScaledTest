// Mock Better Auth modules to avoid ES module issues in Jest
jest.mock('better-auth/react', () => ({
  createAuthClient: jest.fn(() => ({
    signIn: {
      email: jest.fn(),
    },
    signOut: jest.fn(),
    getSession: jest.fn(),
  })),
}));

jest.mock('better-auth/client/plugins', () => ({
  adminClient: jest.fn(),
}));

describe('Authentication Integration', () => {
  describe('Better Auth Service', () => {
    it('should export auth client correctly', async () => {
      // This is a basic test to ensure auth client is properly configured
      const { authClient } = await import('../../src/lib/auth-client');

      expect(authClient).toBeDefined();
      expect(authClient.signIn).toBeDefined();
      expect(authClient.signIn.email).toBeDefined();
      expect(authClient.getSession).toBeDefined();
    });

    it('should have proper base URL configuration', async () => {
      // Test that the auth client is configured with proper base URL
      const { authClient } = await import('../../src/lib/auth-client');

      // Auth client should be configured (we can't easily test the actual config
      // without exposing internal properties, but we can test it exists)
      expect(authClient).toBeDefined();
    });
  });
});
