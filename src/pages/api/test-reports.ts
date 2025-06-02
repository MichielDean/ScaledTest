import type { NextApiRequest, NextApiResponse } from 'next';
import { withApiAuth } from '../../auth/apiAuth';
import { UserRole } from '../../auth/keycloak';
import { apiLogger, getRequestLogger, logError } from '../../utils/logger';
import opensearchClient from '../../lib/opensearch';
import { CtrfSchema } from '../../schemas/ctrf/ctrf';
import { z } from 'zod';

// Define logger for this file
const logger = apiLogger;

// Validation schema for CTRF reports
const CtrfReportSchema = z.object({
  reportFormat: z.literal('CTRF'),
  specVersion: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/),
  reportId: z.string().uuid().optional(),
  timestamp: z.string().datetime().optional(),
  generatedBy: z.string().optional(),
  results: z.object({
    tool: z.object({
      name: z.string(),
      version: z.string().optional(),
      extra: z.record(z.unknown()).optional(),
    }),
    summary: z.object({
      tests: z.number().int().min(0),
      passed: z.number().int().min(0),
      failed: z.number().int().min(0),
      skipped: z.number().int().min(0),
      pending: z.number().int().min(0),
      other: z.number().int().min(0),
      suites: z.number().int().min(0).optional(),
      start: z.number().int(),
      stop: z.number().int(),
      extra: z.record(z.unknown()).optional(),
    }),
    tests: z.array(
      z.object({
        name: z.string(),
        status: z.enum(['passed', 'failed', 'skipped', 'pending', 'other']),
        duration: z.number().int().min(0),
        start: z.number().int().optional(),
        stop: z.number().int().optional(),
        suite: z.string().optional(),
        message: z.string().optional(),
        trace: z.string().optional(),
        ai: z.string().optional(),
        line: z.number().int().optional(),
        rawStatus: z.string().optional(),
        tags: z.array(z.string()).optional(),
        type: z.string().optional(),
        filePath: z.string().optional(),
        retries: z.number().int().min(0).optional(),
        flaky: z.boolean().optional(),
        stdout: z.array(z.string()).optional(),
        stderr: z.array(z.string()).optional(),
        threadId: z.string().optional(),
        browser: z.string().optional(),
        device: z.string().optional(),
        screenshot: z.string().optional(),
        attachments: z
          .array(
            z.object({
              name: z.string(),
              contentType: z.string(),
              path: z.string(),
              extra: z.record(z.unknown()).optional(),
            })
          )
          .optional(),
        parameters: z.record(z.unknown()).optional(),
        steps: z
          .array(
            z.object({
              name: z.string(),
              status: z.enum(['passed', 'failed', 'skipped', 'pending', 'other']),
              extra: z.record(z.unknown()).optional(),
            })
          )
          .optional(),
        extra: z.record(z.unknown()).optional(),
      })
    ),
    environment: z
      .object({
        reportName: z.string().optional(),
        appName: z.string().optional(),
        appVersion: z.string().optional(),
        buildName: z.string().optional(),
        buildNumber: z.string().optional(),
        buildUrl: z.string().optional(),
        repositoryName: z.string().optional(),
        repositoryUrl: z.string().optional(),
        commit: z.string().optional(),
        branchName: z.string().optional(),
        osPlatform: z.string().optional(),
        osRelease: z.string().optional(),
        osVersion: z.string().optional(),
        testEnvironment: z.string().optional(),
        extra: z.record(z.unknown()).optional(),
      })
      .optional(),
    extra: z.record(z.unknown()).optional(),
  }),
  extra: z.record(z.unknown()).optional(),
});

// Define response types
type SuccessResponse = {
  success: true;
  id: string;
  message: string;
  summary?: {
    tests: number;
    passed: number;
    failed: number;
    skipped: number;
    pending: number;
    other: number;
  };
};

type ErrorResponse = {
  success: false;
  error: string;
  details?: unknown;
};

type GetResponse = {
  success: true;
  reports: Array<CtrfSchema & { _id: string; storedAt: string }>;
  total: number;
};

// Create OpenSearch index for CTRF reports if it doesn't exist
const ensureIndexExists = async () => {
  const indexName = 'ctrf-reports';
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
};

