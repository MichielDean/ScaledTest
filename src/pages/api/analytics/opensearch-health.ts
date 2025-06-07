// OpenSearch Analytics API - OpenSearch Health Status
import type { NextApiRequest, NextApiResponse } from 'next';
import { withApiAuth } from '../../../auth/apiAuth';
import { UserRole } from '../../../auth/keycloak';
import { getRequestLogger, logError } from '../../../utils/logger';
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
 * API handler for OpenSearch Health Status
 * GET /api/analytics/opensearch-health
 *
 * This endpoint provides health information about the OpenSearch cluster
 * and the ctrf-reports index used by all analytics endpoints
 * Used by the dashboard to show data source status
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
}

// Export the protected API route - all authenticated users can access health status for read-only purposes
export default withApiAuth(handler, [UserRole.READONLY, UserRole.MAINTAINER, UserRole.OWNER]);
