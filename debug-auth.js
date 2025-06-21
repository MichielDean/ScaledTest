const axios = require('axios');

async function testAuth() {
  try {
    console.log('Testing Keycloak authentication...');

    const tokenUrl = 'http://localhost:8080/realms/scaledtest/protocol/openid-connect/token';
    console.log('Token URL:', tokenUrl);

    const response = await axios.post(
      tokenUrl,
      new URLSearchParams({
        grant_type: 'password',
        client_id: 'scaledtest-client',
        username: 'maintainer@example.com',
        password: 'password',
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    console.log('Authentication successful!');
    console.log('Token:', response.data.access_token.substring(0, 50) + '...');
  } catch (error) {
    console.error('Authentication failed:');
    console.error('Status:', error.response?.status);
    console.error('Status Text:', error.response?.statusText);
    console.error('Data:', error.response?.data);
    console.error('URL:', error.config?.url);
  }
}

testAuth();
