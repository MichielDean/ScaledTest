// OpenSearch Analytics API - Flaky Test Detection Data
import { MethodHandler, createApi } from '../../../auth/apiAuth';
import { logError } from '../../../logging/logger';
import {
  getFlakyTestsFromOpenSearch,
  getOpenSearchHealthStatus,
} from '../../../lib/opensearchAnalytics';
import { getUserTeams } from '../../../authentication/teamManagement';

type SuccessResponse = {
  success: true;
  data: Array<{
    testName: string;
    totalRuns: number;
    passed: number;
    failed: number;
    skipped: number;
    flakyScore: number;
    isMarkedFlaky: boolean;
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
 * Handle GET requests - retrieve flaky test analysis data
 */
const handleGet: MethodHandler<SuccessResponse | ErrorResponse> = async (req, res, reqLogger) => {
  try {
    reqLogger.info('Fetching flaky test analysis from OpenSearch');

    // Get user's teams for filtering
    if (!req.user?.sub) {
      return res.status(401).json({
        success: false,
        error: 'User identification required',
        source: 'OpenSearch',
      });
    }

    const userTeams = await getUserTeams(req.user.sub);
    const teamIds = userTeams.map(team => team.id);

    // Get OpenSearch health status first (for connection check only)
    const healthStatus = await getOpenSearchHealthStatus();

    if (!healthStatus.connected) {
      return res.status(503).json({
        success: false,
        error: 'OpenSearch is not accessible',
        source: 'OpenSearch',
        details: 'Cannot connect to OpenSearch cluster',
      });
    }

    // Fetch data from OpenSearch with team filtering
    const data = await getFlakyTestsFromOpenSearch(teamIds);

    reqLogger.info(
      {
        flakyTests: data.length,
        opensearchDocuments: healthStatus.documentsCount,
      },
      'Successfully retrieved flaky test analysis from OpenSearch'
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
    logError(reqLogger, 'Failed to fetch flaky test analysis from OpenSearch', error);

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
};

/**
 * API handler for Flaky Test Detection data from OpenSearch
 * GET /api/analytics/flaky-tests
 *
 * This endpoint identifies tests with inconsistent results across multiple runs
 * from the OpenSearch 'ctrf-reports' index using nested aggregations
 * Calculates flaky scores based on failure rates and status distribution
 * All data is sourced directly from OpenSearch - no local database is used
 */

// Export the super-generic API with read-only access for all authenticated users
export default createApi.readOnly(handleGet);
