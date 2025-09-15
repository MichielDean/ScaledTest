export interface TestUser {
  email: string;
  password: string;
  displayName: string;
  roles: string[];
}

/**
 * Test user configurations based on Better Auth's default role system
 */
export const TestUsers: Record<string, TestUser> = {
  USER: {
    email: 'user@scaledtest.com',
    password: 'TestUser123!',
    displayName: 'Test User',
    roles: ['user'],
  },
  ADMIN: {
    email: 'admin@scaledtest.com',
    password: 'Admin123!',
    displayName: 'Admin User',
    roles: ['admin'],
  },
};
