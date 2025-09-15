import { testLogger } from '../../src/logging/logger';
import { authClient } from '../../src/lib/auth-client';

/**
 * Authentication token service for tests using Better Auth
 * Provides functions to obtain and manage authentication tokens for testing
 */

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export interface BetterAuthTokenResponse {
  success: boolean;
  user?: {
    id: string;
    email: string;
    name: string;
    role?: string;
  };
  session?: {
    token: string;
    expiresAt: string;
  };
}

/**
 * Test user credentials
 */
export const TestUsers = {
  USER: {
    email: 'user@scaledtest.com',
    password: 'TestUser123!',
    name: 'Test User',
    role: 'user',
  },
  ADMIN: {
    email: 'admin@scaledtest.com',
    password: 'Admin123!',
    name: 'Admin User',
    role: 'admin',
  },
};

/**
 * Authenticate with Better Auth for testing
 */
export async function getAuthToken(
  email: string,
  password: string
): Promise<BetterAuthTokenResponse> {
  try {
    const result = await authClient.signIn.email({
      email,
      password,
    });

    if (result.data) {
      testLogger.info({ email }, 'Authentication successful for test user');
      return {
        success: true,
        user: result.data.user,
        session: {
          token: result.data.token,
          expiresAt: new Date(Date.now() + TWENTY_FOUR_HOURS_MS).toISOString(),
        },
      };
    } else {
      testLogger.error({ email, error: result.error }, 'Authentication failed for test user');
      return {
        success: false,
      };
    }
  } catch (error) {
    testLogger.error({ email, error }, 'Authentication error for test user');
    return {
      success: false,
    };
  }
}

/**
 * Get authentication token for regular user
 */
export async function getUserToken(): Promise<BetterAuthTokenResponse> {
  return getAuthToken(TestUsers.USER.email, TestUsers.USER.password);
}

/**
 * Get authentication token for admin user
 */
export async function getAdminToken(): Promise<BetterAuthTokenResponse> {
  return getAuthToken(TestUsers.ADMIN.email, TestUsers.ADMIN.password);
}

/**
 * Get auth header for API requests
 */
export async function getAuthHeader(
  userType: 'user' | 'admin' = 'user'
): Promise<Record<string, string>> {
  let tokenResponse: BetterAuthTokenResponse;

  switch (userType) {
    case 'user':
      tokenResponse = await getUserToken();
      break;
    case 'admin':
    default:
      tokenResponse = await getAdminToken();
      break;
  }

  return {
    Authorization: `Bearer ${tokenResponse.session?.token || ''}`,
    'Content-Type': 'application/json',
  };
}
