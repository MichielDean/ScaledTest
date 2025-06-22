import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { KeycloakTokenResponse, KeycloakConfig } from '../../src/types/auth';

// Re-export auth interfaces from the centralized location
export type { KeycloakTokenResponse, KeycloakConfig } from '../../src/types/auth';

// Load Keycloak configuration
const loadKeycloakConfig = (): KeycloakConfig => {
  const configPath = path.resolve(process.cwd(), 'public', 'keycloak.json');
  if (!fs.existsSync(configPath)) {
    throw new Error('Keycloak configuration not found');
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
};

// Get authentication token for test user with specific role
export const getAuthToken = async (
  username: string = 'maintainer@example.com',
  password: string = 'password'
): Promise<string> => {
  const keycloakConfig = loadKeycloakConfig();
  const tokenUrl = `${keycloakConfig['auth-server-url']}/realms/${keycloakConfig.realm}/protocol/openid-connect/token`;

  try {
    const response = await axios.post<KeycloakTokenResponse>(
      tokenUrl,
      new URLSearchParams({
        grant_type: 'password',
        client_id: keycloakConfig.resource,
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
        `Failed to authenticate test user: ${status} ${statusText}. URL: ${tokenUrl}. Response: ${JSON.stringify(data)}`
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
