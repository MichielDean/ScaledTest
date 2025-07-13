import axios from 'axios';
import { keycloakConfig } from './src/config/keycloak.js';
import logger from './src/logging/logger.js';

const testLogger = logger.child({ module: 'test-auth' });

async function testAuthentication() {
  try {
    const tokenUrl = `${keycloakConfig.url}/realms/${keycloakConfig.realm}/protocol/openid-connect/token`;

    testLogger.info('Testing authentication', {
      tokenUrl,
      realm: keycloakConfig.realm,
      clientId: keycloakConfig.clientId,
    });

    const username = 'maintainer@example.com';
    const password = 'password';

    const response = await axios.post(
      tokenUrl,
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

    testLogger.info('Authentication successful', {
      tokenType: response.data.token_type,
      expiresIn: response.data.expires_in,
    });

    // Now test the API with the token
    const apiResponse = await axios.get('http://localhost:3000/api/test-reports', {
      headers: {
        Authorization: `Bearer ${response.data.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    testLogger.info('API call successful', {
      status: apiResponse.status,
      dataCount: apiResponse.data.reports?.length || 0,
    });
  } catch (error) {
    const axiosError = error as any;
    if (axiosError.response) {
      testLogger.error('HTTP Error', {
        status: axiosError.response.status,
        statusText: axiosError.response.statusText,
        data: axiosError.response.data,
      });
    } else {
      testLogger.error('Network/Other Error', {
        message: axiosError.message || String(error),
        code: axiosError.code,
      });
    }
  }
}

testAuthentication();
