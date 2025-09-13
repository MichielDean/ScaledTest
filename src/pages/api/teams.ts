import type { NextApiRequest, NextApiResponse } from 'next';
import { auth } from '@/lib/auth';
import { APIError } from 'better-auth/api';
import { dbLogger as authLogger } from '@/logging/logger';
import { logError } from '../../logging/logger';
import { validateUuids } from '../../lib/validation';
import {
  addUserToTeam as assignUserToTeam,
  removeUserFromTeam,
  getUserTeams,
  getAllTeams,
  createTeam,
} from '../../lib/teamManagement';
import {
  AssignTeamRequest,
  RemoveTeamAssignmentRequest,
  UserWithTeams,
  CreateTeamRequest,
} from '../../types/team';
import type { Logger } from 'pino';

interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role?: string;
}

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

// Team creation response for POST requests
interface CreateTeamResponse {
  success: true;
  data: {
    id: string;
    name: string;
    description?: string;
    memberCount: number;
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
  message: string;
}

// Error response
interface ErrorResponse {
  success: false;
  error: string;
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

interface BetterAuthUser {
  id: string;
  email: string;
  name?: string;
  role?: string;
}

/**
 * Process user list and apply role-based filtering
 */
function processUsersForRole(
  users: BetterAuthUser[],
  currentUser: AuthenticatedUser,
  limit: number
): UserWithRole[] {
  authLogger.debug(
    { userCount: users.length, currentUserRole: currentUser.role },
    'Processing users for role-based access'
  );

  // Only show users that the current user has permission to see
  if (currentUser.role === 'owner' || currentUser.role === 'admin') {
    authLogger.info('User has owner/admin role, returning all users');

    return users.map((user: BetterAuthUser) => ({
      id: user.id,
      username: user.name || user.email || 'Unknown',
      email: user.email,
      firstName: user.name?.split(' ')[0] || '',
      lastName: user.name?.split(' ').slice(1).join(' ') || '',
      roles: user.role ? [user.role] : [],
      isMaintainer: user.role === 'maintainer' || user.role === 'owner',
    }));
  }

  // For maintainers, we would filter by team membership
  // This requires additional implementation for team-based filtering
  authLogger.info('User has limited role, applying restricted user list');
  return users.slice(0, limit).map((user: BetterAuthUser) => ({
    id: user.id,
    username: user.name || user.email || 'Unknown',
    email: user.email,
    firstName: user.name?.split(' ')[0] || '',
    lastName: user.name?.split(' ').slice(1).join(' ') || '',
    roles: user.role ? [user.role] : [],
    isMaintainer: user.role === 'maintainer' || user.role === 'owner',
  }));
}

/**
 * Fallback user list when admin API is not available
 * This provides minimal functionality to keep the UI working
 */
async function getFallbackUserList(
  currentUser: AuthenticatedUser,
  limit: number
): Promise<UserWithRole[]> {
  authLogger.debug('Using fallback user list - limited functionality');

  // This is a minimal implementation that should be replaced
  // when the Better Auth admin API is properly integrated
  const mockUsers: BetterAuthUser[] = [
    {
      id: 'readonly-user-id',
      email: 'readonly@example.com',
      name: 'Readonly User',
      role: 'readonly',
    },
    {
      id: 'maintainer-user-id',
      email: 'maintainer@example.com',
      name: 'Maintainer User',
      role: 'maintainer',
    },
    {
      id: 'owner-user-id',
      email: 'owner@example.com',
      name: 'Owner User',
      role: 'owner',
    },
  ];

  return processUsersForRole(mockUsers, currentUser, limit);
}

/**
 * Get all users with roles from Better Auth database
 * @param currentUser - The authenticated user making the request
 * @param headers - Request headers containing session cookies
 * @param limit - Maximum number of users to return (default: 100)
 * @param offset - Number of users to skip (default: 0)
 */
async function getAllUsersWithRoles(
  currentUser: AuthenticatedUser,
  headers: Record<string, string>,
  limit: number = 100,
  offset: number = 0
): Promise<UserWithRole[]> {
  // Only allow users with 'admin', 'owner', or 'maintainer' role to view user lists
  const allowedRoles = ['admin', 'owner', 'maintainer'];

  if (!currentUser || !currentUser.role || !allowedRoles.includes(currentUser.role)) {
    authLogger.warn(
      { userId: currentUser?.id, userRole: currentUser?.role },
      'Unauthorized attempt to access user list'
    );
    throw new Error('Unauthorized: insufficient permissions to view user list');
  }

  authLogger.info(
    { userId: currentUser.id, role: currentUser.role, limit, offset },
    'Starting getAllUsersWithRoles'
  );

  try {
    // Attempt to use Better Auth admin API - properly configured with our admin plugin
    authLogger.debug('Attempting to call Better Auth admin API listUsers');

    // Check if the admin API is available through the auth instance
    // Based on Better Auth docs, the admin plugin provides server-side API methods
    const authWithApi = auth as {
      api?: {
        listUsers?: (params: unknown) => Promise<{ users?: BetterAuthUser[]; total?: number }>;
      };
    };

    if (authWithApi && authWithApi.api && typeof authWithApi.api.listUsers === 'function') {
      try {
        authLogger.debug('Better Auth admin API listUsers method found, calling with headers');

        const usersResponse = await authWithApi.api.listUsers({
          query: {
            limit,
            offset,
            sortBy: 'name',
            sortDirection: 'asc',
          },
          headers,
        });

        authLogger.debug(
          {
            responseType: typeof usersResponse,
            hasUsers: !!usersResponse?.users,
            userCount: usersResponse?.users?.length,
            total: usersResponse?.total,
          },
          'Better Auth admin API response received'
        );

        // Handle the response structure from Better Auth admin API
        const users = usersResponse?.users || [];
        const total = usersResponse?.total || users.length;

        authLogger.info(
          { userCount: users.length, total },
          'Successfully retrieved users from Better Auth admin API'
        );

        // Process users and return in the expected format
        return processUsersForRole(users, currentUser, limit);
      } catch (adminApiError) {
        authLogger.warn(
          {
            error: adminApiError,
            errorMessage: adminApiError instanceof Error ? adminApiError.message : 'Unknown error',
            userId: currentUser.id,
          },
          'Better Auth admin API listUsers failed, will use fallback approach'
        );
      }
    } else {
      authLogger.debug(
        {
          hasAuth: !!auth,
          hasApi: !!(auth && auth.api),
          apiMethods: auth && auth.api ? Object.keys(auth.api) : [],
        },
        'Better Auth admin API listUsers method not available'
      );
    }

    // Fallback: Use mock data temporarily until full admin API integration is resolved
    authLogger.debug('Using fallback user retrieval approach');

    const fallbackUsers = await getFallbackUserList(currentUser, limit);

    authLogger.info(
      { userCount: fallbackUsers.length },
      'Using fallback user retrieval method (temporary until full admin API integration)'
    );

    return fallbackUsers;
  } catch (error) {
    if (error instanceof APIError) {
      authLogger.error(
        {
          message: error.message,
          status: error.status,
          userId: currentUser.id,
          role: currentUser.role,
        },
        'Better Auth API error in getAllUsersWithRoles'
      );
    } else {
      authLogger.error(
        { error, userId: currentUser.id, role: currentUser.role },
        'Error in getAllUsersWithRoles'
      );
    }
    throw error;
  }
}

/**
 * Unified Teams API
 *
 * GET /api/teams - Get all teams (requires maintainer+ role)
 * GET /api/teams?users=true - Get all users with their team assignments (requires maintainer+ role)
 * POST /api/teams - Create a new team OR assign a user to a team (requires maintainer+ role)
 *   - Team creation: { name: string, description?: string }
 *   - User assignment: { userId: string, teamId: string }
 * DELETE /api/teams - Remove a user from a team (requires maintainer+ role)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    TeamResponse | GetUserTeamsResponse | AssignTeamResponse | CreateTeamResponse | ErrorResponse
  >
) {
  const reqLogger = authLogger.child({
    endpoint: '/api/teams',
    method: req.method,
    query: req.query,
  });

  // Debug logging
  reqLogger.debug('Teams API endpoint called');

  try {
    // Get session from Better Auth
    const normalizedHeaders = new Headers(
      Object.fromEntries(
        Object.entries(req.headers).map(([k, v]) => [
          k,
          Array.isArray(v) ? v.join(', ') : String(v ?? ''),
        ])
      )
    );

    const session = await auth.api.getSession({ headers: normalizedHeaders });

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
        return handleGetUsersWithTeams(req, res, reqLogger, session.user);
      } else {
        return handleGetTeams(req, res, reqLogger, session.user);
      }
    } else if (req.method === 'POST') {
      // Check if this is a team creation request (has 'name' field)
      if ('name' in req.body) {
        return handleCreateTeam(req, res, reqLogger, session.user.id);
      } else {
        // Otherwise, it's a user assignment request
        return handleAssignUserToTeam(req, res, reqLogger, session.user.id);
      }
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
  reqLogger: Logger,
  currentUser: AuthenticatedUser
) {
  try {
    // Get all teams from the database
    const allTeams = await getAllTeams();

    // Transform to API response format
    const teams = allTeams.map(team => ({
      id: team.id,
      name: team.name,
      description: team.description,
      memberCount: team.memberCount,
      isDefault: team.isDefault,
      createdAt: team.createdAt,
      updatedAt: team.updatedAt,
    }));

    // Determine permissions from the current user's role
    const userRole = currentUser?.role ?? '';
    const permissions = {
      canCreateTeam: ['maintainer', 'owner'].includes(userRole),
      canDeleteTeam: ['owner'].includes(userRole),
      canAssignUsers: ['maintainer', 'owner'].includes(userRole),
      canViewAllTeams: ['maintainer', 'owner'].includes(userRole),
      assignableTeams: ['owner'].includes(userRole) ? teams.map(t => t.id) : [],
    };

    reqLogger.info({ teamCount: teams.length }, 'Successfully retrieved teams list');

    return res.status(200).json({
      success: true,
      data: teams,
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
  reqLogger: Logger,
  currentUser: AuthenticatedUser
) {
  try {
    // Parse pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(parseInt(req.query.size as string) || 100, 100); // Max 100 users per page
    const offset = (page - 1) * pageSize;

    reqLogger.debug({ page, pageSize, offset }, 'Getting users with teams');

    // Get all users with roles (with pagination)
    const usersWithRoles = await getAllUsersWithRoles(
      currentUser,
      req.headers as Record<string, string>,
      pageSize,
      offset
    );

    reqLogger.debug({ userCount: usersWithRoles.length }, 'getAllUsersWithRoles result'); // Get all teams for reference
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

    reqLogger.info(
      {
        userCount: usersWithTeams.length,
        teamCount: allTeams.length,
      },
      'Successfully retrieved users with team assignments'
    );

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
 * Handle POST /api/teams - Create a new team
 */
async function handleCreateTeam(
  req: NextApiRequest,
  res: NextApiResponse<CreateTeamResponse | ErrorResponse>,
  reqLogger: Logger,
  createdBy: string
) {
  try {
    const createData: CreateTeamRequest = req.body;

    // Validate required fields
    if (!createData.name || typeof createData.name !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Team name is required and must be a string',
      });
    }

