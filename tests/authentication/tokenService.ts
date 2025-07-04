import axios from 'axios';
import { KeycloakTokenResponse } from '../../src/types/auth';
import { keycloakConfig, keycloakEndpoints } from '../../src/config/keycloak';

/**
 * Authentication token service for tests
 * Provides functions to obtain and manage authentication tokens for testing
 */

// Re-export auth interfaces from the centralized location
export type { KeycloakTokenResponse, KeycloakConfig } from '../../src/types/auth';

// Get authentication token for test user with specific role
export const getAuthToken = async (
  username: string = 'maintainer@example.com',
  password: string = 'password'
): Promise<string> => {
  try {
    const response = await axios.post<KeycloakTokenResponse>(
      keycloakEndpoints.token,
      new URLSearchParams({
        grant_type: 'password',
        client_id: keycloakConfig.clientId,
        username,
        password,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 10000,
      }
    );

    return response.data.access_token;
  } catch (error) {
    // More detailed error information for debugging
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const statusText = error.response?.statusText;
      const data = error.response?.data;
      throw new Error(
        `Failed to authenticate test user: ${status} ${statusText}. URL: ${keycloakEndpoints.token}. Response: ${JSON.stringify(data)}`
      );
    }
    throw new Error(
      `Failed to authenticate test user: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

// Generate authentication header
export const getAuthHeader = async (): Promise<Record<string, string>> => {
  const token = await getAuthToken();
  return {
    Authorization: `Bearer ${token}`,
  };
};
