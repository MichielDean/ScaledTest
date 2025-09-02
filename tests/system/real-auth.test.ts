/**
 * Real Authentication Integration Test
 * Tests actual authentication against running Better Auth instance
 */

import { testLogger as logger } from '../../src/logging/testLogger';

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

  it('should authenticate maintainer@example.com successfully', async () => {
    const result = await testAuthenticationViaAPI('maintainer@example.com', 'Maintainer123!');

    if (!result.success) {
      logger.error('Authentication failed', { status: result.status, data: result.data });
    }

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);
    expect(result.data).toBeDefined();

    logger.info('Successfully authenticated maintainer user via API', {
      status: result.status,
    });
  });

  it('should authenticate readonly@example.com successfully', async () => {
    const result = await testAuthenticationViaAPI('readonly@example.com', 'ReadOnly123!');

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);
    expect(result.data).toBeDefined();

    logger.info('Successfully authenticated readonly user via API', {
      status: result.status,
    });
  });

  it('should authenticate owner@example.com successfully', async () => {
    const result = await testAuthenticationViaAPI('owner@example.com', 'Owner123!');

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);
    expect(result.data).toBeDefined();

    logger.info('Successfully authenticated owner user via API', {
      status: result.status,
    });
  });

  it('should reject invalid credentials', async () => {
    const result = await testAuthenticationViaAPI('invalid@example.com', 'WrongPassword');

    expect(result.success).toBe(false);
    expect(result.status).toBe(401);

    logger.info('Correctly rejected invalid credentials', {
      status: result.status,
    });
  });
});
