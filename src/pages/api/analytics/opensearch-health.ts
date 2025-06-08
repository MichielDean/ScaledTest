// OpenSearch Analytics API - OpenSearch Health Status
import { createApi, MethodHandler } from '../../../auth/apiAuth';
import { logError } from '../../../utils/logger';
import { getOpenSearchHealthStatus } from '../../../lib/opensearchAnalytics';

type SuccessResponse = {
  success: true;
  data: {
    connected: boolean;
    indexExists: boolean;
    documentsCount: number;
    clusterHealth: string;
    index: string;
    timestamp: string;
  };
  meta: {
    source: 'OpenSearch';
    endpoint: 'Health Check';
  };
};

type ErrorResponse = {
  success: false;
  error: string;
  source: 'OpenSearch';
  details?: unknown;
};

/**
 * Handle GET requests - retrieve OpenSearch health status
 */
const handleGet: MethodHandler<SuccessResponse | ErrorResponse> = async (req, res, reqLogger) => {
  try {
    reqLogger.info('Checking OpenSearch health status');

    // Get OpenSearch health status
    const healthStatus = await getOpenSearchHealthStatus();

    reqLogger.info(healthStatus, 'OpenSearch health check completed');

    return res.status(200).json({
      success: true,
      data: {
        ...healthStatus,
        index: 'ctrf-reports',
        timestamp: new Date().toISOString(),
      },
      meta: {
        source: 'OpenSearch',
        endpoint: 'Health Check',
      },
    });
  } catch (error) {
    logError(reqLogger, 'Failed to check OpenSearch health', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to check OpenSearch health',
      source: 'OpenSearch',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};

// Export read-only API - all authenticated users can access health status
export default createApi.readOnly(handleGet);
