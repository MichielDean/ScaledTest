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

/**
 * Better Auth Admin API interfaces for user management
 * These interfaces represent the admin API methods used for user operations
 */

// User data returned by Better Auth admin API
export interface BetterAuthUser {
  id?: string;
  userId?: string;
  email?: string;
  name?: string;
  role?: string;
}

// Parameter shapes for getUser method - Better Auth may accept different formats
export interface GetUserByUserId {
  userId: string;
}

export interface GetUserById {
  id: string;
}

export type GetUserParams = GetUserByUserId | GetUserById;

// Session data from Better Auth admin API
export interface BetterAuthSessionData {
  user?: BetterAuthUser;
  id?: string;
  userId?: string;
}

export interface GetSessionParams {
  headers?: Headers;
}

// Better Auth admin API interface for type safety - flexible to work with actual API
export interface BetterAuthAdminApi {
  getUser?: (...args: unknown[]) => Promise<BetterAuthUser | null>;
  getSession?: (...args: unknown[]) => Promise<BetterAuthSessionData | null>;
  updateUser?: (...args: unknown[]) => Promise<void>;
  deleteUser?: (...args: unknown[]) => Promise<void>;
  [key: string]: unknown; // Allow for additional properties
}

// Specific typed interface for Better Auth admin API user operations
export interface BetterAuthUserManagementApi {
  getUser: (opts: {
    body: { userId: string };
  }) => Promise<{ id: string; role?: string; email?: string; name?: string } | null>;
  setRole: (opts: { body: { userId: string; role: string } }) => Promise<void>;
}

// Auth object with admin API - more flexible interface
export interface AuthWithAdminApi {
  api?: Record<string, unknown>; // Flexible to work with actual Better Auth API
  [key: string]: unknown; // Allow for additional properties
}

/**
 * Error types for Better Auth operations
 */
export interface BetterAuthError extends Error {
  code?: string;
  statusCode?: number;
  details?: unknown;
}

export interface BetterAuthApiError {
  message: string;
  code?: string;
  userId?: string;
  operation?: string;
}
