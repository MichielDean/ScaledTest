/**
 * User Role Types
 *
 * Centralized role definitions used throughout the application.
 * These roles align with Better Auth's built-in role system.
 */

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
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
  [UserRole.USER]: 1,
  [UserRole.ADMIN]: 2,
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
    case UserRole.USER:
      return 'User';
    case UserRole.ADMIN:
      return 'Admin';
    default:
      return 'Unknown';
  }
}
