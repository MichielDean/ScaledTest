/**
 * Common API response interfaces
 *
 * This file contains shared API response interfaces to reduce duplication across the codebase.
 * These interfaces represent common response structures returned by API endpoints.
 */

import { UserWithRoles } from './user';
import { BaseApiResponse, SuccessApiResponse, ErrorApiResponse } from './common';

/**
 * Error response with HTTP status code
 * @deprecated Use ErrorApiResponse from common.ts instead
 */
export interface ErrorResponse extends ErrorApiResponse {
  success: false;
  status: number;
}

/**
 * Authentication response with tokens
 */
export interface AuthResponse extends BaseApiResponse {
  token?: string;
  refreshToken?: string;
  expiresIn?: number;
}

/**
 * Registration response extending auth response
 */
export interface RegisterResponse extends AuthResponse {
  registeredAt?: string;
  verified?: boolean;
}

/**
 * User management API responses
 */
export type UserManagementResponse = SuccessApiResponse<UserWithRoles[]>;

/**
 * OpenSearch response for analytics endpoints
 */
export interface AnalyticsResponse extends BaseApiResponse {
  data?: unknown;
}
