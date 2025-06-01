// tests/utils/auth.ts
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

interface KeycloakTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  token_type: string;
  scope: string;
}

// Load Keycloak configuration
const loadKeycloakConfig = (): any => {
  const configPath = path.resolve(process.cwd(), 'public', 'keycloak.json');
  if (!fs.existsSync(configPath)) {
    throw new Error('Keycloak configuration not found');
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
};

// Get authentication token for test user with specific role
export const getAuthToken = async (
  username: string = 'maintainer-user',
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
      }
    );

    return response.data.access_token;
  } catch (error) {
    console.error('Error getting auth token:', error);
    throw new Error('Failed to authenticate test user');
  }
};

// Generate authentication header
export const getAuthHeader = async (): Promise<Record<string, string>> => {
  const token = await getAuthToken();
  return {
    Authorization: `Bearer ${token}`,
  };
};
