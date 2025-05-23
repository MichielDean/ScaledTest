import type { NextApiRequest, NextApiResponse } from 'next';
import { TestExecutionSubmissionSchema } from '../../models/validationSchemas';
import opensearchClient from '../../lib/opensearch';
import { ZodError } from 'zod';
import { withApiAuth } from '../../auth/apiAuth';
import { UserRole } from '../../auth/keycloak';
import { apiLogger, getRequestLogger, logError } from '../../utils/logger';

// Define logger for this file
const logger = apiLogger;

// Define response types
type SuccessResponse = {
  success: true;
  id: string;
  message: string;
};

type ErrorResponse = {
  success: false;
  error: string;
  details?: unknown;
};

// Create OpenSearch index if it doesn't exist
const ensureIndexExists = async () => {
  const indexName = 'test-executions';
  const indexExists = await opensearchClient.indices.exists({ index: indexName });

  if (!indexExists.body) {
    await opensearchClient.indices.create({
      index: indexName,
      body: {
        mappings: {
          properties: {
            id: { type: 'keyword' },
            createdAt: { type: 'date' },
            testSuiteId: { type: 'keyword' },
            status: { type: 'keyword' },
            startedAt: { type: 'date' },
            completedAt: { type: 'date' },
            triggeredBy: { type: 'keyword' },
            buildId: { type: 'keyword' },
            tags: { type: 'keyword' },
          },
        },
      },
    });
    logger.info({ index: indexName }, 'Created OpenSearch index');
  }
};

// Handle incoming requests
async function handler(req: NextApiRequest, res: NextApiResponse<SuccessResponse | ErrorResponse>) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed, only POST is supported',
    });
  }
  // Create a request-specific logger with request ID
  const reqLogger = getRequestLogger(req);

  try {
    // Ensure OpenSearch index exists
    await ensureIndexExists(); // Validate the request body using Zod schema
    const testExecution = TestExecutionSubmissionSchema.parse(req.body);

    // Store test execution in OpenSearch
    await opensearchClient.index({
      index: 'test-executions',
      id: testExecution.id,
      body: testExecution,
      refresh: true, // Make the document immediately available for search
    });

    reqLogger.info({ testExecutionId: testExecution.id }, 'Test execution stored successfully');

    return res.status(201).json({
      success: true,
      id: testExecution.id,
      message: 'Test execution stored successfully',
    });
  } catch (error) {
    logError(reqLogger, 'Error processing test execution', error, {
      method: req.method,
      url: req.url,
      body: process.env.NODE_ENV !== 'production' ? req.body : undefined,
    });

    // Handle Zod validation errors
    if (error instanceof ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }

    // Handle OpenSearch connection errors
    if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
      return res.status(503).json({
        success: false,
        error: 'OpenSearch service unavailable',
      });
    }

    // Handle other errors
    return res.status(500).json({
      success: false,
      error: 'Failed to store test execution',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

// Export the protected API route
// Only users with 'maintainer' or 'owner' roles can access this endpoint
export default withApiAuth(handler, [UserRole.MAINTAINER, UserRole.OWNER]);
