import { getUserTeams } from './src/authentication/teamManagement';
import { getAdminToken } from './src/authentication/keycloakAdminApi';
import { keycloakConfig } from './src/config/keycloak';
import { dbLogger as logger } from './src/logging/logger';
import axios from 'axios';

async function checkMaintainerTeams() {
  try {
    // Get an access token using Keycloak direct access
    const credentials = {
      username: 'maintainer@example.com',
      password: 'password',
      grant_type: 'password',
      client_id: keycloakConfig.clientId,
    };

    logger.info('Getting access token for maintainer user...');

    const tokenResponse = await axios.post(
      `${keycloakConfig.url}/realms/${keycloakConfig.realm}/protocol/openid-connect/token`,
      new URLSearchParams(credentials),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    if (!tokenResponse.data?.access_token) {
      logger.error('Failed to get access token');
      return;
    }

    logger.info('Access token obtained, checking teams...');

    // Get user ID from token (sub claim)
    const tokenPayload = JSON.parse(
      Buffer.from(tokenResponse.data.access_token.split('.')[1], 'base64').toString()
    );
    const userId = tokenPayload.sub;

    console.log('User ID:', userId);

    // Get teams for this user
    const teams = await getUserTeams(userId);

    console.log('Teams for maintainer user:', {
      userId,
      teams: teams.map(t => ({ id: t.id, name: t.name, isDefault: t.isDefault })),
    });
  } catch (error) {
    logger.error('Error checking maintainer teams:', error);
  }
}

checkMaintainerTeams().catch(console.error);
