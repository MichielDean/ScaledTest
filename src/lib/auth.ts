import { betterAuth } from 'better-auth';
import { Pool } from 'pg';
import { admin, twoFactor, username, bearer } from 'better-auth/plugins';
import { createAccessControl } from 'better-auth/plugins/access';
import { statement } from './auth-shared';

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const auth: any = betterAuth({
  database: new Pool({
    connectionString: process.env.DATABASE_URL,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Disable for testing
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
