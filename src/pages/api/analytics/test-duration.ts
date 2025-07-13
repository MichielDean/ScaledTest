// OpenSearch Analytics API - Test Duration Analysis Data
import type { NextApiResponse } from 'next';
import { AuthenticatedRequest, createApi } from '../../../auth/apiAuth';
import { getRequestLogger, logError } from '../../../logging/logger';
import {
  getTestDurationAnalysisFromOpenSearch,
  getOpenSearchHealthStatus,
} from '../../../lib/opensearchAnalytics';
import { getUserTeams } from '../../../authentication/teamManagement';

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
 * Handle GET requests for test duration analysis
 */
async function handleGet(
  req: AuthenticatedRequest,
  res: NextApiResponse<SuccessResponse | ErrorResponse>,
  reqLogger: ReturnType<typeof getRequestLogger>
) {
  try {
    reqLogger.info('Fetching test duration analysis from OpenSearch');

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
    const data = await getTestDurationAnalysisFromOpenSearch(teamIds);

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

// Export read-only API - all authenticated users can access analytics
export default createApi.readOnly(handleGet);
