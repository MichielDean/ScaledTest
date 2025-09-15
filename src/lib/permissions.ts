import { roleNames, type RoleName } from '@/lib/auth-shared';

export const Roles = roleNames;

/**
 * Check if user has a specific role based on Better Auth user structure
 * This checks the role field directly on the user object as set by Better Auth
 */
export function hasRole(user: unknown, role: RoleName): boolean {
  // Better Auth stores role directly on the user object
  const userRole = (user as { role?: RoleName })?.role;
  if (!userRole) return false;

  // Simple role matching - Better Auth handles permissions internally
  return userRole === role;
}

/**
 * Check if user has admin access
 */
export function hasAdminAccess(user: unknown): boolean {
  return hasRole(user, Roles.admin);
}

/**
 * Check if user is authenticated (has any role)
 */
export function isAuthenticated(user: unknown): boolean {
  const userRole = (user as { role?: RoleName })?.role;
  return Boolean(userRole);
}

// Better Auth built-in permissions:
// admin: Full control over users (create, list, set-role, ban, impersonate, delete, set-password)
//        Full control over sessions (list, revoke, delete)
// user:  No control over other users or sessions

export type Role = RoleName;
