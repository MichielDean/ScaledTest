/**
 * Keycloak Admin Authentication Utilities (ES Modules)
 *
 * Shared utilities for authenticating with Keycloak admin APIs.
 * This eliminates duplication between setup scripts and admin API endpoints.
 */

import axios from 'axios';
import { getRequiredEnvVar } from './env.js';

/**
 * Get admin access token from Keycloak
 * @param {string} [keycloakUrl] - The base URL of the Keycloak server
 * @param {string} [adminUsername] - Admin username (optional, will use env var if not provided)
 * @param {string} [adminPassword] - Admin password (optional, will use env var if not provided)
 * @returns {Promise<string>} Promise resolving to the admin access token
 */
const getKeycloakAdminToken = async (keycloakUrl, adminUsername, adminPassword) => {
  const baseUrl = keycloakUrl || getRequiredEnvVar('KEYCLOAK_URL');
  const username = adminUsername || getRequiredEnvVar('KEYCLOAK_ADMIN_USERNAME');
  const password = adminPassword || getRequiredEnvVar('KEYCLOAK_ADMIN_PASSWORD');

  try {
    const response = await axios.post(
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
 * @param {string} [keycloakUrl] - The base URL of the Keycloak server (optional)
 * @param {string} [adminUsername] - Admin username (optional)
 * @param {string} [adminPassword] - Admin password (optional)
 * @returns {Promise<{Authorization: string}>} Promise resolving to authorization headers object
 */
const getAdminAuthHeaders = async (keycloakUrl, adminUsername, adminPassword) => {
  const token = await getKeycloakAdminToken(keycloakUrl, adminUsername, adminPassword);
  return {
    Authorization: `Bearer ${token}`,
  };
};

export { getKeycloakAdminToken, getAdminAuthHeaders };
