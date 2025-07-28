#!/usr/bin/env tsx
/**
 * Test User Setup Script
 *
 * Creates test users with different roles for development and testing environments.
 * This script should NOT be run in production environments.
 *
 * Usage:
 *   npx tsx scripts/setup-test-users.ts
 *   npm run setup:test-users
 */

import { getKeycloakAdminToken, getAdminAuthHeaders } from '../src/authentication/adminAuth';
import { getRequiredEnvVar } from '../src/environment/env';
import { apiLogger as logger } from '../src/logging/logger';
import { config } from 'dotenv';

// Load environment variables
config();

const scriptLogger = logger.child({ module: 'setup-test-users' });

interface TestUser {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  roles: string[];
}

const TEST_USERS: TestUser[] = [
  {
    username: 'readonly@example.com',
    email: 'readonly@example.com',
    firstName: 'Read',
    lastName: 'Only',
    password: 'ReadOnly123!',
    roles: ['readonly'],
  },
  {
    username: 'maintainer@example.com',
    email: 'maintainer@example.com',
    firstName: 'Maintainer',
    lastName: 'User',
    password: 'Maintainer123!',
    roles: ['readonly', 'maintainer'],
  },
  {
    username: 'owner@example.com',
    email: 'owner@example.com',
    firstName: 'Owner',
    lastName: 'User',
    password: 'Owner123!',
    roles: ['readonly', 'maintainer', 'owner'],
  },
];

/**
 * Check if a user already exists
 */
async function userExists(
  headers: any,
  keycloakUrl: string,
  realm: string,
  username: string
): Promise<boolean> {
  try {
    const response = await fetch(
      `${keycloakUrl}/admin/realms/${realm}/users?username=${encodeURIComponent(username)}`,
      { headers }
    );

    if (!response.ok) {
      return false;
    }

    const users = await response.json();
    return Array.isArray(users) && users.length > 0;
  } catch (error) {
    scriptLogger.warn({ error, username }, 'Error checking if user exists');
    return false;
  }
}

/**
 * Update user roles
 */
async function updateUserRoles(
  headers: any,
  keycloakUrl: string,
  realm: string,
  userId: string,
  roles: string[],
  username: string
): Promise<void> {
  // Assign roles
  for (const roleName of roles) {
    // Get role details
    const roleResponse = await fetch(`${keycloakUrl}/admin/realms/${realm}/roles/${roleName}`, {
      headers,
    });

    if (!roleResponse.ok) {
      scriptLogger.warn({ roleName, username }, 'Role not found, skipping');
      continue;
    }

    const role = await roleResponse.json();

    // Assign role to user
    const assignRoleResponse = await fetch(
      `${keycloakUrl}/admin/realms/${realm}/users/${userId}/role-mappings/realm`,
      {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([role]),
      }
    );

    if (!assignRoleResponse.ok) {
      const errorText = await assignRoleResponse.text();
      scriptLogger.warn({ roleName, username, error: errorText }, 'Failed to assign role');
    } else {
      scriptLogger.info({ roleName, username }, 'Role assigned successfully');
    }
  }
}

/**
 * Create a test user
 */
async function createTestUser(
  headers: any,
  keycloakUrl: string,
  realm: string,
  user: TestUser
): Promise<void> {
  try {
    // Check if user already exists
    if (await userExists(headers, keycloakUrl, realm, user.username)) {
      scriptLogger.info({ username: user.username }, 'Test user already exists, updating roles');
      // Get user ID for existing user
      const usersResponse = await fetch(
        `${keycloakUrl}/admin/realms/${realm}/users?username=${encodeURIComponent(user.username)}`,
        { headers }
      );
      const users = await usersResponse.json();
      const userId = users[0]?.id;

      if (userId) {
        // Update roles for existing user
        await updateUserRoles(headers, keycloakUrl, realm, userId, user.roles, user.username);
      }
      return;
    }

    // Create user
    const createUserResponse = await fetch(`${keycloakUrl}/admin/realms/${realm}/users`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        enabled: true,
        emailVerified: true,
      }),
    });

    if (!createUserResponse.ok) {
      const errorText = await createUserResponse.text();
      throw new Error(`Failed to create user: ${createUserResponse.status} ${errorText}`);
    }

    // Get the user ID from the Location header
    const location = createUserResponse.headers.get('Location');
    if (!location) {
      throw new Error('User created but no Location header returned');
    }

    const userId = location.split('/').pop();
    if (!userId) {
      throw new Error('Could not extract user ID from Location header');
    }

    // Set password
    const setPasswordResponse = await fetch(
      `${keycloakUrl}/admin/realms/${realm}/users/${userId}/reset-password`,
      {
        method: 'PUT',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'password',
          value: user.password,
          temporary: false,
        }),
      }
    );

    if (!setPasswordResponse.ok) {
      const errorText = await setPasswordResponse.text();
      throw new Error(`Failed to set password: ${setPasswordResponse.status} ${errorText}`);
    }

    // Assign roles
    await updateUserRoles(headers, keycloakUrl, realm, userId, user.roles, user.username);

    scriptLogger.info(
      { username: user.username, roles: user.roles },
      'Test user created successfully'
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    scriptLogger.error(
      { username: user.username, error: errorMessage },
      'Failed to create test user'
    );
    throw error;
  }
}

/**
 * Set up all test users
 */
async function setupTestUsers(): Promise<void> {
  const keycloakUrl = getRequiredEnvVar('KEYCLOAK_URL');
  const realm = 'scaledtest';

  try {
    scriptLogger.info('Starting test user setup...');

    // Get admin authentication
    const headers = await getAdminAuthHeaders();
    scriptLogger.info('Admin authentication successful');

    // Create each test user
    for (const user of TEST_USERS) {
      await createTestUser(headers, keycloakUrl, realm, user);
    }

    scriptLogger.info({ userCount: TEST_USERS.length }, 'All test users set up successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    scriptLogger.error({ error: errorMessage }, 'Test user setup failed');
    throw error;
  }
}

// Run the setup if this script is executed directly
if (
  import.meta.url.endsWith('setup-test-users.ts') ||
  process.argv[1]?.endsWith('setup-test-users.ts') ||
  process.argv.some(arg => arg.includes('setup-test-users.ts'))
) {
  scriptLogger.info('Script executed directly, starting test user setup...');
  setupTestUsers().catch(error => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : '';
    scriptLogger.error({ error: errorMessage, stack: errorStack }, 'Setup failed');
    console.error('Full error:', error);
    process.exit(1);
  });
}

export { setupTestUsers };