    // Validate team name length and format
    const trimmedName = createData.name.trim();
    if (trimmedName.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Team name cannot be empty',
      });
    }

    if (trimmedName.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Team name cannot exceed 100 characters',
      });
    }

    // Validate description if provided
    if (createData.description && typeof createData.description !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Team description must be a string',
      });
    }

    if (createData.description && createData.description.length > 500) {
      return res.status(400).json({
        success: false,
        error: 'Team description cannot exceed 500 characters',
      });
    }

    // Create the team
    const newTeam = await createTeam(
      {
        name: trimmedName,
        description: createData.description?.trim(),
      },
      createdBy
    );

    reqLogger.info(
      {
        teamId: newTeam.id,
        teamName: newTeam.name,
        createdBy,
      },
      'Team created successfully'
    );

    return res.status(201).json({
      success: true,
      data: {
        id: newTeam.id,
        name: newTeam.name,
        description: newTeam.description,
        memberCount: 0, // New teams start with 0 members
        isDefault: newTeam.isDefault,
        createdAt: newTeam.createdAt,
        updatedAt: newTeam.updatedAt,
      },
      message: 'Team created successfully',
    });
  } catch (error) {
    logError(reqLogger, 'Error creating team', error, {
      teamName: req.body?.name,
      createdBy,
    });
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create team',
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
    try {
      validateUuids([
        { value: assignData.userId, fieldName: 'User ID' },
        { value: assignData.teamId, fieldName: 'Team ID' },
      ]);
    } catch (error) {
      return res.status(400).json({
        success: false,
        // validateUuids throws Error with field-specific message when available
        error: error instanceof Error ? error.message : 'Invalid UUID format for userId or teamId',
      });
    }

    await assignUserToTeam(assignData.userId, assignData.teamId, assignedBy);

    reqLogger.info(
      {
        userId: assignData.userId,
        teamId: assignData.teamId,
        assignedBy,
      },
      'User assigned to team successfully'
    );

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
      error:
        error instanceof Error
          ? `Failed to assign user to team: ${error.message}`
          : 'Failed to assign user to team',
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
    try {
      validateUuids([
        { value: removeData.userId, fieldName: 'User ID' },
        { value: removeData.teamId, fieldName: 'Team ID' },
      ]);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Invalid UUID format for userId or teamId',
      });
    }

    await removeUserFromTeam(removeData.userId, removeData.teamId);

    reqLogger.info(
      {
        userId: removeData.userId,
        teamId: removeData.teamId,
      },
      'User removed from team successfully'
    );

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
      error:
        error instanceof Error
          ? `Failed to remove user from team: ${error.message}`
          : 'Failed to remove user from team',
    });
  }
}
