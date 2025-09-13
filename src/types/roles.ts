/**
 * User Role Types
 *
 * Centralized role definitions used throughout the application.
 * These roles are used for both Better Auth RBAC and authorization checks.
 */

export enum UserRole {
  READONLY = 'readonly',
  MAINTAINER = 'maintainer',
  OWNER = 'owner',
}

/**
 * Type-safe role checking utilities
 */
export const Roles = UserRole;

/**
 * Array of all available roles for validation
 */
export const ALL_ROLES = Object.values(UserRole);

/**
 * Role hierarchy for permission checks
 */
export const ROLE_HIERARCHY = {
  [UserRole.READONLY]: 1,
  [UserRole.MAINTAINER]: 2,
  [UserRole.OWNER]: 3,
} as const;

/**
 * Check if a role has equal or higher privileges than another role
 */
export function hasRoleLevel(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * Get the display name for a role
 */
export function getRoleDisplayName(role: UserRole): string {
  switch (role) {
    case UserRole.READONLY:
      return 'Read Only';
    case UserRole.MAINTAINER:
      return 'Maintainer';
    case UserRole.OWNER:
      return 'Owner';
    default:
      return 'Unknown';
  }
}
