/**
 * Keycloak Admin Authentication (TypeScript)
 *
 * Shared functionality for authenticating with Keycloak admin APIs.
 * This eliminates duplication between setup scripts and admin API endpoints.
 */

import axios, { AxiosResponse } from 'axios';
import { getRequiredEnvVar } from '../environment/variableHandling.js';

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: string;
  'not-before-policy': number;
  scope: string;
}

interface AuthHeaders {
  Authorization: string;
}

/**
 * Get admin access token from Keycloak
 */
const getKeycloakAdminToken = async (
  keycloakUrl?: string,
  adminUsername?: string,
  adminPassword?: string
): Promise<string> => {
  const baseUrl = keycloakUrl || getRequiredEnvVar('KEYCLOAK_URL');
  const username = adminUsername || getRequiredEnvVar('KEYCLOAK_ADMIN_USERNAME');
  const password = adminPassword || getRequiredEnvVar('KEYCLOAK_ADMIN_PASSWORD');

  try {
    const response: AxiosResponse<TokenResponse> = await axios.post(
      `${baseUrl}/realms/master/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username,
        password,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    return response.data.access_token;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to authenticate as Keycloak admin: ${errorMessage}`);
  }
};

/**
 * Create authorization headers for admin API requests
 */
const getAdminAuthHeaders = async (
  keycloakUrl?: string,
  adminUsername?: string,
  adminPassword?: string
): Promise<AuthHeaders> => {
  const token = await getKeycloakAdminToken(keycloakUrl, adminUsername, adminPassword);
  return {
    Authorization: `Bearer ${token}`,
  };
};

export { getKeycloakAdminToken, getAdminAuthHeaders };
