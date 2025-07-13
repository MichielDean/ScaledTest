// Team Assignment API - Assign and remove users from teams
import { MethodHandler, createApi } from '../../../auth/apiAuth';
import { UserRole } from '../../../auth/keycloak';
import { logError } from '../../../logging/logger';
import {
  assignUserToTeam,
  removeUserFromTeam,
  getUserTeams,
  getAllTeams,
} from '../../../authentication/teamManagement';
import { getAllUsersWithRoles } from '../../../authentication/keycloakAdminApi';
import { AssignTeamRequest, RemoveTeamAssignmentRequest, UserWithTeams } from '../../../types/team';

interface GetUserTeamsResponse {
  success: true;
  data: UserWithTeams[];
}

interface AssignTeamResponse {
  success: true;
  message: string;
}

interface RemoveTeamResponse {
  success: true;
  message: string;
}

interface ErrorResponse {
  success: false;
  error: string;
}

/**
 * Handle GET requests - get all users with their team assignments
 */
const handleGet: MethodHandler<GetUserTeamsResponse | ErrorResponse> = async (
  req,
  res,
  reqLogger
) => {
  try {
    // Get all users with roles
    const usersWithRoles = await getAllUsersWithRoles();

    // Get all teams for reference
    const allTeams = await getAllTeams();

    // For each user, get their team assignments
    const usersWithTeams: UserWithTeams[] = await Promise.all(
      usersWithRoles.map(async user => {
        try {
          const userTeams = await getUserTeams(user.id);
          return {
            id: user.id,
            username: user.username,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            roles: user.roles,
            teams: userTeams,
            isMaintainer: user.isMaintainer,
          };
        } catch (_error) {
          // If we can't get teams for a user, return them with empty teams
          logError(reqLogger, `Failed to get teams for user ${user.id}`, _error);
          return {
            id: user.id,
            username: user.username,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            roles: user.roles,
            teams: [],
            isMaintainer: user.isMaintainer,
          };
        }
      })
    );

    reqLogger.info('Successfully retrieved users with team assignments', {
      userCount: usersWithTeams.length,
      teamCount: allTeams.length,
    });

    return res.status(200).json({
      success: true,
      data: usersWithTeams,
    });
  } catch (_error) {
    logError(reqLogger, 'Error fetching users with teams', _error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch users with team assignments',
    });
  }
};

/**
 * Handle POST requests - assign a user to a team
 */
const handlePost: MethodHandler<AssignTeamResponse | ErrorResponse> = async (
  req,
  res,
  reqLogger
) => {
  try {
    const assignData: AssignTeamRequest = req.body;

    // Validate required fields
    if (!assignData.userId || typeof assignData.userId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'User ID is required and must be a string',
      });
    }

    if (!assignData.teamId || typeof assignData.teamId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Team ID is required and must be a string',
      });
    }

    // Validate UUID format for IDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(assignData.userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID format',
      });
    }

    if (!uuidRegex.test(assignData.teamId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid team ID format',
      });
    }

    const assignedBy = req.user.sub!;
    await assignUserToTeam(assignData.userId, assignData.teamId, assignedBy);

    reqLogger.info('User assigned to team successfully', {
      userId: assignData.userId,
      teamId: assignData.teamId,
      assignedBy,
    });

    return res.status(200).json({
      success: true,
      message: 'User assigned to team successfully',
    });
  } catch (error) {
    logError(reqLogger, 'Error assigning user to team', error, {
      assignData: req.body,
      assignedBy: req.user.sub,
    });

    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: 'User or team not found',
        });
      }

      if (error.message.includes('already assigned')) {
        return res.status(409).json({
          success: false,
          error: 'User is already assigned to this team',
        });
      }
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to assign user to team',
    });
  }
};

/**
 * Handle DELETE requests - remove a user from a team
 */
const handleDelete: MethodHandler<RemoveTeamResponse | ErrorResponse> = async (
  req,
  res,
  reqLogger
) => {
  try {
    const removeData: RemoveTeamAssignmentRequest = req.body;

    // Validate required fields
    if (!removeData.userId || typeof removeData.userId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'User ID is required and must be a string',
      });
    }

    if (!removeData.teamId || typeof removeData.teamId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Team ID is required and must be a string',
      });
    }

    // Validate UUID format for IDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(removeData.userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID format',
      });
    }

    if (!uuidRegex.test(removeData.teamId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid team ID format',
      });
    }

    const removedBy = req.user.sub!;
    await removeUserFromTeam(removeData.userId, removeData.teamId, removedBy);

    reqLogger.info('User removed from team successfully', {
      userId: removeData.userId,
      teamId: removeData.teamId,
      removedBy,
    });

    return res.status(200).json({
      success: true,
      message: 'User removed from team successfully',
    });
  } catch (error) {
    logError(reqLogger, 'Error removing user from team', error, {
      removeData: req.body,
      removedBy: req.user.sub,
    });

    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: 'User or team not found',
        });
      }

      if (error.message.includes('not assigned')) {
        return res.status(404).json({
          success: false,
          error: 'User is not assigned to this team',
        });
      }

      if (error.message.includes('Cannot remove user from the default team')) {
        return res.status(400).json({
          success: false,
          error: 'Cannot remove user from the default team',
        });
      }
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to remove user from team',
    });
  }
};

/**
 * Team Assignment API for managing user-team relationships
 * GET    /api/admin/team-assignments - Get all users with their team assignments (Maintainer+ can view)
 * POST   /api/admin/team-assignments - Assign a user to a team (Maintainer+ can assign)
 * DELETE /api/admin/team-assignments - Remove a user from a team (Maintainer+ can remove)
 */

// Export with role configuration allowing maintainers and owners
export default createApi.custom(
  {
    GET: handleGet,
    POST: handlePost,
    DELETE: handleDelete,
  },
  {
    GET: [UserRole.MAINTAINER, UserRole.OWNER],
    POST: [UserRole.MAINTAINER, UserRole.OWNER],
    DELETE: [UserRole.MAINTAINER, UserRole.OWNER],
  }
);
