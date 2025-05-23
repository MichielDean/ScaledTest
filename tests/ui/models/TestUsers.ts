export interface TestUser {
  username: string;
  password: string;
  displayName: string;
  roles: string[];
}

/**
 * Test user configurations based on the ones defined in the .env.example file
 */
export const TestUsers: Record<string, TestUser> = {
  READONLY: {
    username: 'readonly-user',
    password: 'password',
    displayName: 'Read Only',
    roles: ['readonly'],
  },
  MAINTAINER: {
    username: 'maintainer-user',
    password: 'password',
    displayName: 'Maintainer User',
    roles: ['readonly', 'maintainer'],
  },
  OWNER: {
    username: 'owner-user',
    password: 'password',
    displayName: 'Owner User',
    roles: ['readonly', 'maintainer', 'owner'],
  },
};
