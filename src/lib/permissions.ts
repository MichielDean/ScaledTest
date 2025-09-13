import { roleNames, type RoleName } from '@/lib/auth-shared';

export const Roles = roleNames;

export const Permissions = {
  READ_CONTENT: 'read_content',
  WRITE_CONTENT: 'write_content',
  MANAGE_USERS: 'manage_users',
  ADMIN_ACCESS: 'admin_access',
} as const;

export const rolePermissions = {
  [Roles.readonly]: [Permissions.READ_CONTENT] as Permission[],
  [Roles.maintainer]: [Permissions.READ_CONTENT, Permissions.WRITE_CONTENT] as Permission[],
  [Roles.owner]: Object.values(Permissions) as Permission[],
};

export function hasPermission(user: unknown, permission: string): boolean {
  const userRole = (user as { clientMetadata?: { role?: Role } })?.clientMetadata?.role;
  if (!userRole || !(userRole in rolePermissions)) return false;

  const userPermissions = rolePermissions[userRole];
  return userPermissions.includes(permission as Permission);
}

/**
 * Check if user has a specific role based on Better Auth user structure
 * This checks the role field directly on the user object as set by Better Auth
 */
export function hasRole(user: unknown, role: Role): boolean {
  // Better Auth stores role directly on the user object
  const userRole = (user as { role?: Role })?.role;
  if (!userRole) return false;

  // Support hierarchical roles - higher roles inherit lower role permissions
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
  return hasRole(user, Roles.maintainer) || hasRole(user, Roles.owner);
}

export function hasFullAccess(user: unknown): boolean {
  return hasRole(user, Roles.owner);
}

export function hasReadAccess(user: unknown): boolean {
  return (
    hasRole(user, Roles.readonly) || hasRole(user, Roles.maintainer) || hasRole(user, Roles.owner)
  );
}

export type Role = RoleName;
export type Permission = (typeof Permissions)[keyof typeof Permissions];
