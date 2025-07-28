// OpenSearch Analytics API - Flaky Test Runs with Individual Execution Details
import { MethodHandler, createApi } from '../../../auth/apiAuth';
import { logError } from '../../../logging/logger';
import {
  getFlakyTestRunsFromOpenSearch,
  getOpenSearchHealthStatus,
} from '../../../lib/opensearchAnalytics';
import { FlakyTestWithRuns } from '../../../types/dashboard';
import { getUserTeams } from '../../../authentication/teamManagement';

type SuccessResponse = {
  success: true;
  data: FlakyTestWithRuns[];
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
 * Handle GET requests - retrieve flaky test runs with individual execution details
 */
const handleGet: MethodHandler<SuccessResponse | ErrorResponse> = async (req, res, reqLogger) => {
  try {
    const teamIdsParam = req.query.teamIds as string | string[];

    reqLogger.info(
      { teamIdsParam },
      'Fetching flaky test runs with execution details from OpenSearch'
    );

    // Get user's teams for filtering
    if (!req.user?.sub) {
      return res.status(401).json({
        success: false,
        error: 'User identification required',
        source: 'OpenSearch',
      });
    }

    const userTeams = await getUserTeams(req.user.sub);
    const allUserTeamIds = userTeams.map(team => team.id);

    // Determine which team IDs to use - either from query param or all user teams
    let teamIds: string[] = allUserTeamIds;

    if (teamIdsParam) {
      // Parse team IDs from query parameter
      const requestedTeamIds = Array.isArray(teamIdsParam) ? teamIdsParam : [teamIdsParam];

      // Filter to only include teams the user is assigned to
      teamIds = requestedTeamIds.filter(teamId => allUserTeamIds.includes(teamId));

      // If no valid team IDs found, return empty data
      if (teamIds.length === 0) {
        return res.status(200).json({
          success: true,
          data: [],
          meta: {
            source: 'OpenSearch',
            index: 'ctrf-reports',
            timestamp: new Date().toISOString(),
            opensearchHealth: {
              connected: true,
              indexExists: true,
              documentsCount: 0,
              clusterHealth: 'unknown',
            },
          },
        });
      }
    }

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
    const data = await getFlakyTestRunsFromOpenSearch(teamIds);
    const validData = Array.isArray(data) ? data : [];

    reqLogger.info(
      {
        flakyTestsWithRuns: validData.length,
        totalTestRuns: validData.reduce(
          (sum, test) => sum + (Array.isArray(test?.testRuns) ? test.testRuns.length : 0),
          0
        ),
        opensearchDocuments: healthStatus.documentsCount,
      },
      'Successfully retrieved flaky test runs from OpenSearch'
    );

    return res.status(200).json({
      success: true,
      data: validData,
      meta: {
        source: 'OpenSearch',
        index: 'ctrf-reports',
        timestamp: new Date().toISOString(),
        opensearchHealth: healthStatus,
      },
    });
  } catch (error) {
    logError(reqLogger, 'Failed to fetch flaky test runs from OpenSearch', error);

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
 * API handler for Flaky Test Runs with Individual Execution Details from OpenSearch
 * GET /api/analytics/flaky-test-runs
 *
 * This endpoint provides detailed individual test run data for flaky tests
 * from the OpenSearch 'ctrf-reports' index, including execution timestamps,
 * failure messages, and status for each run to enable pattern analysis
 * and investigation of flaky test behavior over time
 */
export default createApi.readOnly(handleGet);
