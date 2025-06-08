/**
 * Test-related interfaces
 *
 * This file contains shared interfaces used in tests to reduce duplication.
 * These interfaces represent test data structures and mocks used across test files.
 */

import { CtrfSchema } from '../schemas/ctrf/ctrf';

/**
 * Individual test result - use CTRF standard test object
 * This replaces any custom TestResult interfaces
 */
export type TestResult = CtrfSchema['results']['tests'][0];

/**
 * Mock request body for API tests
 */
export interface MockRequestBody {
  [key: string]: unknown;
}

/**
 * Mock request query for API tests
 */
export interface MockRequestQuery {
  [key: string]: string | string[] | undefined;
}

/**
 * Stored report structure for system tests - use CTRF standard
 */
export interface StoredReport extends CtrfSchema {
  _id: string;
  storedAt: string;
}

/**
 * Network request structure - use CTRF attachment structure for consistency
 * This aligns with CTRF's attachment model for additional test data
 */
export type NetworkRequest = {
  name: string;
  contentType: string;
  path: string;
  extra?: {
    url?: string;
    method?: string;
    requestHeaders?: Record<string, string>;
    requestBody?: string | Record<string, unknown>;
    statusCode?: number;
    responseHeaders?: Record<string, string>;
    responseBody?: string | Record<string, unknown>;
    timeTakenMs?: number;
    error?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
};

/**
 * Error details structure - use CTRF standard fields
 * This aligns with CTRF's test object structure for error information
 */
export interface ErrorDetails {
  message?: string; // maps to CTRF test.message
  trace?: string; // maps to CTRF test.trace
  screenshot?: string; // maps to CTRF test.screenshot
  stdout?: string[]; // maps to CTRF test.stdout
  stderr?: string[]; // maps to CTRF test.stderr
  attachments?: NetworkRequest[]; // maps to CTRF test.attachments
}
