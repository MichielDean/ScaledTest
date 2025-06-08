/**
 * Auth-related interfaces
 *
 * This file contains shared authentication-related interfaces to reduce duplication across
 * the codebase. These interfaces represent structures used for authentication with Keycloak,
 * handling tokens, and user authentication.
 */

import { JWTPayload } from 'jose';
import { NextApiRequest } from 'next';
import { UserRole } from '../auth/keycloak';

/**
 * Keycloak configuration interface
 */
export interface KeycloakConfig {
  resource: string;
  'auth-server-url': string;
  realm: string;
  [key: string]: string | boolean | number;
}

/**
 * Response from Keycloak token endpoint
 */
export interface KeycloakTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  token_type: string;
  scope: string;
}

/**
 * Response from Keycloak admin token endpoint
 */
export interface AdminTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  refresh_token?: string;
}

/**
 * Decoded Keycloak token payload
 */
export interface KeycloakTokenPayload extends JWTPayload {
  // Keycloak-specific claims not covered by standard JWTPayload
  auth_time: number;
  typ: string;
  azp: string;
  session_state: string;
  acr: string;
  realm_access?: { roles: string[] };
  resource_access?: {
    [key: string]: {
      roles: string[];
    };
  };
  scope: string;
  sid: string;
  email_verified: boolean;
  name?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
}

/**
 * Extended NextApiRequest to include the authenticated user
 */
export interface AuthenticatedRequest extends NextApiRequest {
  user: KeycloakTokenPayload;
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
