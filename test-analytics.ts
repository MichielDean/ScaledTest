#!/usr/bin/env node

/**
 * Test the analytics endpoint
 */

(async () => {
  process.env.OPENSEARCH_HOST = 'http://localhost:9200';
  process.env.OPENSEARCH_USERNAME = 'admin';
  process.env.OPENSEARCH_PASSWORD = 'admin';
  process.env.OPENSEARCH_SSL_VERIFY = 'false';

  const { getAuthToken } = await import('./tests/authentication/tokenService.js');

  try {
    const token = await getAuthToken('readonly@example.com', 'password');
    console.log('Got token for readonly user');

    const response = await fetch('http://localhost:3002/api/analytics/test-suite-overview', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    console.log('Response status:', response.status);

    if (!response.ok) {
      const text = await response.text();
      console.error('Response text:', text);
    } else {
      const result = await response.json();
      console.log('Result:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    const err = error as Error;
    console.error('Error:', err.message);
  }

  process.exit(0);
})();