// Handle incoming requests
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuccessResponse | ErrorResponse | GetResponse>
) {
  const reqLogger = getRequestLogger(req);

  try {
    await ensureIndexExists();

    if (req.method === 'POST') {
      return await handlePost(req, res, reqLogger);
    } else if (req.method === 'GET') {
      return await handleGet(req, res, reqLogger);
    } else {
      return res.status(405).json({
        success: false,
        error: 'Method not allowed. Supported methods: POST, GET',
      });
    }
  } catch (error) {
    logError(reqLogger, 'Unexpected error in CTRF reports handler', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
}

// Handle POST requests - store new CTRF reports
async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse<SuccessResponse | ErrorResponse>,
  reqLogger: ReturnType<typeof getRequestLogger> // Use specific type for reqLogger
) {
  try {
    // Validate the request body using Zod schema
    const ctrfReport = CtrfReportSchema.parse(req.body);

    // Ensure reportId exists
    if (!ctrfReport.reportId) {
      ctrfReport.reportId = crypto.randomUUID();
    }

    // Ensure timestamp exists
    if (!ctrfReport.timestamp) {
      ctrfReport.timestamp = new Date().toISOString();
    }

    // Add storage timestamp
    const reportWithMeta = {
      ...ctrfReport,
      storedAt: new Date().toISOString(),
    };

    // Store CTRF report in OpenSearch
    await opensearchClient.index({
      index: 'ctrf-reports',
      id: ctrfReport.reportId,
      body: reportWithMeta,
      refresh: true,
    });

    reqLogger.info(
      {
        reportId: ctrfReport.reportId,
        tool: ctrfReport.results.tool.name,
        testCount: ctrfReport.results.summary.tests,
      },
      'CTRF report stored successfully'
    );

    return res.status(201).json({
      success: true,
      id: ctrfReport.reportId,
      message: 'CTRF report stored successfully',
      summary: {
        tests: ctrfReport.results.summary.tests,
        passed: ctrfReport.results.summary.passed,
        failed: ctrfReport.results.summary.failed,
        skipped: ctrfReport.results.summary.skipped,
        pending: ctrfReport.results.summary.pending,
        other: ctrfReport.results.summary.other,
      },
    });
  } catch (error) {
    logError(reqLogger, 'Error storing CTRF report', error, {
      method: req.method,
      url: req.url,
      body: process.env.NODE_ENV !== 'production' ? req.body : undefined,
    });

    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'CTRF report validation failed',
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
      error: 'Failed to store CTRF report',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

// Handle GET requests - retrieve CTRF reports
async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse<GetResponse | ErrorResponse>,
  reqLogger: ReturnType<typeof getRequestLogger> // Use specific type for reqLogger
) {
  try {
    const { page = '1', size = '20', status, tool, environment } = req.query;
    const pageNum = parseInt(page as string, 10);
    const pageSize = Math.min(parseInt(size as string, 10), 100); // Limit max page size

    // Build query filters
    const filters: Array<Record<string, unknown>> = []; // OpenSearch query filter objects

    if (status) {
      filters.push({
        nested: {
          path: 'results.tests',
          query: {
            term: { 'results.tests.status': status as string },
          },
        },
      });
    }

    if (tool) {
      filters.push({
        term: { 'results.tool.name': tool as string },
      });
    }

    if (environment) {
      filters.push({
        term: { 'results.environment.testEnvironment': environment as string },
      });
    }

    const query = filters.length > 0 ? { bool: { must: filters } } : { match_all: {} };

    // Search OpenSearch
    const searchResponse = await opensearchClient.search({
      index: 'ctrf-reports',
      body: {
        query: query as Record<string, unknown>, // Use Record<string, unknown> instead of any
        sort: [{ storedAt: { order: 'desc' } }],
        from: (pageNum - 1) * pageSize,
        size: pageSize,
      },
    });

    const reports: Array<CtrfSchema & { _id: string; storedAt: string }> =
      searchResponse.body.hits.hits.map(
        (hit: { _id: string; _source?: Record<string, unknown> }) => {
          // Define type for hit and _source
          if (!hit._source || typeof hit._source !== 'object') {
            reqLogger.error(
              { hitId: hit._id, hitSource: hit._source },
              'Search hit found without valid _source object'
            );
            return {
              _id: hit._id || 'unknown_id',
              reportFormat: 'CTRF',
              specVersion: '0.0.0',
              results: {
                tool: { name: 'unknown' },
                summary: {
                  tests: 0,
                  passed: 0,
                  failed: 0,
                  skipped: 0,
                  pending: 0,
                  other: 0,
                  start: Date.now(),
                  stop: Date.now(),
                },
                tests: [],
              },
              storedAt: new Date().toISOString(),
            } as CtrfSchema & { _id: string; storedAt: string };
          }
          return {
            _id: hit._id,
            ...(hit._source as CtrfSchema & { storedAt: string }), // Cast _source after validation
          };
        }
      );

    const total =
      typeof searchResponse.body.hits.total === 'number'
        ? searchResponse.body.hits.total
        : searchResponse.body.hits.total?.value || 0;

    reqLogger.info(
      {
        page: pageNum,
        size: pageSize,
        total,
        filters: { status, tool, environment },
      },
      'Retrieved CTRF reports'
    );

    return res.status(200).json({
      success: true,
      reports,
      total,
    });
  } catch (error) {
    logError(reqLogger, 'Error retrieving CTRF reports', error, {
      method: req.method,
      url: req.url,
      query: req.query,
    });

    // Handle OpenSearch connection errors
    if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
      return res.status(503).json({
        success: false,
        error: 'OpenSearch service unavailable',
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve CTRF reports',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

// Export the protected API route
// Only users with 'maintainer' or 'owner' roles can access this endpoint
export default withApiAuth(handler, [UserRole.MAINTAINER, UserRole.OWNER]);
