/**
 * Canonical role and permission definitions for ScaledTest.
 *
 * This is the single source of truth. Both src/types/roles.ts and
 * src/lib/permissions.ts now re-export from here.
 */

import { roleNames, type RoleName } from '@/lib/auth-shared';

// ---------------------------------------------------------------------------
// From src/types/roles.ts
// ---------------------------------------------------------------------------

export enum UserRole {
  READONLY = 'readonly',
  MAINTAINER = 'maintainer',
  OWNER = 'owner',
}

/**
 * Type-safe role checking utilities (alias to UserRole for back-compat)
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

// ---------------------------------------------------------------------------
// From src/lib/permissions.ts
// ---------------------------------------------------------------------------

export const Permissions = {
  READ_CONTENT: 'read_content',
  WRITE_CONTENT: 'write_content',
  MANAGE_USERS: 'manage_users',
  ADMIN_ACCESS: 'admin_access',
} as const;

export type Role = RoleName;
export type Permission = (typeof Permissions)[keyof typeof Permissions];

export const rolePermissions: Record<Role, Permission[]> = {
  [roleNames.readonly]: [Permissions.READ_CONTENT] as Permission[],
  [roleNames.maintainer]: [Permissions.READ_CONTENT, Permissions.WRITE_CONTENT] as Permission[],
  [roleNames.owner]: Object.values(Permissions) as Permission[],
};

export function hasPermission(user: unknown, permission: string): boolean {
  const userRole = (user as { clientMetadata?: { role?: Role } })?.clientMetadata?.role;
  if (!userRole || !(userRole in rolePermissions)) return false;

  const userPermissions = rolePermissions[userRole];
  return userPermissions.includes(permission as Permission);
}

/**
 * Check if user has a specific role based on Better Auth user structure.
 * Supports hierarchical roles — higher roles inherit lower role permissions.
 */
export function hasRole(user: unknown, role: Role): boolean {
  const userRole = (user as { role?: Role })?.role;
  if (!userRole) return false;

  if (role === 'readonly') {
    return userRole === 'readonly' || userRole === 'maintainer' || userRole === 'owner';
  }
  if (role === 'maintainer') {
    return userRole === 'maintainer' || userRole === 'owner';
  }
  if (role === 'owner') {
    return userRole === 'owner';
  }

  return false;
}

export function hasWriteAccess(user: unknown): boolean {
  return hasRole(user, roleNames.maintainer) || hasRole(user, roleNames.owner);
}

export function hasFullAccess(user: unknown): boolean {
  return hasRole(user, roleNames.owner);
}

export function hasReadAccess(user: unknown): boolean {
  return (
    hasRole(user, roleNames.readonly) ||
    hasRole(user, roleNames.maintainer) ||
    hasRole(user, roleNames.owner)
  );
}
