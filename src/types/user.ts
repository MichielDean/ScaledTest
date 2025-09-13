/**
 * User-related interfaces
 *
 * This file contains shared interfaces related to users to reduce duplication across
 * the codebase. These interfaces represent user data structures used throughout the application.
 */

import { UserRole } from './roles';
import { BaseEntity, BaseUser } from './apiResponses';

/**
 * Core user interface with database fields
 */
export interface User extends BaseUser, BaseEntity {
  roles: UserRole[];
}

/**
 * User profile for UI representation
 */
export interface UserProfile extends BaseUser {
  roles: string[];
}

/**
 * User with role management capabilities for admin panel
 */
export interface UserWithRoles extends BaseUser {
  roles: string[];
  isMaintainer: boolean;
}

/**
 * Registration request body
 */
export interface RegisterRequestBody {
  username: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  teamIds?: string[]; // Optional team IDs to join
}
