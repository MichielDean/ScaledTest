// Shared types and constants for both client and server
// This file should NOT import any server-specific modules

// Define access control statements for our permissions
export const statement = {
  content: ['read', 'write'],
  users: ['manage'],
  admin: ['access'],
} as const;

// Define role names - these will be used to create actual roles in auth.ts
export const roleNames = {
  readonly: 'readonly',
  maintainer: 'maintainer',
  owner: 'owner',
} as const;

// Export type for role names
export type RoleName = (typeof roleNames)[keyof typeof roleNames];

// Permission types
export type ContentPermission = 'read' | 'write';
export type UserPermission = 'manage';
export type AdminPermission = 'access';

// Combined permission type
export type AppPermission = ContentPermission | UserPermission | AdminPermission;
