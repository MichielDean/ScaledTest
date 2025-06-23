// OpenSearch Analytics API - Flaky Test Runs with Individual Execution Details
import { MethodHandler, createApi } from '../../../auth/apiAuth';
import { logError } from '../../../logging/logger';
import {
  getFlakyTestRunsFromOpenSearch,
  getOpenSearchHealthStatus,
} from '../../../lib/opensearchAnalytics';
import { FlakyTestWithRuns } from '../../../types/dashboard';

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
    reqLogger.info('Fetching flaky test runs with execution details from OpenSearch');

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

    // Fetch data from OpenSearch (index will be auto-created if needed)
    const data = await getFlakyTestRunsFromOpenSearch();

    reqLogger.info(
      {
        flakyTestsWithRuns: data.length,
        totalTestRuns: data.reduce((sum, test) => sum + test.testRuns.length, 0),
        opensearchDocuments: healthStatus.documentsCount,
      },
      'Successfully retrieved flaky test runs from OpenSearch'
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
