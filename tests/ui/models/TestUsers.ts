export interface TestUser {
  email: string;
  password: string;
  displayName: string;
  roles: string[];
}

/**
 * Test user configurations based on the ones defined in the .env.example file
 */
export const TestUsers: Record<string, TestUser> = {
  READONLY: {
    email: 'readonly@example.com',
    password: 'password',
    displayName: 'Read Only',
    roles: ['readonly'],
  },
  MAINTAINER: {
    email: 'maintainer@example.com',
    password: 'password',
    displayName: 'Maintainer User',
    roles: ['readonly', 'maintainer'],
  },
  OWNER: {
    email: 'owner@example.com',
    password: 'password',
    displayName: 'Owner User',
    roles: ['readonly', 'maintainer', 'owner'],
  },
};
