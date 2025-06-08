/**
 * TypeScript interfaces for OpenSearch client responses
 * Used to provide typing for OpenSearch API calls and mock responses in tests
 */

import { SuccessApiResponse, ErrorApiResponse } from './common';

/**
 * Base response structure from OpenSearch API calls
 */
export interface OpenSearchResponse {
  body: unknown;
  statusCode: number;
  headers: Record<string, unknown>;
  meta: Record<string, unknown>;
  abort?: () => void;
}

/**
 * Promise returned by OpenSearch client with abort capability
 */
export interface OpenSearchPromise extends Promise<OpenSearchResponse> {
  abort: () => void;
}

/**
 * Error promise returned by OpenSearch client with abort capability
 */
export interface OpenSearchErrorPromise extends Promise<never> {
  abort: () => void;
}

/**
 * OpenSearch health status structure
 */
export interface OpenSearchHealth {
  connected: boolean;
  indexExists: boolean;
  documentsCount: number;
  clusterHealth: string;
}

/**
 * OpenSearch metadata
 */
export interface OpenSearchMeta {
  source: 'OpenSearch';
  index: string;
  timestamp: string;
  opensearchHealth: OpenSearchHealth;
  [key: string]: unknown;
}

/**
 * Generic successful API response for OpenSearch-based endpoints
 */
export interface OpenSearchApiResponse<T> extends SuccessApiResponse<T[]> {
  meta: OpenSearchMeta;
}

/**
 * Common error response structure for OpenSearch-based endpoints
 */
export interface OpenSearchErrorApiResponse extends ErrorApiResponse {
  source: 'OpenSearch';
}
