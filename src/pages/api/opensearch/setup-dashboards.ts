import { NextApiRequest, NextApiResponse } from 'next';
import { dbLogger as logger, logError } from '../../../logging/logger';
import { verifyToken } from '../../../auth/apiAuth';
import { UserRole } from '../../../config/keycloak';
import { hasRequiredRole } from '../../../auth/apiAuth';

interface SetupDashboardsResponse {
  success: boolean;
  message?: string;
  error?: string;
  dashboardsUrl?: string;
  indexPattern?: {
    id: string;
    title: string;
    timeFieldName: string;
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SetupDashboardsResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.',
    });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const token = authHeader.split(' ')[1];
    const tokenData = await verifyToken(token);

    // Check if user has required permissions
    if (!hasRequiredRole(tokenData, [UserRole.MAINTAINER, UserRole.OWNER])) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. MAINTAINER or OWNER role required.',
      });
    }

    logger.info('Setting up OpenSearch Dashboards configuration', {
      userId: tokenData.sub,
      userRoles: tokenData.realm_access?.roles || [],
    });

    // For now, we'll provide instructions and URLs since we can't directly configure
    // OpenSearch Dashboards without additional setup
    const dashboardsUrl = process.env.OPENSEARCH_DASHBOARDS_URL || 'http://localhost:5601';

    const setupInstructions = {
      indexPattern: {
        id: 'ctrf-reports-*',
        title: 'ctrf-reports*',
        timeFieldName: 'timestamp',
      },
      steps: [
        'Open OpenSearch Dashboards',
        'Navigate to Management > Index Patterns',
        'Click "Create index pattern"',
        'Enter "ctrf-reports*" as the index pattern',
        'Select "timestamp" as the time field',
        'Click "Create index pattern"',
      ],
    };

    logger.info('OpenSearch Dashboards setup information provided', {
      userId: tokenData.sub,
      dashboardsUrl,
      indexPattern: setupInstructions.indexPattern.title,
    });

    return res.status(200).json({
      success: true,
      message:
        'OpenSearch Dashboards setup information provided. Follow the steps to configure manually.',
      dashboardsUrl,
      indexPattern: setupInstructions.indexPattern,
    });
  } catch (error) {
    logError(logger, 'Failed to setup OpenSearch Dashboards', error, {
      userId: req.headers.authorization ? 'authenticated' : 'anonymous',
    });

    return res.status(500).json({
      success: false,
      error: 'Internal server error while setting up dashboards',
    });
  }
}
