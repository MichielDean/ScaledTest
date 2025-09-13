import { betterAuth } from 'better-auth';
import { Pool } from 'pg';
import { admin, twoFactor, username, bearer } from 'better-auth/plugins';
import { createAccessControl } from 'better-auth/plugins/access';
import { statement } from './auth-shared';
import { getRequiredEnvVar } from '../environment/env';
import { dbLogger as logger } from '../logging/logger';
import { randomBytes } from 'crypto';

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

// Public surface for the admin API used by the application
export interface AuthAdminApi {
  // Update a user's attributes (role, name, email, etc.)
  updateUser?: (opts: {
    userId: string;
    role?: string;
    name?: string;
    email?: string;
  }) => Promise<void>;
  // Delete a user by id
  deleteUser?: (opts: { userId: string }) => Promise<void>;
  // Additional admin helpers may be present depending on Better Auth plugins
  [key: string]: unknown;
}

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
          adminRoles: ['owner', 'maintainer'], // Include our custom admin roles
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
          generateId: () => generateId(),
        },
      },
    });

    logger.debug('Better Auth instance created successfully');
  }

  return authInstance;
}

/**
 * Generate a UUID v4 string. Prefer built-in crypto.randomUUID when available,
 * otherwise fall back to a small randomBytes-based implementation.
 */
function generateId(): string {
  try {
    const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
    if (typeof g.crypto?.randomUUID === 'function') {
      return g.crypto!.randomUUID!();
    }
  } catch {
    // ignore and fallback
  }

  // Fallback: generate UUID v4 from random bytes
  const bytes = randomBytes(16);
  // Per RFC4122 v4: set version and variant bits
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return (
    hex.substring(0, 8) +
    '-' +
    hex.substring(8, 12) +
    '-' +
    hex.substring(12, 16) +
    '-' +
    hex.substring(16, 20) +
    '-' +
    hex.substring(20)
  );
}

// Export the auth instance
export const auth = getAuth();

// Export the admin API surface if present on the Better Auth instance
// Use unknown-to-typed cast to avoid `any` lint rule while still capturing runtime shape
export const authAdminApi: AuthAdminApi | null =
  (auth as unknown as { api?: AuthAdminApi })?.api ?? null;
