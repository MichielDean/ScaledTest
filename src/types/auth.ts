/**
 * Auth-related interfaces
 *
 * This file contains shared authentication-related interfaces to reduce duplication across
 * the codebase. These interfaces represent structures used for authentication with Better Auth,
 * handling tokens, and user authentication.
 */

import { NextApiRequest } from 'next';
import { UserRole } from './roles';

// Re-export UserRole for convenience
export { UserRole } from './roles';

/**
 * Response from Better Auth authentication
 */
export interface BetterAuthTokenResponse {
  user: {
    id: string;
    email: string;
    name: string;
    role?: string;
  };
  token: string;
  redirect: boolean;
  url?: string;
}

/**
 * Better Auth session data
 */
export interface BetterAuthSession {
  user: {
    id: string;
    email: string;
    name: string;
    role?: string;
  };
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
    token: string;
  };
}

/**
 * Decoded Better Auth token payload
 */
export interface BetterAuthTokenPayload {
  // Better Auth specific claims
  userId: string;
  email?: string;
  role?: string;
}

/**
 * Extended NextApiRequest to include the authenticated user
 */
export interface AuthenticatedRequest extends NextApiRequest {
  user: BetterAuthTokenPayload;
}

/**
 * Configuration for method-specific role requirements
 */
export interface MethodRoleConfig {
  GET?: UserRole[];
  POST?: UserRole[];
  PUT?: UserRole[];
  PATCH?: UserRole[];
  DELETE?: UserRole[];
}
