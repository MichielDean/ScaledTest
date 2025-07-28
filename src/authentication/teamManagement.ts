/**
 * Team Management Service
 *
 * This service handles team operations using Keycloak user attributes and groups
 * for team assignments. Teams are stored as Keycloak groups and user-team
 * relationships are managed through group membership.
 */

import axios, { AxiosError } from 'axios';
import { dbLogger as logger, logError } from '../logging/logger';
import { keycloakConfig } from '../config/keycloak';
import { getAdminToken } from './keycloakAdminApi';
import {
  Team,
  TeamWithMemberCount,
  CreateTeamRequest,
  UpdateTeamRequest,
  TeamPermissions,
} from '../types/team';
import { UserRole } from '../auth/keycloak';

/**
 * Validates that a string is a valid UUID format
 */
function isValidUuid(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Safely encodes a UUID for use in URLs, with validation
 */
function safeEncodeUuid(uuid: string, paramName: string): string {
  if (!uuid || typeof uuid !== 'string') {
    throw new Error(`Invalid ${paramName}: must be a non-empty string`);
  }

  if (!isValidUuid(uuid)) {
    throw new Error(`Invalid ${paramName}: must be a valid UUID format`);
  }

  // Encode the UUID to prevent any potential injection
  return encodeURIComponent(uuid);
}

/**
 * Constructs a safe Keycloak API URL with validated parameters
 */
function buildKeycloakUrl(...pathSegments: string[]): string {
  const baseUrl = `${keycloakConfig.url}/admin/realms/${keycloakConfig.realm}`;
  const safePath = pathSegments.map(segment => encodeURIComponent(segment)).join('/');
  return `${baseUrl}/${safePath}`;
}

/**
 * Keycloak group representation for teams
 */
interface KeycloakGroup {
  id: string;
  name: string;
  path: string;
  attributes?: {
    description?: string[];
    isDefault?: string[];
    createdAt?: string[];
    createdBy?: string[];
  };
  subGroups?: KeycloakGroup[];
}

/**
 * Default team name - all users are automatically assigned to this team
 */
export const DEFAULT_TEAM_NAME = 'default';

/**
 * Get all teams from Keycloak groups
 */
export async function getAllTeams(): Promise<Team[]> {
  try {
    const token = await getAdminToken();

    const url = buildKeycloakUrl('groups');

    const response = await axios.get<KeycloakGroup[]>(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      params: {
        search: 'team-', // Only get groups with team- prefix
      },
    });

    return response.data.map(mapKeycloakGroupToTeam);
  } catch (error) {
    const axiosError = error as AxiosError;
    logError(logger, 'Failed to get teams', axiosError, {
      statusCode: axiosError.response?.status,
    });
    throw new Error('Failed to retrieve teams');
  }
}

/**
 * Get all teams with member counts
 */
