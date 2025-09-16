import { createAuthClient } from 'better-auth/react';
import { adminClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BASE_URL,
  plugins: [
    adminClient({
      // Use Better Auth's built-in role system (admin/user)
    }),
  ],
});

export const { signIn, signOut, signUp, useSession } = authClient;
