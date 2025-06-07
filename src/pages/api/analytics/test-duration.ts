// OpenSearch Analytics API - Test Duration Analysis Data
import type { NextApiRequest, NextApiResponse } from 'next';
import { withApiAuth } from '../../../auth/apiAuth';
import { UserRole } from '../../../auth/keycloak';
import { getRequestLogger, logError } from '../../../utils/logger';
import {
  getTestDurationAnalysisFromOpenSearch,
  getOpenSearchHealthStatus,
} from '../../../lib/opensearchAnalytics';

type SuccessResponse = {
  success: true;
  data: Array<{
    range: string;
    count: number;
    avgDuration: number;
    maxDuration: number;
    minDuration: number;
  }>;
  meta: {
    source: 'OpenSearch';
    index: 'ctrf-reports';
    timestamp: string;
    opensearchHealth: {
      connected: boolean;
      indexExists: boolean;
      documentsCount: number;
      clusterHealth: string;
    };
  };
};

type ErrorResponse = {
  success: false;
  error: string;
  source: 'OpenSearch';
  details?: unknown;
};

/**
 * API handler for Test Duration Analysis data from OpenSearch
 * GET /api/analytics/test-duration
 *
 * This endpoint analyzes test execution times and performance patterns
 * from the OpenSearch 'ctrf-reports' index using nested aggregations on test duration
 * All data is sourced directly from OpenSearch - no local database is used
 */
async function handler(req: NextApiRequest, res: NextApiResponse<SuccessResponse | ErrorResponse>) {
  const reqLogger = getRequestLogger(req);

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Only GET is supported.',
      source: 'OpenSearch',
    });
  }

  try {
    reqLogger.info('Fetching test duration analysis from OpenSearch');

    // Get OpenSearch health status first
    const healthStatus = await getOpenSearchHealthStatus();

    if (!healthStatus.connected) {
      return res.status(503).json({
        success: false,
        error: 'OpenSearch is not accessible',
        source: 'OpenSearch',
        details: 'Cannot connect to OpenSearch cluster',
      });
    }

    if (!healthStatus.indexExists) {
      return res.status(404).json({
        success: false,
        error: 'OpenSearch index does not exist',
        source: 'OpenSearch',
        details: 'The ctrf-reports index has not been created yet',
      });
    }

    // Fetch data from OpenSearch
    const data = await getTestDurationAnalysisFromOpenSearch();

    reqLogger.info(
      {
        durationBuckets: data.length,
        opensearchDocuments: healthStatus.documentsCount,
      },
      'Successfully retrieved test duration analysis from OpenSearch'
    );

    return res.status(200).json({
      success: true,
      data,
      meta: {
        source: 'OpenSearch',
        index: 'ctrf-reports',
        timestamp: new Date().toISOString(),
        opensearchHealth: healthStatus,
      },
    });
  } catch (error) {
    logError(reqLogger, 'Failed to fetch test duration analysis from OpenSearch', error);

    // Handle specific OpenSearch errors
    if (error instanceof Error) {
      if (error.message.includes('OpenSearch query failed')) {
        return res.status(500).json({
          success: false,
          error: 'OpenSearch query execution failed',
          source: 'OpenSearch',
          details: error.message,
        });
      }

      if (error.message.includes('ECONNREFUSED')) {
        return res.status(503).json({
          success: false,
          error: 'OpenSearch service is unavailable',
          source: 'OpenSearch',
          details: 'Cannot connect to OpenSearch cluster',
        });
      }
    }

    return res.status(500).json({
      success: false,
      error: 'Internal server error while querying OpenSearch',
      source: 'OpenSearch',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

// Export the protected API route - all authenticated users can access analytics for read-only purposes
export default withApiAuth(handler, [UserRole.READONLY, UserRole.MAINTAINER, UserRole.OWNER]);
