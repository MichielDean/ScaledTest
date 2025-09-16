/**
 * Real Authentication Integration Test
 * Tests actual authentication against running Better Auth instance
 */

import { testLogger as logger } from '../../src/logging/logger';

describe('Real Authentication Integration', () => {
  const baseURL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

  /**
   * Test authentication directly via HTTP API
   */
  async function testAuthenticationViaAPI(email: string, password: string) {
    const response = await fetch(`${baseURL}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
      }),
    });

    const data = await response.json();
    return {
      success: response.ok,
      data,
      status: response.status,
    };
  }

  it('should authenticate admin@scaledtest.com successfully', async () => {
    const result = await testAuthenticationViaAPI('admin@scaledtest.com', 'Admin123!');

    if (!result.success) {
      logger.error({ status: result.status, data: result.data }, 'Authentication failed');
    }

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);
    expect(result.data).toBeDefined();

    logger.info(
      {
        status: result.status,
      },
      'Successfully authenticated admin user via API'
    );
  });

  it('should authenticate user@scaledtest.com successfully', async () => {
    const result = await testAuthenticationViaAPI('user@scaledtest.com', 'TestUser123!');

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);
    expect(result.data).toBeDefined();

    logger.info(
      {
        status: result.status,
      },
      'Successfully authenticated user via API'
    );
  });

  it('should reject invalid credentials', async () => {
    const result = await testAuthenticationViaAPI('invalid@scaledtest.com', 'WrongPassword');

    expect(result.success).toBe(false);
    expect(result.status).toBe(401);
  });
});
