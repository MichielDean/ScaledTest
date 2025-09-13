/**
 * Test authentication utilities for Better Auth
 * Provides real authentication with test users - no bypass logic
 */

import { testLogger } from '../../src/logging/testLogger';

export interface TestUser {
  email: string;
  password: string;
  name: string;
  role: 'readonly' | 'maintainer' | 'owner';
}

export const TestUsers: Record<string, TestUser> = {
  READONLY: {
    email: 'readonly@example.com',
    password: 'ReadOnly123!',
    name: 'Read Only',
    role: 'readonly',
  },
  MAINTAINER: {
    email: 'maintainer@example.com',
    password: 'Maintainer123!',
    name: 'Maintainer User',
    role: 'maintainer',
  },
  OWNER: {
    email: 'owner@example.com',
    password: 'Owner123!',
    name: 'Owner User',
    role: 'owner',
  },
};

/**
 * Authenticate with a test user and get session cookies
 * Returns headers with authentication cookies for API requests
 */
export async function getAuthHeaders(
  testUser: TestUser = TestUsers.OWNER,
  baseUrl: string = 'http://localhost:3000'
): Promise<Record<string, string>> {
  try {
    testLogger.debug(`Attempting to authenticate ${testUser.email} at ${baseUrl}`);

    // Use Better Auth server-side API for authentication
    const signInResponse = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: testUser.email,
        password: testUser.password,
      }),
    });

    testLogger.debug(`Sign-in response status: ${signInResponse.status}`);

    if (!signInResponse.ok) {
      const errorText = await signInResponse.text();
      testLogger.error(
        {
          status: signInResponse.status,
          response: errorText,
        },
        'Authentication failed for ${testUser.email}:'
      );
      throw new Error(`Authentication failed: ${signInResponse.status} ${errorText}`);
    }

    // Extract all Set-Cookie headers properly
    let cookieHeaders: string[] = [];

    // Try the modern getSetCookie method first (Node.js 18+)
    try {
      const modernCookies = signInResponse.headers.getSetCookie();
      if (modernCookies && modernCookies.length > 0) {
        cookieHeaders = modernCookies;
      }
    } catch {
      // Fallback for older Node.js versions or different fetch implementations
      testLogger.debug('getSetCookie not available, using fallback');
    }

    // If modern method didn't work, try the traditional approach
    if (cookieHeaders.length === 0) {
      const cookieHeader = signInResponse.headers.get('set-cookie');
      if (cookieHeader) {
        // Handle multiple cookies in a single header (comma-separated)
        cookieHeaders = cookieHeader.split(/,(?=\s*[^;]+=[^;]+)/);
      }
    }

    if (cookieHeaders.length === 0) {
      testLogger.error('No authentication cookies received from sign-in response');
      throw new Error('No authentication cookies received from sign-in response');
    }

    testLogger.debug(`Received ${cookieHeaders.length} cookie headers`);

    // Parse cookies properly - extract only the cookie name=value pairs
    const cookies = cookieHeaders
      .map(header => {
        // Extract just the name=value part before the first semicolon
        const cookiePair = header.split(';')[0].trim();
        return cookiePair;
      })
      .filter(Boolean)
      .join('; ');

    testLogger.debug(
      {
        cookieCount: cookieHeaders.length,
        cookieLength: cookies.length,
      },
      'Successfully authenticated ${testUser.email}'
    );

    return {
      'Content-Type': 'application/json',
      Cookie: cookies,
    };
  } catch (error) {
    testLogger.error({ error }, `Failed to authenticate ${testUser.email}:`);
    throw error;
  }
}

/**
 * Get authentication headers for API testing
 * @deprecated Use getAuthHeaders instead
 */
export async function getAuthHeader(): Promise<Record<string, string>> {
  return getAuthHeaders();
}

/**
 * Create an authenticated supertest agent for system tests
 * Returns a supertest agent with an active session
 */
export async function createAuthenticatedAgent(app: string, testUser: TestUser = TestUsers.OWNER) {
  const supertest = await import('supertest');
  const agent = supertest.agent(app);

  testLogger.debug(`Attempting to create authenticated agent for ${testUser.email} at ${app}`);

  // Perform authentication using the agent to maintain cookies
  const authResponse = await agent.post('/api/auth/sign-in/email').send({
    email: testUser.email,
    password: testUser.password,
  });

  testLogger.info(
    {
      user: testUser.email,
      body: authResponse.body,
      headers: authResponse.headers,
      cookies: authResponse.headers['set-cookie'],
    },
    'Authentication response status: ${authResponse.status}'
  );

  // Better Auth typically returns 200 for successful sign-in
  if (authResponse.status !== 200) {
    const errorDetails = {
      status: authResponse.status,
      text: authResponse.text,
      body: authResponse.body,
    };
    testLogger.error(errorDetails, `Authentication failed for ${testUser.email}:`);
    throw new Error(
      `Authentication failed: ${authResponse.status} ${JSON.stringify(errorDetails)}`
    );
  }

  testLogger.info(`Successfully created authenticated agent for ${testUser.email}`);
  return agent;
}
