// OpenSearch Analytics API - Error Analysis Data
import { createApi, MethodHandler } from '../../../auth/apiAuth';
import { logError } from '../../../utils/logger';
import {
  getErrorAnalysisFromOpenSearch,
  getOpenSearchHealthStatus,
} from '../../../lib/opensearchAnalytics';

/**
 * Handle GET requests - retrieve error analysis data from OpenSearch
 *
 * This endpoint analyzes failure patterns and common error messages
 * from failed tests in the OpenSearch 'ctrf-reports' index
 * Uses nested aggregations to group by error messages and affected tests
 * All data is sourced directly from OpenSearch - no local database is used
 */
const handleGet: MethodHandler = async (req, res, reqLogger) => {
  try {
    reqLogger.info('Fetching error analysis from OpenSearch');

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
    const data = await getErrorAnalysisFromOpenSearch();

    reqLogger.info(
      {
        errorTypes: data.length,
        opensearchDocuments: healthStatus.documentsCount,
      },
      'Successfully retrieved error analysis from OpenSearch'
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
    logError(reqLogger, 'Failed to fetch error analysis from OpenSearch', error);

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
 * API handler for Error Analysis data from OpenSearch
 * GET /api/analytics/error-analysis
 *
 * This endpoint analyzes failure patterns and common error messages
 * from failed tests in the OpenSearch 'ctrf-reports' index
 * Uses nested aggregations to group by error messages and affected tests
 * All data is sourced directly from OpenSearch - no local database is used
 */

// Export the super-generic API with read-only access for all authenticated users
export default createApi.readOnly(handleGet);
