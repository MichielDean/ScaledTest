#!/usr/bin/env tsx
/**
 * Better Auth Test User Setup Script
 *
 * Creates test users with different roles for development and testing environments.
 * This script should NOT be run in production environments.
 *
 * Usage:
 *   npx tsx scripts/setup-better-auth-test-users.ts
 */

import { getRequiredEnvVar } from '../src/environment/env';
import { apiLogger as logger } from '../src/logging/logger';
import { config } from 'dotenv';

// Load environment variables
config();

const scriptLogger = logger.child({ module: 'setup-better-auth-test-users' });

interface TestUser {
  email: string;
  name: string;
  password: string;
  role: string;
}

const TEST_USERS: TestUser[] = [
  {
    email: 'readonly@example.com',
    name: 'Read Only',
    password: 'ReadOnly123!',
    role: 'readonly',
  },
  {
    email: 'maintainer@example.com',
    name: 'Maintainer User',
    password: 'Maintainer123!',
    role: 'maintainer',
  },
  {
    email: 'owner@example.com',
    name: 'Owner User',
    password: 'Owner123!',
    role: 'owner',
  },
];

/**
 * Create a user via Better Auth API and assign role
 */
async function createUserViaBetterAuth(user: TestUser): Promise<string | null> {
  const baseUrl = getRequiredEnvVar('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000');

  try {
    // Check if user already exists
    const existingUser = await checkUserExists(user.email);
    if (existingUser) {
      scriptLogger.info(`User ${user.email} already exists, updating role`);
      return existingUser.id;
    }

    // Create user using Better Auth signup endpoint
    const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: user.email,
        password: user.password,
        name: user.name,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();

    if (result.user) {
      scriptLogger.info(`Successfully created user: ${user.email}`);
      scriptLogger.info(`User ID: ${result.user.id}`);
      return result.user.id;
    } else {
      throw new Error(`Unexpected response format: ${JSON.stringify(result)}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      scriptLogger.info(`User ${user.email} already exists, trying to get user ID`);
      const existingUser = await checkUserExists(user.email);
      return existingUser?.id || null;
    } else {
      scriptLogger.error({ err: error }, `Failed to create user: ${user.email}`);
      throw error;
    }
  }
}

/**
 * Check if user exists and return user info
 * For now, we'll rely on the signup API error handling to detect duplicates
 */
async function checkUserExists(email: string): Promise<{ id: string; email: string } | null> {
  // Better Auth signup API will handle duplicate detection
  // We'll implement user lookup via admin API in the future if needed
  return null;
}

/**
 * Assign role to user using Better Auth admin API via HTTP
 */
async function assignUserRole(userId: string, role: string, userEmail: string): Promise<void> {
  const baseUrl = getRequiredEnvVar('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000');

  try {
    scriptLogger.info(`Assigning role '${role}' to user: ${userEmail} (${userId})`);

    // Use Better Auth admin API to set user role
    const response = await fetch(`${baseUrl}/api/auth/admin/set-role`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: userId,
        role: role,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Role assignment failed - HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    scriptLogger.info({ result }, `Successfully assigned role '${role}' to user: ${userEmail}`);
  } catch (error) {
    scriptLogger.error({ err: error, userId, role, userEmail }, 'Failed to assign role to user');
    throw error;
  }
}

/**
 * Setup all test users
 */
async function setupTestUsers(): Promise<void> {
  scriptLogger.info('Setting up Better Auth test users...');

  for (const user of TEST_USERS) {
    try {
      const userId = await createUserViaBetterAuth(user);
      if (userId) {
        await assignUserRole(userId, user.role, user.email);
        scriptLogger.info(`Successfully set up user: ${user.email} with role: ${user.role}`);
      }
    } catch (error) {
      scriptLogger.error({ err: error, user: user.email }, 'Failed to setup user');
      // Continue with other users instead of failing completely
    }
  }

  scriptLogger.info('Better Auth test user setup completed');
} /**
 * Main execution
 */
async function main(): Promise<void> {
  console.log('Setting up Better Auth test users...');
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
  console.log('BETTER_AUTH_SECRET:', process.env.BETTER_AUTH_SECRET ? 'Set' : 'Not set');

  try {
    await setupTestUsers();
    scriptLogger.info('Better Auth test user setup completed successfully');
    console.log('Better Auth test users setup completed successfully!');
    process.exit(0);
  } catch (error) {
    scriptLogger.error({ err: error }, 'Better Auth test user setup failed');
    console.error('Better Auth test user setup failed:', error);
    process.exit(1);
  }
}

// Execute the script
main().catch(error => {
  console.error('Script execution failed:', error);
  process.exit(1);
});

// Run the script if called directly
const isMainModule = process.argv[1].endsWith('setup-better-auth-test-users.ts');
if (isMainModule) {
  main();
}

export { setupTestUsers };
