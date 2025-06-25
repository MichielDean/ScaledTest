import { Client } from '@opensearch-project/opensearch';
import { dbLogger as logger, logError } from '../logging/logger';
import { getRequiredEnvVar, parseBooleanEnvVar } from '../environment/env';

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

// Log configuration (without password)
logger.debug(
  {
    host,
    username,
    sslVerification: rejectUnauthorized,
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

// Function to ensure the CTRF reports index exists
export const ensureCtrfReportsIndexExists = async (): Promise<void> => {
  const indexName = 'ctrf-reports';
  try {
    const indexExists = await opensearchClient.indices.exists({ index: indexName });

    if (!indexExists.body) {
      await opensearchClient.indices.create({
        index: indexName,
        body: {
          mappings: {
            properties: {
              reportId: { type: 'keyword' },
              reportFormat: { type: 'keyword' },
              specVersion: { type: 'keyword' },
              timestamp: { type: 'date' },
              storedAt: { type: 'date' },
              generatedBy: { type: 'keyword' },
              results: {
                properties: {
                  tool: {
                    properties: {
                      name: { type: 'keyword' },
                      version: { type: 'keyword' },
                      extra: { type: 'object' },
                    },
                  },
                  summary: {
                    properties: {
                      tests: { type: 'integer' },
                      passed: { type: 'integer' },
                      failed: { type: 'integer' },
                      skipped: { type: 'integer' },
                      pending: { type: 'integer' },
                      other: { type: 'integer' },
                      start: { type: 'date' },
                      stop: { type: 'date' },
                    },
                  },
                  tests: {
                    type: 'nested',
                    properties: {
                      name: {
                        type: 'text',
                        fields: {
                          keyword: { type: 'keyword' },
                        },
                      },
                      status: { type: 'keyword' },
                      duration: { type: 'integer' },
                      suite: {
                        type: 'keyword',
                        fields: {
                          keyword: { type: 'keyword' },
                        },
                      },
                      message: {
                        type: 'text',
                        fields: {
                          keyword: { type: 'keyword' },
                        },
                      },
                      trace: { type: 'text' },
                      ai: { type: 'text' },
                      line: { type: 'integer' },
                      rawStatus: { type: 'keyword' },
                      filePath: { type: 'keyword' },
                      tags: { type: 'keyword' },
                      flaky: { type: 'boolean' },
                      start: { type: 'date' },
                      stop: { type: 'date' },
                      retries: { type: 'integer' },
                    },
                  },
                  environment: {
                    properties: {
                      appName: { type: 'keyword' },
                      appVersion: { type: 'keyword' },
                      buildName: { type: 'keyword' },
                      buildNumber: { type: 'keyword' },
                      branchName: { type: 'keyword' },
                      testEnvironment: { type: 'keyword' },
                    },
                  },
                },
              },
            },
          },
        },
      });
      logger.info({ index: indexName }, 'Created OpenSearch index for CTRF reports');
    }
  } catch (error) {
    logError(logger, 'Failed to ensure CTRF reports index exists', error);
    throw error; // Re-throw to be handled by the caller
  }
};

export default opensearchClient;
