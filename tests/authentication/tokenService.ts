import { authClient } from '../../src/lib/auth-client';
import { testLogger as logger } from '../../src/logging/testLogger';

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
  READONLY: {
    email: 'readonly@example.com',
    password: 'ReadOnly123!',
    name: 'Read Only',
    role: 'readonly',
  },
  MAINTAINER: {
    email: 'maintainer@example.com',
    password: 'Maintainer123!',
    name: 'Maintainer User',
    role: 'maintainer',
  },
  OWNER: {
    email: 'owner@example.com',
    password: 'Owner123!',
    name: 'Owner User',
    role: 'owner',
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
      logger.info({ email }, 'Authentication successful for test user');
      return {
        success: true,
        user: result.data.user,
        session: {
          token: result.data.token,
          expiresAt: new Date(Date.now() + TWENTY_FOUR_HOURS_MS).toISOString(),
        },
      };
    } else {
      logger.error({ email, error: result.error }, 'Authentication failed for test user');
      return {
        success: false,
      };
    }
  } catch (error) {
    logger.error({ email, error }, 'Authentication error for test user');
    return {
      success: false,
    };
  }
}

/**
 * Get authentication token for readonly user
 */
export async function getReadonlyToken(): Promise<BetterAuthTokenResponse> {
  return getAuthToken(TestUsers.READONLY.email, TestUsers.READONLY.password);
}

/**
 * Get authentication token for maintainer user
 */
export async function getMaintainerToken(): Promise<BetterAuthTokenResponse> {
  return getAuthToken(TestUsers.MAINTAINER.email, TestUsers.MAINTAINER.password);
}

/**
 * Get authentication token for owner user
 */
export async function getOwnerToken(): Promise<BetterAuthTokenResponse> {
  return getAuthToken(TestUsers.OWNER.email, TestUsers.OWNER.password);
}

/**
 * Get auth header for API requests
 */
export async function getAuthHeader(
  userType: 'readonly' | 'maintainer' | 'owner' = 'maintainer'
): Promise<Record<string, string>> {
  let tokenResponse: BetterAuthTokenResponse;

  switch (userType) {
    case 'readonly':
      tokenResponse = await getReadonlyToken();
      break;
    case 'owner':
      tokenResponse = await getOwnerToken();
      break;
    case 'maintainer':
    default:
      tokenResponse = await getMaintainerToken();
      break;
  }

  return {
    Authorization: `Bearer ${tokenResponse.session?.token || ''}`,
    'Content-Type': 'application/json',
  };
}
