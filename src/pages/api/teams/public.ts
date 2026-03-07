/**
 * Public teams listing endpoint — no authentication required.
 *
 * Returns a stripped-down view of available teams for unauthenticated
 * contexts such as the registration page (team selection is optional and
 * visible before a user has signed in).
 *
 * GET /api/teams/public
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { getAllTeams } from '../../../lib/teamManagement';
import { apiLogger } from '../../../logging/logger';

interface PublicTeam {
  id: string;
  name: string;
  description?: string;
  isDefault: boolean;
}

interface SuccessResponse {
  success: true;
  teams: PublicTeam[];
}

interface ErrorResponse {
  success: false;
  error: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuccessResponse | ErrorResponse>
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const teams = await getAllTeams();

    // Return only the fields safe for public consumption.
    // Member counts and timestamps are internal details.
    const publicTeams: PublicTeam[] = teams.map(team => ({
      id: team.id,
      name: team.name,
      // Coerce null (possible from DB) to undefined to match the PublicTeam type.
      description: team.description ?? undefined,
      isDefault: team.isDefault,
    }));

    apiLogger.debug({ teamCount: publicTeams.length }, 'Public teams list served');

    return res.status(200).json({ success: true, teams: publicTeams });
  } catch (error) {
    apiLogger.error({ error }, 'Failed to fetch public teams list');
    return res.status(500).json({ success: false, error: 'Failed to fetch teams' });
  }
}
