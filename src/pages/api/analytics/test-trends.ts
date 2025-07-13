// OpenSearch Analytics API - Test Trends Data
import { MethodHandler, createApi } from '../../../auth/apiAuth';
import { logError } from '../../../logging/logger';
import {
  getTestTrendsFromOpenSearch,
  getOpenSearchHealthStatus,
} from '../../../lib/opensearchAnalytics';
import { getUserTeams } from '../../../authentication/teamManagement';

type SuccessResponse = {
  success: true;
  data: Array<{
    date: string;
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    passRate: number;
  }>;
  meta: {
    source: 'OpenSearch';
    index: 'ctrf-reports';
    daysRequested: number;
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
 * Handle GET requests - retrieve test trends data
 */
const handleGet: MethodHandler<SuccessResponse | ErrorResponse> = async (req, res, reqLogger) => {
  try {
    // Parse query parameters
    const daysParam = req.query.days as string;
    const days = daysParam ? parseInt(daysParam, 10) : 30;

    // Validate days parameter
    if (isNaN(days) || days < 1 || days > 365) {
      return res.status(400).json({
        success: false,
        error: 'Invalid days parameter. Must be between 1 and 365.',
        source: 'OpenSearch',
      });
    }

    reqLogger.info({ days }, 'Fetching test trends data from OpenSearch');

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
    const data = await getTestTrendsFromOpenSearch(days, teamIds);

    reqLogger.info(
      {
        dataPoints: data.length,
        days,
        opensearchDocuments: healthStatus.documentsCount,
      },
      'Successfully retrieved test trends from OpenSearch'
    );

    return res.status(200).json({
      success: true,
      data,
      meta: {
        source: 'OpenSearch',
        index: 'ctrf-reports',
        daysRequested: days,
        timestamp: new Date().toISOString(),
        opensearchHealth: healthStatus,
      },
    });
  } catch (error) {
    logError(reqLogger, 'Failed to fetch test trends from OpenSearch', error);

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
 * API handler for Test Trends analytics data from OpenSearch
 * GET /api/analytics/test-trends?days=30
 *
 * This endpoint provides test result trends over time from the OpenSearch 'ctrf-reports' index
 * Uses CTRF summary.start timestamp to create hourly aggregations based on actual test execution time
 * This allows multiple test results on the same day to be displayed separately on the line graph
 * All data is sourced directly from OpenSearch - no local database is used
 */

// Export the super-generic API with read-only access for all authenticated users
export default createApi.readOnly(handleGet);
