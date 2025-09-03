import type { NextApiRequest, NextApiResponse } from 'next';
import { auth } from '@/lib/auth';
import { dbLogger as authLogger } from '@/logging/logger';
import { validateUuid } from '@/lib/validation';
import { addUserToTeam, removeUserFromTeam, getUserTeams } from '@/lib/teamManagement';

interface UserTeamRequest {
  userId: string;
  teams: Array<{
    id: string;
    name: string;
    role: string;
  }>;
}

interface UserTeamResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<UserTeamResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // Get session from Better Auth
    const session = await auth.api.getSession({
      headers: new Headers(req.headers as Record<string, string>),
    });

    if (!session?.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    // Check if user has admin role (maintainer or owner)
    const userWithRole = session.user as { role?: string };
    const userRole = userWithRole.role;

    if (!userRole || !['maintainer', 'owner'].includes(userRole)) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }

    const { userId, teams }: UserTeamRequest = req.body;

    if (!userId || !Array.isArray(teams)) {
      return res.status(400).json({
        success: false,
        error: 'User ID and teams array are required',
      });
    }

    // Validate userId format
    try {
      validateUuid(userId, 'User ID');
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Invalid User ID format',
      });
    }

    // Validate team IDs
    for (const team of teams) {
      if (!team.id || typeof team.id !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Each team must have a valid ID',
        });
      }
      try {
        validateUuid(team.id, 'Team ID');
      } catch (validationError) {
        return res.status(400).json({
          success: false,
          error:
            validationError instanceof Error
              ? validationError.message
              : `Invalid team ID format: ${team.id}`,
        });
      }
    }

    // Update user team assignments using proper database operations
    try {
      // Get current user teams to determine what needs to be added/removed
      const currentTeams = await getUserTeams(userId);
      const currentTeamIds = new Set(currentTeams.map(t => t.id));
      const newTeamIds = new Set(teams.map(t => t.id));

      // Remove user from teams they're no longer assigned to
      const teamsToRemove = currentTeams.filter(team => !newTeamIds.has(team.id));
      for (const team of teamsToRemove) {
        await removeUserFromTeam(userId, team.id, session.user.id);
      }

      // Add user to new teams
      const teamsToAdd = teams.filter(team => !currentTeamIds.has(team.id));
      for (const team of teamsToAdd) {
        await addUserToTeam(userId, team.id, session.user.id);
      }

      authLogger.info(
        {
          userId,
          removedTeams: teamsToRemove.map(t => ({ id: t.id, name: t.name })),
          addedTeams: teamsToAdd.map(t => ({ id: t.id, name: t.name })),
          updatedBy: session.user.id,
        },
        'User teams updated successfully'
      );

      return res.status(200).json({
        success: true,
        message: 'User teams updated successfully',
      });
    } catch (updateError) {
      authLogger.error(
        {
          error: updateError,
          userId,
          teams,
          updatedBy: session.user.id,
        },
        'Failed to update user teams'
      );

      return res.status(500).json({
        success: false,
        error: 'Failed to update user teams',
      });
    }
  } catch (error) {
    authLogger.error(
      {
        error,
        method: req.method,
        url: req.url,
      },
      'Failed to handle user team assignment'
    );

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
}
