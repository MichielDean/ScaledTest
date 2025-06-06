import { Client } from '@opensearch-project/opensearch';
import { dbLogger as logger, logError } from '../utils/logger';
import { getRequiredEnvVar, parseBooleanEnvVar } from '../utils/env';

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
              'results.tool.name': { type: 'keyword' },
              'results.tool.version': { type: 'keyword' },
              'results.summary.tests': { type: 'integer' },
              'results.summary.passed': { type: 'integer' },
              'results.summary.failed': { type: 'integer' },
              'results.summary.skipped': { type: 'integer' },
              'results.summary.pending': { type: 'integer' },
              'results.summary.other': { type: 'integer' },
              'results.summary.start': { type: 'date' },
              'results.summary.stop': { type: 'date' },
              'results.tests': {
                type: 'nested',
                properties: {
                  name: { type: 'text' },
                  status: { type: 'keyword' },
                  duration: { type: 'integer' },
                  suite: { type: 'keyword' },
                  filePath: { type: 'keyword' },
                  tags: { type: 'keyword' },
                  flaky: { type: 'boolean' },
                },
              },
              'results.environment.appName': { type: 'keyword' },
              'results.environment.appVersion': { type: 'keyword' },
              'results.environment.buildName': { type: 'keyword' },
              'results.environment.buildNumber': { type: 'keyword' },
              'results.environment.branchName': { type: 'keyword' },
              'results.environment.testEnvironment': { type: 'keyword' },
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
