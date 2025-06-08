/**
 * Common base interfaces used across the application
 *
 * This file contains shared base interfaces that eliminate duplication
 * and provide consistent patterns throughout the application.
 */

/**
 * Base API response interface for all API endpoints
 */
export interface BaseApiResponse {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Generic successful API response with data
 */
export interface SuccessApiResponse<T = unknown> extends BaseApiResponse {
  success: true;
  data: T;
}

/**
 * Generic error API response
 */
export interface ErrorApiResponse extends BaseApiResponse {
  success: false;
  error: string;
  status?: number;
  details?: unknown;
}

/**
 * Generic API response that can be either success or error
 */
export type ApiResponse<T = unknown> = SuccessApiResponse<T> | ErrorApiResponse;

/**
 * Paginated response interface
 */
export interface PaginatedResponse<T> extends SuccessApiResponse<T[]> {
  pagination: {
    page: number;
    size: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Base filter interface for queries
 */
export interface BaseFilters {
  page?: number;
  size?: number;
}

/**
 * Base entity interface with common fields
 */
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Base user information that's common across all user representations
 */
export interface BaseUser {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Common HTTP methods
 */
export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  PATCH = 'PATCH',
  DELETE = 'DELETE',
  HEAD = 'HEAD',
  OPTIONS = 'OPTIONS',
}

/**
 * Base analytics data interface
 */
export interface BaseAnalyticsData {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

/**
 * Analytics data with percentage calculations
 */
export interface AnalyticsDataWithRates extends BaseAnalyticsData {
  passRate: number;
  failRate?: number;
  skipRate?: number;
}
