import { Client } from '@opensearch-project/opensearch';
import { dbLogger as logger, logError } from '../utils/logger';
import { getRequiredEnvVar, getOptionalEnvVar, parseBooleanEnvVar } from '../utils/env';

// Get OpenSearch configuration from environment variables with validation
const host = getRequiredEnvVar('OPENSEARCH_HOST', 'OpenSearch configuration is incomplete.');
const username = getRequiredEnvVar(
  'OPENSEARCH_USERNAME',
  'OpenSearch configuration is incomplete.'
);
const password = getRequiredEnvVar(
  'OPENSEARCH_PASSWORD',
  'OpenSearch configuration is incomplete.'
);
const rejectUnauthorized = parseBooleanEnvVar('OPENSEARCH_SSL_VERIFY', false);

// Index name for test results - can be overridden with env var
export const TEST_RESULTS_INDEX = getOptionalEnvVar(
  'OPENSEARCH_TEST_RESULTS_INDEX',
  'test-results'
);

// Log configuration (without password)
logger.debug(
  {
    host,
    username,
    sslVerification: rejectUnauthorized,
    testResultsIndex: TEST_RESULTS_INDEX,
  },
  'Configuring OpenSearch client'
);

// Create and configure the OpenSearch client
const opensearchClient = new Client({
  node: host,
  auth: {
    username,
    password,
  },
  ssl: {
    rejectUnauthorized, // Should be true in production with proper certificates
  },
});

// Function to check if the client is connected
export const checkConnection = async (): Promise<boolean> => {
  try {
    const response = await opensearchClient.cluster.health({});
    logger.debug({ clusterHealth: response.body.status }, 'OpenSearch cluster health check');
    return true;
  } catch (error) {
    logError(logger, 'Failed to connect to OpenSearch', error, {
      host: opensearchClient.connectionPool?.connections?.[0]?.url?.host,
    });
    return false;
  }
};

/**
 * Check if the test results index exists and create it if not,
 * with mappings for all the nested objects, tags, and metadata.
 *
 * @returns {Promise<boolean>} Whether the index exists or was created successfully
 */
export const checkAndCreateTestResultsIndex = async (): Promise<boolean> => {
  try {
    // Check if the index exists
    const indexExists = await opensearchClient.indices.exists({
      index: TEST_RESULTS_INDEX,
    });

    if (indexExists.body) {
      logger.debug({ index: TEST_RESULTS_INDEX }, 'Index already exists');
      return true;
    }

    // Create the index with mappings
    const response = await opensearchClient.indices.create({
      index: TEST_RESULTS_INDEX,
      body: {
        settings: {
          number_of_shards: 1,
          number_of_replicas: 1,
        },
        mappings: {
          properties: {
            // Base entity fields
            id: { type: 'keyword' },
            createdAt: { type: 'date' },
            tags: { type: 'keyword' },
            metadata: {
              type: 'object',
              enabled: true,
            },

            // Team fields
            name: { type: 'text', fields: { keyword: { type: 'keyword' } } },
            description: { type: 'text' },

            // Application specific fields
            teamId: { type: 'keyword' },
            version: { type: 'keyword' },
            repositoryUrl: { type: 'keyword' },

            // TestSuite specific fields
            applicationId: { type: 'keyword' },
            sourceLocation: { type: 'keyword' },

            // TestExecution specific fields
            testSuiteId: { type: 'keyword' },
            status: { type: 'keyword' },
            startedAt: { type: 'date' },
            completedAt: { type: 'date' },
            environment: {
              type: 'object',
              enabled: true,
            },
            configuration: {
              type: 'object',
              enabled: true,
            },
            triggeredBy: { type: 'keyword' },
            buildId: { type: 'keyword' },

            // TestCase fields
            testExecutionId: { type: 'keyword' },
            durationMs: { type: 'long' },

            // TestCase.testResults nested mapping
            testCases: {
              type: 'nested',
              properties: {
                id: { type: 'keyword' },
                createdAt: { type: 'date' },
                tags: { type: 'keyword' },
                metadata: {
                  type: 'object',
                  enabled: true,
                },
                testExecutionId: { type: 'keyword' },
                name: { type: 'text', fields: { keyword: { type: 'keyword' } } },
                description: { type: 'text' },
                status: { type: 'keyword' },
                startedAt: { type: 'date' },
                completedAt: { type: 'date' },
                durationMs: { type: 'long' },

                // TestResult nested mapping
                testResults: {
                  type: 'nested',
                  properties: {
                    id: { type: 'keyword' },
                    createdAt: { type: 'date' },
                    tags: { type: 'keyword' },
                    metadata: {
                      type: 'object',
                      enabled: true,
                    },
                    testCaseId: { type: 'keyword' },
                    status: { type: 'keyword' },
                    priority: { type: 'keyword' },
                    name: { type: 'text', fields: { keyword: { type: 'keyword' } } },
                    description: { type: 'text' },
                    expected: { type: 'text' },
                    actual: { type: 'text' },
                    durationMs: { type: 'long' },

                    // TestErrorDetails nested mapping
                    errorDetails: {
                      type: 'object',
                      properties: {
                        message: { type: 'text' },
                        stackTrace: { type: 'text' },
                        screenshotUrl: { type: 'keyword' },
                        logsUrl: { type: 'keyword' },
                        consoleOutput: { type: 'text' },
                        networkRequests: {
                          type: 'nested',
                          enabled: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    logger.debug(
      { index: TEST_RESULTS_INDEX, response: response.body },
      'Created index with mappings'
    );
    return true;
  } catch (error) {
    logError(logger, `Failed to create index`, error, { index: TEST_RESULTS_INDEX });
    return false;
  }
};

// Export the client for use in other files
export default opensearchClient;
