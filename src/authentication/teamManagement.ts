import * as teamLib from '../lib/teamManagement';
import {
  Team,
  TeamWithMemberCount,
  CreateTeamRequest,
  UpdateTeamRequest,
  TeamPermissions,
} from '../types/team';
import { dbLogger as logger } from '../logging/logger';

// Compatibility wrapper delegating to centralized team management helpers in
// `src/lib/teamManagement`. This file exists so older imports continue to work
// during migration. The heavy lifting and Better Auth/DB integration live in
// the lib module.

export async function getTeams(): Promise<Team[]> {
  try {
    // `getAllTeams` in the shared lib returns teams with member counts.
    const teamsWithCounts = await teamLib.getAllTeams();
    // Map to the older `Team` shape for compatibility
    return teamsWithCounts.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      isDefault: t.isDefault,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
  } catch (err) {
    logger.error({ err }, 'getTeams wrapper error');
    return [];
  }
}

export async function getTeamsWithMemberCounts(): Promise<TeamWithMemberCount[]> {
  try {
    // The shared lib exposes getAllTeams which includes member counts
    return await teamLib.getAllTeams();
  } catch (err) {
    logger.error({ err }, 'getTeamsWithMemberCounts wrapper error');
    return [];
  }
}

export async function getUserTeams(userId: string): Promise<Team[]> {
  return teamLib.getUserTeams(userId);
}

export async function createTeam(teamData: CreateTeamRequest): Promise<Team> {
  try {
    // Shared lib requires a createdBy argument; default to 'system' for wrappers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (teamLib.createTeam as any)(teamData, 'system');
  } catch (err) {
    logger.error({ err, teamData }, 'createTeam wrapper failed');
    throw err;
  }
}

export async function getTeamById(teamId: string): Promise<Team | null> {
  // Shared lib does not expose a direct getTeamById; fall back to fetching all teams
  const all = await getTeams();
  return all.find(t => t.id === teamId) ?? null;
}

export async function updateTeam(teamId: string, updateData: UpdateTeamRequest): Promise<Team> {
  // Mark parameters as used to satisfy lint rules
  void teamId;
  void updateData;
  logger.warn({ teamId }, 'updateTeam called but not implemented in teamLib');
  throw new Error('Team update not implemented');
}

export async function deleteTeam(teamId: string): Promise<void> {
  void teamId;
  logger.warn({ teamId }, 'deleteTeam called but not implemented in teamLib');
  throw new Error('Team deletion not implemented');
}

export async function addUserToTeam(
  userId: string,
  teamId: string,
  assignedBy?: string
): Promise<void> {
  // lib.addUserToTeam returns a boolean and requires assignedBy string
  await teamLib.addUserToTeam(userId, teamId, assignedBy ?? 'system');
}

export async function assignUserToTeam(
  userId: string,
  teamId: string,
  assignedBy?: string
): Promise<void> {
  return addUserToTeam(userId, teamId, assignedBy);
}

export async function removeUserFromTeam(
  userId: string,
  teamId: string,
  removedBy?: string
): Promise<void> {
  await teamLib.removeUserFromTeam(userId, teamId, removedBy ?? 'system');
}

export async function getTeamMembers(teamId: string): Promise<unknown[]> {
  void teamId;
  // Not implemented in shared lib; return empty for compatibility
  return [];
}

export async function canUserManageTeam(userId: string, teamId: string): Promise<boolean> {
  void userId;
  void teamId;
  // Role checks live elsewhere; conservatively return false for now
  return false;
}

export async function getTeamPermissions(userId: string, teamId: string): Promise<TeamPermissions> {
  void userId;
  void teamId;
  return {
    canCreateTeam: false,
    canDeleteTeam: false,
    canAssignUsers: false,
    canViewAllTeams: true,
    assignableTeams: [],
  };
}

export async function getAllTeams(): Promise<Team[]> {
  return getTeams();
}

export async function addUserToTeams(userId: string, teamIds: string[]): Promise<void> {
  for (const tid of teamIds) await addUserToTeam(userId, tid);
}

export default {
  getTeams,
  getTeamsWithMemberCounts,
  getUserTeams,
  createTeam,
  getTeamById,
  updateTeam,
  deleteTeam,
  addUserToTeam,
  assignUserToTeam,
  removeUserFromTeam,
  getTeamMembers,
  canUserManageTeam,
  getTeamPermissions,
  getAllTeams,
  addUserToTeams,
};
