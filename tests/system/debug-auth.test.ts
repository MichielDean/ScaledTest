/**
 * Authentication debugging test
 */

import supertest from 'supertest';
import { testLogger } from '../../src/logging/logger';

describe('Authentication Debug', () => {
  it('should debug authentication flow', async () => {
    const app = 'http://localhost:3000';
    const agent = supertest.agent(app);

    testLogger.info('Starting authentication debug test');

    // Step 1: Authenticate
    const authResponse = await agent.post('/api/auth/sign-in/email').send({
      email: 'admin@scaledtest.com',
      password: 'Admin123!',
    });

    testLogger.info(
      {
        status: authResponse.status,
        headers: authResponse.headers,
        body: authResponse.body,
        cookies: authResponse.headers['set-cookie'],
      },
      'Authentication response:'
    );

    expect(authResponse.status).toBe(200);

    // Step 2: Test authenticated endpoint
    const testResponse = await agent.get('/api/auth/get-session');

    testLogger.info(
      {
        status: testResponse.status,
        headers: testResponse.headers,
        body: testResponse.body,
      },
      'Session check response:'
    );

    // Step 3: Test the actual API endpoint
    const apiResponse = await agent.post('/api/test-reports').send({
      reportFormat: 'CTRF',
      specVersion: '1.0.0',
      results: {
        tool: { name: 'jest' },
        summary: {
          tests: 1,
          passed: 1,
          failed: 0,
          skipped: 0,
          pending: 0,
          other: 0,
          start: Date.now(),
          stop: Date.now() + 1000,
        },
        tests: [
          {
            name: 'test',
            status: 'passed',
            duration: 100,
          },
        ],
      },
    });

    testLogger.info(
      {
        status: apiResponse.status,
        headers: apiResponse.headers,
        body: apiResponse.body,
      },
      'API response:'
    );
  });
});
