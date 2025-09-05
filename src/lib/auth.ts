import { betterAuth } from 'better-auth';
import { Pool } from 'pg';
import { admin, twoFactor, username, bearer } from 'better-auth/plugins';
import { createAccessControl } from 'better-auth/plugins/access';
import { statement } from './auth-shared';
import { getRequiredEnvVar } from '../environment/env';
import { dbLogger as logger } from '../logging/logger';

// Create access controller
const ac = createAccessControl(statement);

// Define roles with their permissions
export const roles = {
  readonly: ac.newRole({
    content: ['read'],
  }),
  maintainer: ac.newRole({
    content: ['read', 'write'],
  }),
  owner: ac.newRole({
    content: ['read', 'write'],
    users: ['manage'],
    admin: ['access'],
  }),
};

// Better Auth instance
let authInstance: ReturnType<typeof betterAuth> | null = null;

// Function to get or create the Better Auth instance
function getAuth(): ReturnType<typeof betterAuth> {
  if (!authInstance) {
    logger.debug('Creating Better Auth instance...');

    authInstance = betterAuth({
      database: new Pool({
        connectionString: getRequiredEnvVar(
          'DATABASE_URL',
          'Authentication requires a valid database connection'
        ),
      }),
      emailAndPassword: {
        enabled: true,
        requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION
          ? process.env.REQUIRE_EMAIL_VERIFICATION === 'true'
          : true, // Default to true for safety
      },
      socialProviders: {
        github: {
          clientId: process.env.GITHUB_CLIENT_ID!,
          clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        },
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        },
      },
      plugins: [
        admin({
          ac,
          roles,
          defaultRole: 'readonly',
        }), // Enables admin functionality with RBAC
        bearer(), // Enables Bearer token authentication for API
        twoFactor(), // Optional: 2FA support
        username(), // Optional: Username support
      ],
      session: {
        expiresIn: 60 * 60 * 24 * 7, // 7 days
        updateAge: 60 * 60 * 24, // 1 day
      },
      advanced: {
        database: {
          generateId: () => crypto.randomUUID(), // Use UUID v4
        },
      },
    });

    logger.debug('Better Auth instance created successfully');
  }

  return authInstance;
}

// Export the auth instance
export const auth = getAuth();
