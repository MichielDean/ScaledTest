// OpenSearch Analytics API - Test Suite Overview Data
import { MethodHandler, createApi } from '../../../auth/apiAuth';
import { logError } from '../../../logging/logger';
import {
  getTestSuiteOverviewFromOpenSearch,
  getOpenSearchHealthStatus,
} from '../../../lib/opensearchAnalytics';
import { getUserTeams } from '../../../authentication/teamManagement';

type SuccessResponse = {
  success: true;
  data: Array<{
    name: string;
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    avgDuration: number;
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
 * Handle GET requests - retrieve test suite overview data
 */
const handleGet: MethodHandler<SuccessResponse | ErrorResponse> = async (req, res, reqLogger) => {
  try {
    reqLogger.info('Fetching test suite overview data from OpenSearch');

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
    const data = await getTestSuiteOverviewFromOpenSearch(teamIds);

    reqLogger.info(
      {
        suitesReturned: data.length,
        opensearchDocuments: healthStatus.documentsCount,
      },
      'Successfully retrieved test suite overview from OpenSearch'
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
    logError(reqLogger, 'Failed to fetch test suite overview from OpenSearch', error);

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

// Export the super-generic API with read-only access for all authenticated users
export default createApi.readOnly(handleGet);
