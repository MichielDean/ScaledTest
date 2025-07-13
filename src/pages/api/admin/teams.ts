// Team Management API
import { MethodHandler, createApi } from '../../../auth/apiAuth';
import { UserRole } from '../../../auth/keycloak';
import { logError } from '../../../logging/logger';
import {
  getAllTeamsWithMemberCount,
  createTeam,
  updateTeam,
  deleteTeam,
  getTeamPermissions,
} from '../../../authentication/teamManagement';
import {
  CreateTeamRequest,
  UpdateTeamRequest,
  TeamWithMemberCount,
  TeamPermissions,
} from '../../../types/team';

interface GetTeamsResponse {
  success: true;
  data: TeamWithMemberCount[];
  permissions: TeamPermissions;
}

interface CreateTeamResponse {
  success: true;
  data: TeamWithMemberCount;
  message: string;
}

interface UpdateTeamResponse {
  success: true;
  data: TeamWithMemberCount;
  message: string;
}

interface DeleteTeamResponse {
  success: true;
  message: string;
}

interface ErrorResponse {
  success: false;
  error: string;
}

/**
 * Handle GET requests - retrieve all teams with member counts
 */
const handleGet: MethodHandler<GetTeamsResponse | ErrorResponse> = async (req, res, reqLogger) => {
  try {
    const userRoles = req.user.resource_access?.[req.user.aud as string]?.roles || [];

    // Get teams with member counts
    const teams = await getAllTeamsWithMemberCount();

    // Get user permissions for team management
    const permissions = getTeamPermissions(userRoles);

    reqLogger.info('Successfully retrieved teams', {
      teamCount: teams.length,
      userRoles,
    });

    return res.status(200).json({
      success: true,
      data: teams,
      permissions,
    });
  } catch (_error) {
    logError(reqLogger, 'Error fetching teams', _error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch teams',
    });
  }
};

/**
 * Handle POST requests - create a new team
 */
const handlePost: MethodHandler<CreateTeamResponse | ErrorResponse> = async (
  req,
  res,
  reqLogger
) => {
  try {
    const createData: CreateTeamRequest = req.body;

    // Validate required fields
    if (
      !createData.name ||
      typeof createData.name !== 'string' ||
      createData.name.trim().length === 0
    ) {
      return res.status(400).json({
        success: false,
        error: 'Team name is required and must be a non-empty string',
      });
    }

    // Validate team name format
    if (!/^[a-zA-Z0-9\s\-_]+$/.test(createData.name)) {
      return res.status(400).json({
        success: false,
        error: 'Team name can only contain letters, numbers, spaces, hyphens, and underscores',
      });
    }

    if (createData.name.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'Team name must be 50 characters or less',
      });
    }

    if (createData.description && createData.description.length > 255) {
      return res.status(400).json({
        success: false,
        error: 'Team description must be 255 characters or less',
      });
    }

    const userId = req.user.sub!;
    const team = await createTeam(createData, userId);

    // Convert to TeamWithMemberCount (new team has 0 members)
    const teamWithCount: TeamWithMemberCount = {
      ...team,
      memberCount: 0,
    };

    reqLogger.info('Team created successfully', {
      teamId: team.id,
      teamName: team.name,
      createdBy: userId,
    });

    return res.status(201).json({
      success: true,
      data: teamWithCount,
      message: `Team "${team.name}" created successfully`,
    });
  } catch (error) {
    logError(reqLogger, 'Error creating team', error, {
      teamData: req.body,
      userId: req.user.sub,
    });

    if (error instanceof Error && error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        error: 'A team with this name already exists',
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to create team',
    });
  }
};

/**
 * Handle PUT requests - update a team
 */
const handlePut: MethodHandler<UpdateTeamResponse | ErrorResponse> = async (
  req,
  res,
  reqLogger
) => {
  try {
    const { teamId } = req.query;
    const updateData: UpdateTeamRequest = req.body;

    if (!teamId || typeof teamId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Team ID is required',
      });
    }

    // Validate update data
    if (updateData.name !== undefined) {
      if (typeof updateData.name !== 'string' || updateData.name.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Team name must be a non-empty string',
        });
      }

      if (!/^[a-zA-Z0-9\s\-_]+$/.test(updateData.name)) {
        return res.status(400).json({
          success: false,
          error: 'Team name can only contain letters, numbers, spaces, hyphens, and underscores',
        });
      }

      if (updateData.name.length > 50) {
        return res.status(400).json({
          success: false,
          error: 'Team name must be 50 characters or less',
        });
      }
    }

    if (updateData.description !== undefined && updateData.description.length > 255) {
      return res.status(400).json({
        success: false,
        error: 'Team description must be 255 characters or less',
      });
    }

    const userId = req.user.sub!;
    const updatedTeam = await updateTeam(teamId, updateData, userId);

    // Get updated team with member count
    const teams = await getAllTeamsWithMemberCount();
    const teamWithCount = teams.find(t => t.id === updatedTeam.id);

    if (!teamWithCount) {
      throw new Error('Failed to retrieve updated team with member count');
    }

    reqLogger.info('Team updated successfully', {
      teamId,
      updateData,
      updatedBy: userId,
    });

    return res.status(200).json({
      success: true,
      data: teamWithCount,
      message: `Team "${updatedTeam.name}" updated successfully`,
    });
  } catch (error) {
    logError(reqLogger, 'Error updating team', error, {
      teamId: req.query.teamId,
      updateData: req.body,
      userId: req.user.sub,
    });

    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'Team not found',
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to update team',
    });
  }
};

/**
 * Handle DELETE requests - delete a team
 */
const handleDelete: MethodHandler<DeleteTeamResponse | ErrorResponse> = async (
  req,
  res,
  reqLogger
) => {
  try {
    const { teamId } = req.query;

    if (!teamId || typeof teamId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Team ID is required',
      });
    }

    const userId = req.user.sub!;
    await deleteTeam(teamId, userId);

    reqLogger.info('Team deleted successfully', {
      teamId,
      deletedBy: userId,
    });

    return res.status(200).json({
      success: true,
      message: 'Team deleted successfully',
    });
  } catch (error) {
    logError(reqLogger, 'Error deleting team', error, {
      teamId: req.query.teamId,
      userId: req.user.sub,
    });

    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: 'Team not found',
        });
      }

      if (error.message.includes('Cannot delete the default team')) {
        return res.status(400).json({
          success: false,
          error: 'Cannot delete the default team',
        });
      }
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to delete team',
    });
  }
};

/**
 * Teams API for team management
 * GET    /api/admin/teams - Get all teams with member counts (Owner only to view all, Maintainer+ to view their assigned teams)
 * POST   /api/admin/teams - Create a new team (Owner only)
 * PUT    /api/admin/teams?teamId=:id - Update a team (Owner only)
 * DELETE /api/admin/teams?teamId=:id - Delete a team (Owner only)
 */

// Export with custom role configuration
export default createApi.custom(
  {
    GET: handleGet,
    POST: handlePost,
    PUT: handlePut,
    DELETE: handleDelete,
  },
  {
    GET: [UserRole.MAINTAINER, UserRole.OWNER], // Maintainers can view teams they're assigned to
    POST: [UserRole.OWNER], // Only owners can create teams
    PUT: [UserRole.OWNER], // Only owners can update teams
    DELETE: [UserRole.OWNER], // Only owners can delete teams
  }
);
