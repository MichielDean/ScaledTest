import { testLogger } from '../../src/utils/logger';

/**
 * Helper function to set up environment variables for tests
 * that need OpenSearch configuration
 */
export function setupOpenSearchTestEnv() {
  process.env.OPENSEARCH_HOST = process.env.OPENSEARCH_HOST || 'http://localhost:9200';
  process.env.OPENSEARCH_USERNAME = process.env.OPENSEARCH_USERNAME || 'admin';
  process.env.OPENSEARCH_PASSWORD = process.env.OPENSEARCH_PASSWORD || 'admin';
  process.env.OPENSEARCH_TEST_RESULTS_INDEX =
    process.env.OPENSEARCH_TEST_RESULTS_INDEX || 'test-results-test';
  process.env.OPENSEARCH_SSL_VERIFY = process.env.OPENSEARCH_SSL_VERIFY || 'false';
  testLogger.info(
    {
      host: process.env.OPENSEARCH_HOST,
      username: process.env.OPENSEARCH_USERNAME,
      testResultsIndex: process.env.OPENSEARCH_TEST_RESULTS_INDEX,
      sslVerification: process.env.OPENSEARCH_SSL_VERIFY,
    },
    'Test environment configured with OpenSearch'
  );
}