export async function getAllTeamsWithMemberCount(): Promise<TeamWithMemberCount[]> {
  try {
    const token = await getAdminToken();
    const teams = await getAllTeams();

    const teamsWithCount = await Promise.all(
      teams.map(async team => {
        try {
          // Validate and safely encode parameters
          const safeTeamId = safeEncodeUuid(team.id, 'team.id');

          const url = buildKeycloakUrl('groups', safeTeamId, 'members');

          const membersResponse = await axios.get(url, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          return {
            ...team,
            memberCount: membersResponse.data.length,
          };
        } catch {
          return {
            ...team,
            memberCount: 0,
          };
        }
      })
    );

    return teamsWithCount;
  } catch (error) {
    const axiosError = error as AxiosError;
    logError(logger, 'Failed to get teams with member counts', axiosError, {
      statusCode: axiosError.response?.status,
    });
    throw new Error('Failed to retrieve teams with member counts');
  }
}

/**
 * Create a new team
 */
export async function createTeam(teamData: CreateTeamRequest, createdBy: string): Promise<Team> {
  try {
    const token = await getAdminToken();

    // Ensure team name is unique and properly formatted
    const teamName = `team-${teamData.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;

    const groupData = {
      name: teamName,
      attributes: {
        description: teamData.description ? [teamData.description] : [],
        isDefault: ['false'],
        createdAt: [new Date().toISOString()],
        createdBy: [createdBy],
      },
    };

    const url = buildKeycloakUrl('groups');

    const response = await axios.post(url, groupData, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    // Get the created group ID from the Location header
    const locationHeader = response.headers.location;
    const groupId = locationHeader?.split('/').pop();

    if (!groupId) {
      throw new Error('Failed to get created team ID');
    }

    // Fetch the created team to return it
    const createdTeam = await getTeamById(groupId);
    if (!createdTeam) {
      throw new Error('Failed to retrieve created team');
    }

    logger.info('Team created successfully', {
      teamId: groupId,
      teamName: teamData.name,
      createdBy,
    });

    return createdTeam;
  } catch (error) {
    const axiosError = error as AxiosError;
    logError(logger, 'Failed to create team', axiosError, {
      teamName: teamData.name,
      createdBy,
      statusCode: axiosError.response?.status,
    });
    throw new Error(`Failed to create team: ${teamData.name}`);
  }
}

/**
 * Get a team by ID
 */
export async function getTeamById(teamId: string): Promise<Team | null> {
  try {
    const token = await getAdminToken();

    // Validate and safely encode parameters
    const safeTeamId = safeEncodeUuid(teamId, 'teamId');

    const url = buildKeycloakUrl('groups', safeTeamId);

    const response = await axios.get<KeycloakGroup>(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return mapKeycloakGroupToTeam(response.data);
  } catch (error) {
    const axiosError = error as AxiosError;
    if (axiosError.response?.status === 404) {
      return null;
    }
    logError(logger, 'Failed to get team by ID', axiosError, {
      teamId,
      statusCode: axiosError.response?.status,
    });
    throw new Error(`Failed to retrieve team: ${teamId}`);
  }
}

/**
 * Update a team
 */
export async function updateTeam(
  teamId: string,
  updates: UpdateTeamRequest,
  updatedBy: string
): Promise<Team> {
  try {
    const token = await getAdminToken();

    // Get current team data
    const currentTeam = await getTeamById(teamId);
    if (!currentTeam) {
      throw new Error('Team not found');
    }

    const updateData: Partial<KeycloakGroup> = {};

    if (updates.name) {
      updateData.name = `team-${updates.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
    }

    if (updates.description !== undefined) {
      updateData.attributes = {
        ...(currentTeam as unknown as KeycloakGroup).attributes,
        description: updates.description ? [updates.description] : [],
      };
    }

    // Validate and safely encode parameters
    const safeTeamId = safeEncodeUuid(teamId, 'teamId');

    const url = buildKeycloakUrl('groups', safeTeamId);

    await axios.put(url, updateData, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    logger.info('Team updated successfully', {
      teamId,
      updates,
      updatedBy,
    });

    // Return updated team
    const updatedTeam = await getTeamById(teamId);
    if (!updatedTeam) {
      throw new Error('Failed to retrieve updated team');
    }

    return updatedTeam;
  } catch (error) {
    const axiosError = error as AxiosError;
    logError(logger, 'Failed to update team', axiosError, {
      teamId,
      updates,
      updatedBy,
      statusCode: axiosError.response?.status,
    });
    throw new Error(`Failed to update team: ${teamId}`);
  }
}

/**
 * Delete a team
 */
export async function deleteTeam(teamId: string, deletedBy: string): Promise<void> {
  try {
    const token = await getAdminToken();

    // Check if team is the default team
    const team = await getTeamById(teamId);
    if (team?.isDefault) {
      throw new Error('Cannot delete the default team');
    }

    // Validate and safely encode parameters
    const safeTeamId = safeEncodeUuid(teamId, 'teamId');

    const url = buildKeycloakUrl('groups', safeTeamId);

    await axios.delete(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    logger.info('Team deleted successfully', {
      teamId,
      deletedBy,
    });
  } catch (error) {
    const axiosError = error as AxiosError;
    logError(logger, 'Failed to delete team', axiosError, {
      teamId,
      deletedBy,
      statusCode: axiosError.response?.status,
    });
    throw new Error(`Failed to delete team: ${teamId}`);
  }
}

/**
 * Assign a user to a team
 */
export async function assignUserToTeam(
  userId: string,
  teamId: string,
  assignedBy: string
): Promise<void> {
  try {
    const token = await getAdminToken();

    // Validate and safely encode parameters
    const safeUserId = safeEncodeUuid(userId, 'userId');
    const safeTeamId = safeEncodeUuid(teamId, 'teamId');

    const url = buildKeycloakUrl('users', safeUserId, 'groups', safeTeamId);

    await axios.put(
      url,
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    logger.info('User assigned to team successfully', {
      userId,
      teamId,
      assignedBy,
    });
  } catch (error) {
    const axiosError = error as AxiosError;
    logError(logger, 'Failed to assign user to team', axiosError, {
      userId,
      teamId,
      assignedBy,
      statusCode: axiosError.response?.status,
    });
    throw new Error(`Failed to assign user to team`);
  }
}

/**
 * Remove a user from a team
 */
export async function removeUserFromTeam(
  userId: string,
  teamId: string,
  removedBy: string
): Promise<void> {
  try {
    const token = await getAdminToken();

    // Check if trying to remove from default team
    const team = await getTeamById(teamId);
    if (team?.isDefault) {
      throw new Error('Cannot remove user from the default team');
    }

    // Validate and safely encode parameters
    const safeUserId = safeEncodeUuid(userId, 'userId');
    const safeTeamId = safeEncodeUuid(teamId, 'teamId');

    const url = buildKeycloakUrl('users', safeUserId, 'groups', safeTeamId);

    await axios.delete(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    logger.info('User removed from team successfully', {
      userId,
      teamId,
      removedBy,
    });
  } catch (error) {
    const axiosError = error as AxiosError;
    logError(logger, 'Failed to remove user from team', axiosError, {
      userId,
      teamId,
      removedBy,
      statusCode: axiosError.response?.status,
    });
    throw new Error(`Failed to remove user from team`);
  }
}

/**
 * Get user's teams
 */
export async function getUserTeams(userId: string): Promise<Team[]> {
  try {
    const token = await getAdminToken();

    // Validate and safely encode parameters
    const safeUserId = safeEncodeUuid(userId, 'userId');

    const url = buildKeycloakUrl('users', safeUserId, 'groups');

    const response = await axios.get<KeycloakGroup[]>(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    // Filter only team groups (those with team- prefix)
    const teamGroups = response.data.filter(group => group.name.startsWith('team-'));
    return teamGroups.map(mapKeycloakGroupToTeam);
  } catch (error) {
    const axiosError = error as AxiosError;

    // Handle user not found case gracefully - user exists but has no teams yet
    if (axiosError.response?.status === 404) {
      logger.info('User not found in Keycloak, returning empty teams list', { userId });
      return [];
    }

    logError(logger, 'Failed to get user teams', axiosError, {
      userId,
      statusCode: axiosError.response?.status,
    });

    // For test environments or other errors, return empty teams list to avoid blocking operations
    logger.warn('Returning empty teams list due to team retrieval error', { userId });
    return [];
  }
}

/**
 * Ensure default team exists and create if not
 */
export async function ensureDefaultTeamExists(): Promise<Team> {
  try {
    // Check if default team already exists
    const teams = await getAllTeams();
    const existingDefaultTeam = teams.find(team => team.isDefault);

    if (existingDefaultTeam) {
      return existingDefaultTeam;
    }

    // Create default team
    const token = await getAdminToken();
    const groupData = {
      name: `team-${DEFAULT_TEAM_NAME}`,
      attributes: {
        description: ['Default team for all users'],
        isDefault: ['true'],
        createdAt: [new Date().toISOString()],
        createdBy: ['system'],
      },
    };

    const response = await axios.post(
      `${keycloakConfig.url}/admin/realms/${keycloakConfig.realm}/groups`,
      groupData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const locationHeader = response.headers.location;
    const groupId = locationHeader?.split('/').pop();

    if (!groupId) {
      throw new Error('Failed to get created default team ID');
    }

    const newDefaultTeam = await getTeamById(groupId);
    if (!newDefaultTeam) {
      throw new Error('Failed to retrieve created default team');
    }

    logger.info('Default team created successfully', {
      teamId: groupId,
    });

    return newDefaultTeam;
  } catch (error) {
    const axiosError = error as AxiosError;
    logError(logger, 'Failed to ensure default team exists', axiosError, {
      statusCode: axiosError.response?.status,
    });
    throw new Error('Failed to create default team');
  }
}

/**
 * Assign user to default team (called during registration)
 */
export async function assignUserToDefaultTeam(userId: string): Promise<void> {
  try {
    const defaultTeam = await ensureDefaultTeamExists();
    await assignUserToTeam(userId, defaultTeam.id, 'system');

    logger.info('User assigned to default team', {
      userId,
      teamId: defaultTeam.id,
    });
  } catch (error) {
    logError(logger, 'Failed to assign user to default team', error, {
      userId,
    });
    throw new Error('Failed to assign user to default team');
  }
}

/**
 * Get team permissions based on user roles
 */
export function getTeamPermissions(userRoles: string[]): TeamPermissions {
  const hasOwnerRole = userRoles.includes(UserRole.OWNER);
  const hasMaintainerRole = userRoles.includes(UserRole.MAINTAINER);

  return {
    canCreateTeam: hasOwnerRole,
    canDeleteTeam: hasOwnerRole,
    canAssignUsers: hasOwnerRole || hasMaintainerRole,
    canViewAllTeams: hasOwnerRole,
    assignableTeams: [], // Will be populated by caller based on user's teams
  };
}

/**
 * Map Keycloak group to Team interface
 */
function mapKeycloakGroupToTeam(group: KeycloakGroup): Team {
  const attributes = group.attributes || {};
  const isDefault = attributes.isDefault?.[0] === 'true';
  const description = attributes.description?.[0];
  const createdAt = attributes.createdAt?.[0] ? new Date(attributes.createdAt[0]) : new Date();

  // Remove team- prefix from name for display
  const displayName = group.name.startsWith('team-') ? group.name.substring(5) : group.name;

  return {
    id: group.id,
    name: displayName,
    description,
    isDefault,
    createdAt,
    updatedAt: createdAt, // Keycloak doesn't track update time separately
  };
}
