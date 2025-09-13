/**
 * Jest Test Environment Configuration
 *
 * This file configures environment variables required for Jest tests to run properly.
 * It sets up database, authentication, and other service configurations for the test environment.
 */

// Track if environment has been configured to prevent duplicate setup
let isEnvironmentConfigured = false;

/**
 * Set up environment variables for Jest tests
 * This ensures that all tests have the necessary environment variables configured
 */
export function setupTestEnvironmentVariables(): void {
  // Prevent multiple configurations
  if (isEnvironmentConfigured) {
    return;
  }

  // Database Configuration - Use TimescaleDB environment variable names
  process.env.TIMESCALEDB_HOST = process.env.TIMESCALEDB_HOST || 'localhost';
  process.env.TIMESCALEDB_PORT = process.env.TIMESCALEDB_PORT || '5432';
  process.env.TIMESCALEDB_DATABASE = process.env.TIMESCALEDB_DATABASE || 'scaledtest';
  process.env.TIMESCALEDB_USERNAME = process.env.TIMESCALEDB_USERNAME || 'scaledtest';
  process.env.TIMESCALEDB_PASSWORD = process.env.TIMESCALEDB_PASSWORD || 'password';

  // Environment Mode - Force test environment
  (process.env as Record<string, string>).NODE_ENV = 'test';

  // Better Auth Configuration - Point to auth database
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://scaledtest:password@localhost:5432/auth';
  process.env.BETTER_AUTH_SECRET =
    process.env.BETTER_AUTH_SECRET || 'test-secret-key-for-development-only';
  process.env.BETTER_AUTH_URL = process.env.BETTER_AUTH_URL || 'http://localhost:3000';

  // Test Application Configuration
  process.env.NEXT_PUBLIC_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  process.env.NEXT_PUBLIC_APP_BASE_URL =
    process.env.NEXT_PUBLIC_APP_BASE_URL || 'http://localhost:3000';

  // OpenSearch Configuration
  process.env.OPENSEARCH_HOST = process.env.OPENSEARCH_HOST || 'http://localhost:9200';
  process.env.OPENSEARCH_USERNAME = process.env.OPENSEARCH_USERNAME || 'admin';
  process.env.OPENSEARCH_PASSWORD = process.env.OPENSEARCH_PASSWORD || 'admin';

  // API Configuration
  process.env.API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
  process.env.NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

  // Mark as configured (no logging to avoid triggering logger instantiation)
  isEnvironmentConfigured = true;
}

// Initialize environment variables when this module is imported
setupTestEnvironmentVariables();

// Legacy alias for backwards compatibility
export const setupTestEnv = setupTestEnvironmentVariables;
