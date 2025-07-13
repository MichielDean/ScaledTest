import axios from 'axios';
import { keycloakConfig } from './src/config/keycloak.js';
import logger from './src/logging/logger.js';

const testLogger = logger.child({ module: 'test-post' });

async function testPostDemoData() {
  try {
    // First get authentication token
    const tokenUrl = `${keycloakConfig.url}/realms/${keycloakConfig.realm}/protocol/openid-connect/token`;

    const username = 'maintainer@example.com';
    const password = 'password';

    const tokenResponse = await axios.post(
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

    testLogger.info('Authentication successful');

    // Create a simple CTRF report
    const ctrfReport = {
      reportFormat: 'CTRF',
      specVersion: '1.0.0',
      reportId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      results: {
        tool: {
          name: 'Test Tool',
          version: '1.0.0',
        },
        summary: {
          tests: 2,
          passed: 1,
          failed: 1,
          skipped: 0,
          pending: 0,
          other: 0,
          start: Date.now() - 10000,
          stop: Date.now(),
        },
        tests: [
          {
            name: 'Test 1',
            status: 'passed',
            duration: 100,
          },
          {
            name: 'Test 2',
            status: 'failed',
            duration: 200,
            message: 'Test failed',
          },
        ],
      },
    };

    testLogger.info('Sending CTRF report to API');

    // Now test POST with the token
    const apiResponse = await axios.post('http://localhost:3000/api/test-reports', ctrfReport, {
      headers: {
        Authorization: `Bearer ${tokenResponse.data.access_token}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
      validateStatus: status => status < 500, // Don't throw on 4xx errors
    });

    if (apiResponse.status === 200 || apiResponse.status === 201) {
      testLogger.info('POST successful', {
        status: apiResponse.status,
        response: apiResponse.data,
      });
    } else {
      testLogger.error('POST failed', {
        status: apiResponse.status,
        response: apiResponse.data,
      });
    }
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

testPostDemoData();
