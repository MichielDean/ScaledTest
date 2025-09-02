import type { NextApiRequest, NextApiResponse } from 'next';
import { auth } from '@/lib/auth';
import { dbLogger as authLogger } from '@/logging/logger';
import { logError } from '../../logging/logger';
import {
  addUserToTeam as assignUserToTeam,
  removeUserFromTeam,
  getUserTeams,
  getAllTeams,
} from '../../lib/teamManagement';
import { AssignTeamRequest, RemoveTeamAssignmentRequest, UserWithTeams } from '../../types/team';
import { Pool } from 'pg';
import type { Logger } from 'pino';

// Team response for GET requests
interface TeamResponse {
  success: boolean;
  data?: Array<{
    id: string;
    name: string;
    description?: string;
    memberCount: number;
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
  }>;
  permissions?: {
    canCreateTeam: boolean;
    canDeleteTeam: boolean;
    canAssignUsers: boolean;
    canViewAllTeams: boolean;
    assignableTeams: string[];
  };
  error?: string;
}

// User team assignments response for GET /users
interface GetUserTeamsResponse {
  success: true;
  data: UserWithTeams[];
}

// Assignment response for POST requests
interface AssignTeamResponse {
  success: true;
  message: string;
}

// Error response
interface ErrorResponse {
  success: false;
  error: string;
}

interface BetterAuthUser {
  id: string;
  email: string;
  name?: string;
  role?: string;
}

interface UserWithRole {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  isMaintainer: boolean;
}

/**
 * Get all users with roles from Better Auth database
 */
async function getAllUsersWithRoles(): Promise<UserWithRole[]> {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const result = await pool.query('SELECT id, email, name, role FROM "user" ORDER BY email');
    const users = result.rows;

    // Map database users to our expected format
    return users.map((user: BetterAuthUser) => ({
      id: user.id,
      username: user.name || user.email || 'Unknown',
      email: user.email,
      firstName: user.name?.split(' ')[0] || '',
      lastName: user.name?.split(' ').slice(1).join(' ') || '',
      roles: user.role ? [user.role] : [],
      isMaintainer: user.role === 'maintainer' || user.role === 'owner',
    }));
  } finally {
    await pool.end();
  }
}

/**
 * Unified Teams API
 *
 * GET /api/teams - Get all teams (requires maintainer+ role)
 * GET /api/teams?users=true - Get all users with their team assignments (requires maintainer+ role)
 * POST /api/teams - Assign a user to a team (requires maintainer+ role)
 * DELETE /api/teams - Remove a user from a team (requires maintainer+ role)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TeamResponse | GetUserTeamsResponse | AssignTeamResponse | ErrorResponse>
) {
  const reqLogger = authLogger.child({
    endpoint: '/api/teams',
    method: req.method,
    query: req.query,
  });

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
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions - maintainer or owner role required',
      });
    }

    if (req.method === 'GET') {
      // Check if requesting user assignments
      if (req.query.users === 'true') {
        return handleGetUsersWithTeams(req, res, reqLogger);
      } else {
        return handleGetTeams(req, res, reqLogger);
      }
    } else if (req.method === 'POST') {
      return handleAssignUserToTeam(req, res, reqLogger, session.user.id);
    } else if (req.method === 'DELETE') {
      return handleRemoveUserFromTeam(req, res, reqLogger);
    } else {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
  } catch (error) {
    logError(reqLogger, 'Unexpected error in teams API', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Handle GET /api/teams - Get all teams
 */
async function handleGetTeams(
  req: NextApiRequest,
  res: NextApiResponse<TeamResponse>,
  reqLogger: Logger
) {
  try {
    // Mock teams for now - in a full implementation, this would query a teams table
    const mockTeams = [
      {
        id: 'default-team',
        name: 'Default Team',
        description: 'Default team for all users',
        memberCount: 1,
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    // Mock permissions based on user role - in a full implementation, this would be based on actual role checking
    const permissions = {
      canCreateTeam: true,
      canDeleteTeam: true,
      canAssignUsers: true,
      canViewAllTeams: true,
      assignableTeams: ['default-team'],
    };

    reqLogger.info('Successfully retrieved teams list', { teamCount: mockTeams.length });

    return res.status(200).json({
      success: true,
      data: mockTeams,
      permissions,
    });
  } catch (error) {
    logError(reqLogger, 'Error fetching teams', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch teams',
    });
  }
}

/**
 * Handle GET /api/teams?users=true - Get all users with their team assignments
 */
async function handleGetUsersWithTeams(
  req: NextApiRequest,
  res: NextApiResponse<GetUserTeamsResponse | ErrorResponse>,
  reqLogger: Logger
) {
  try {
    // Get all users with roles
    const usersWithRoles = await getAllUsersWithRoles();

    // Get all teams for reference
    const allTeams = await getAllTeams();

    // For each user, get their team assignments
    const usersWithTeams: UserWithTeams[] = await Promise.all(
      usersWithRoles.map(async (user: UserWithRole) => {
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
}

/**
 * Handle POST /api/teams - Assign a user to a team
 */
async function handleAssignUserToTeam(
  req: NextApiRequest,
  res: NextApiResponse<AssignTeamResponse | ErrorResponse>,
  reqLogger: Logger,
  assignedBy: string
) {
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
      userId: req.body?.userId,
      teamId: req.body?.teamId,
    });
    return res.status(500).json({
      success: false,
      error: 'Failed to assign user to team',
    });
  }
}

/**
 * Handle DELETE /api/teams - Remove a user from a team
 */
async function handleRemoveUserFromTeam(
  req: NextApiRequest,
  res: NextApiResponse<AssignTeamResponse | ErrorResponse>,
  reqLogger: Logger
) {
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

    await removeUserFromTeam(removeData.userId, removeData.teamId);

    reqLogger.info('User removed from team successfully', {
      userId: removeData.userId,
      teamId: removeData.teamId,
    });

    return res.status(200).json({
      success: true,
      message: 'User removed from team successfully',
    });
  } catch (error) {
    logError(reqLogger, 'Error removing user from team', error, {
      userId: req.body?.userId,
      teamId: req.body?.teamId,
    });
    return res.status(500).json({
      success: false,
      error: 'Failed to remove user from team',
    });
  }
}
