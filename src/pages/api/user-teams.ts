// User Teams API - Get current user's team assignments
import { BetterAuthMethodHandler, createBetterAuthApi } from '../../auth/betterAuthApi';
import { logError } from '../../logging/logger';
import { getUserTeams } from '../../lib/teamManagement';

import { Team } from '../../types/team';

interface GetUserTeamsResponse {
  success: true;
  teams: Team[];
}

interface ErrorResponse {
  success: false;
  error: string;
}

/**
 * Handle GET requests - get current user's team assignments
 */
const handleGet: BetterAuthMethodHandler<GetUserTeamsResponse | ErrorResponse> = async (
  req,
  res,
  reqLogger
) => {
  try {
    const userId = req.user.id;

    // Get teams for the current user
    const userTeams = await getUserTeams(userId);

    reqLogger.info('Successfully retrieved user teams', {
      userId,
      teamCount: userTeams.length,
      teamIds: userTeams.map(t => t.id),
    });

    return res.status(200).json({
      success: true,
      teams: userTeams,
    });
  } catch (error) {
    logError(reqLogger, 'Error fetching user teams', error, {
      userId: req.user.id,
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to fetch user teams',
    });
  }
};

/**
 * User Teams API for getting current user's team assignments
 * GET /api/user-teams - Get current user's teams (authenticated users only)
 */
export default createBetterAuthApi({ GET: handleGet }, 'readonly');
