/**
 * Team-related interfaces and types
 *
 * This file contains shared interfaces for team management and team-based access control.
 * Teams provide an additional layer of data isolation and access control beyond user roles.
 */

import { BaseEntity } from './apiResponses';

/**
 * Core team interface
 */
export interface Team extends BaseEntity {
  name: string;
  description?: string;
  isDefault: boolean;
}

/**
 * Team with member count for admin displays
 */
export interface TeamWithMemberCount extends Team {
  memberCount: number;
}

/**
 * Team assignment interface linking users to teams
 */
export interface TeamAssignment extends BaseEntity {
  userId: string;
  teamId: string;
  assignedAt: Date;
  assignedBy?: string; // User ID of who assigned the team
}

/**
 * User with team assignments for UI representation
 */
export interface UserWithTeams {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  roles: string[];
  teams: Team[];
  isMaintainer: boolean;
}

/**
 * Team creation request body
 */
export interface CreateTeamRequest {
  name: string;
  description?: string;
}

/**
 * Team update request body
 */
export interface UpdateTeamRequest {
  name?: string;
  description?: string;
}

/**
 * Team assignment request body
 */
export interface AssignTeamRequest {
  userId: string;
  teamId: string;
}

/**
 * Team assignment removal request body
 */
export interface RemoveTeamAssignmentRequest {
  userId: string;
  teamId: string;
}

/**
 * Team-based filter for test results and analytics queries
 */
export interface TeamFilter {
  teamIds?: string[];
  includeDefault?: boolean;
}

/**
 * Extended test report metadata with team information
 */
export interface TestReportWithTeam {
  reportId: string;
  teamId: string;
  teamName: string;
  uploadedBy: string;
  uploadedAt: Date;
}

/**
 * Team management permissions for different roles
 */
export interface TeamPermissions {
  canCreateTeam: boolean;
  canDeleteTeam: boolean;
  canAssignUsers: boolean;
  canViewAllTeams: boolean;
  assignableTeams: string[]; // Team IDs this user can assign others to
}
