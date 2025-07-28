// Public Teams API - Get available teams for registration
import type { NextApiRequest, NextApiResponse } from 'next';
import { authLogger as logger, logError } from '../../logging/logger';
import { getAllTeams } from '../../authentication/teamManagement';
import { Team } from '../../types/team';

interface GetTeamsResponse {
  success: true;
  teams: Team[];
}

interface ErrorResponse {
  success: false;
  error: string;
}

/**
 * Get available teams for public registration
 * This endpoint doesn't require authentication since it's used during registration
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetTeamsResponse | ErrorResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // Get all teams
    const teams = await getAllTeams();

    // Filter out default team and include only teams that are available for registration
    const availableTeams = teams.filter(team => !team.isDefault);

    logger.info('Successfully retrieved available teams for registration', {
      teamCount: availableTeams.length,
      teams: availableTeams.map(t => ({ id: t.id, name: t.name })),
    });

    return res.status(200).json({
      success: true,
      teams: availableTeams,
    });
  } catch (_error) {
    logError(logger, 'Error fetching teams for registration', _error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch available teams',
    });
  }
}
