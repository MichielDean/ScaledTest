/**
 * Better Auth API Adapter
 *
 * Provides a stable, consistent interface for interacting with Better Auth APIs
 * regardless of version differences or API contract changes. This adapter pattern
 * encapsulates the complexity of handling different parameter shapes and API versions.
 */

import { AuthWithAdminApi, BetterAuthUser, BetterAuthApiError } from '../types/auth';
import { dbLogger } from '../logging/logger';

export interface AuthUserAdapter {
  /**
   * Retrieve a user by their ID using the most appropriate method available
   * @param userId - The user ID to lookup
   * @returns Promise resolving to user data or null if not found
   */
  getUser(userId: string): Promise<BetterAuthUser | null>;

  /**
   * Check if a user exists in the authentication system
   * @param userId - The user ID to check
   * @returns Promise resolving to boolean indicating user existence
   */
  userExists(userId: string): Promise<boolean>;
}

// Define specific function types for Better Auth API methods
type GetUserFunction = (
  params: { userId: string } | { id: string } | string
) => Promise<BetterAuthUser | null>;
type GetUserByIdFunction = (userId: string) => Promise<BetterAuthUser | null>;
type ListUsersFunction = () => Promise<BetterAuthUser[]>;

/**
 * Creates a Better Auth API adapter that handles version differences and API contracts
 * @param authApi - The Better Auth API instance (may be null/undefined)
 * @returns An adapter implementing consistent user operations
 */
export function createAuthAdapter(authApi: AuthWithAdminApi | null | undefined): AuthUserAdapter {
  return {
    async getUser(userId: string): Promise<BetterAuthUser | null> {
      if (!authApi) {
        dbLogger.debug({ userId }, 'Better Auth API not available');
        return null;
      }

      // Strategy 1: Use getUser method if available
      if (typeof authApi.api?.getUser === 'function') {
        return await tryGetUserMethod(authApi.api.getUser as GetUserFunction, userId);
      }

      // Strategy 2: Use getUserById method if available (some versions)
      if (
        typeof (authApi.api as unknown as { getUserById?: GetUserByIdFunction })?.getUserById ===
        'function'
      ) {
        return await tryGetUserById(
          (authApi.api as unknown as { getUserById: GetUserByIdFunction }).getUserById,
          userId
        );
      }

      // Strategy 3: Use listUsers and filter (fallback)
      if (
        typeof (authApi.api as unknown as { listUsers?: ListUsersFunction })?.listUsers ===
        'function'
      ) {
        return await tryListUsersFilter(
          (authApi.api as unknown as { listUsers: ListUsersFunction }).listUsers,
          userId
        );
      }

      dbLogger.debug({ userId }, 'No suitable user lookup method available in Better Auth API');
      return null;
    },

    async userExists(userId: string): Promise<boolean> {
      try {
        const user = await this.getUser(userId);
        return user !== null;
      } catch (error) {
        dbLogger.debug({ userId, error }, 'Error checking user existence');
        return false;
      }
    },
  };
}

/**
 * Try the getUser method with different parameter shapes that Better Auth might accept
 */
async function tryGetUserMethod(
  getUserFn: GetUserFunction,
  userId: string
): Promise<BetterAuthUser | null> {
  // Define known parameter shapes in order of preference
  const parameterShapes: Array<{ userId: string } | { id: string } | string> = [
    { userId }, // Most common shape
    { id: userId }, // Alternative shape
    userId, // Direct string parameter
  ];

  for (const params of parameterShapes) {
    try {
      const result = await getUserFn(params);
      if (isValidUser(result)) {
        dbLogger.debug(
          { userId, paramShape: typeof params },
          'Successfully retrieved user via getUser'
        );
        return result;
      }
    } catch (error) {
      // Continue to next parameter shape
      dbLogger.debug(
        { userId, params, error },
        'getUser attempt failed, trying next parameter shape'
      );
    }
  }

  return null;
}

/**
 * Try getUserById method (simpler API)
 */
async function tryGetUserById(
  getUserByIdFn: GetUserByIdFunction,
  userId: string
): Promise<BetterAuthUser | null> {
  try {
    const result = await getUserByIdFn(userId);
    if (isValidUser(result)) {
      dbLogger.debug({ userId }, 'Successfully retrieved user via getUserById');
      return result;
    }
  } catch (error) {
    dbLogger.debug({ userId, error }, 'getUserById attempt failed');
  }

  return null;
}

/**
 * Try filtering from listUsers method (fallback for limited APIs)
 */
async function tryListUsersFilter(
  listUsersFn: ListUsersFunction,
  userId: string
): Promise<BetterAuthUser | null> {
  try {
    const users = await listUsersFn();
    if (Array.isArray(users)) {
      const user = users.find(u => u && (u.id === userId || u.userId === userId));
      if (isValidUser(user)) {
        dbLogger.debug({ userId }, 'Successfully found user via listUsers filter');
        return user;
      }
    }
  } catch (error) {
    dbLogger.debug({ userId, error }, 'listUsers filter attempt failed');
  }

  return null;
}

/**
 * Validate that a result is a valid user object
 */
function isValidUser(user: unknown): user is BetterAuthUser {
  return (
    user !== null &&
    user !== undefined &&
    typeof user === 'object' &&
    (typeof (user as BetterAuthUser).id === 'string' ||
      typeof (user as BetterAuthUser).userId === 'string') &&
    (user as BetterAuthUser).id !== '' &&
    (user as BetterAuthUser).userId !== ''
  );
}

/**
 * Create a standardized error for Better Auth operations
 */
export function createBetterAuthError(
  message: string,
  originalError: unknown,
  context: Record<string, unknown> = {}
): BetterAuthApiError {
  return {
    message,
    code: context.code as string | undefined,
    userId: context.userId as string | undefined,
    operation: context.operation as string | undefined,
  };
}
