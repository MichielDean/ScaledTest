/**
 * Keycloak Admin Authentication Utilities
 *
 * Shared utilities for authenticating with Keycloak admin APIs.
 * This eliminates duplication between setup scripts and admin API endpoints.
 */

import axios, { AxiosResponse } from 'axios';
import { getRequiredEnvVar } from '../environment/env';

// Admin token response interface
interface AdminTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  refresh_token?: string;
}

/**
 * Get admin access token from Keycloak
 * @param keycloakUrl - The base URL of the Keycloak server
 * @param adminUsername - Admin username (optional, will use env var if not provided)
 * @param adminPassword - Admin password (optional, will use env var if not provided)
 * @returns Promise resolving to the admin access token
 */
export const getKeycloakAdminToken = async (
  keycloakUrl?: string,
  adminUsername?: string,
  adminPassword?: string
): Promise<string> => {
  const baseUrl = keycloakUrl || getRequiredEnvVar('KEYCLOAK_URL');
  const username = adminUsername || getRequiredEnvVar('KEYCLOAK_ADMIN_USERNAME');
  const password = adminPassword || getRequiredEnvVar('KEYCLOAK_ADMIN_PASSWORD');

  try {
    const response: AxiosResponse<AdminTokenResponse> = await axios.post(
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
 * @param keycloakUrl - The base URL of the Keycloak server (optional)
 * @param adminUsername - Admin username (optional)
 * @param adminPassword - Admin password (optional)
 * @returns Promise resolving to authorization headers object
 */
export const getAdminAuthHeaders = async (
  keycloakUrl?: string,
  adminUsername?: string,
  adminPassword?: string
): Promise<{ Authorization: string }> => {
  const token = await getKeycloakAdminToken(keycloakUrl, adminUsername, adminPassword);
  return {
    Authorization: `Bearer ${token}`,
  };
};
