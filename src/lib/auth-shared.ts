// Shared types and constants for both client and server
// This file should NOT import any server-specific modules

// Define role names using Better Auth's built-in roles
export const roleNames = {
  user: 'user',
  admin: 'admin',
} as const;

// Export type for role names
export type RoleName = (typeof roleNames)[keyof typeof roleNames];

// Better Auth built-in permissions - these are managed automatically
// admin: Users with the admin role have full control over other users.
// user: Users with the user role have no control over other users.
//
// Built-in permissions for resources:
// user: create, list, set-role, ban, impersonate, delete, set-password
// session: list, revoke, delete
//
// Users with admin role have full control over all resources and actions.
// Users with user role have no control over any of those actions.
