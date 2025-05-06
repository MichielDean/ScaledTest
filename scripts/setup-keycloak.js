/**
 * Keycloak Setup Script
 * 
 * This script creates a new realm, client, roles, and test users in Keycloak.
 * Run this script after the Keycloak server is started to set up the environment.
 */

const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config({ path: './.env.local' });

// Keycloak configuration
const keycloakConfig = {
  baseUrl: process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'http://localhost:8080',
  realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM || 'scaledtest4',
  clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || 'scaledtest4-client',
  adminUser: 'admin',
  adminPassword: 'admin',
  redirectUris: [
    'http://localhost:3000/*'
  ],
  testUsers: [
    {
      username: 'readonly-user',
      password: 'password',
      firstName: 'Read',
      lastName: 'Only',
      email: 'readonly@example.com',
      roles: ['readonly']
    },
    {
      username: 'maintainer-user',
      password: 'password',
      firstName: 'Maintainer',
      lastName: 'User',
      email: 'maintainer@example.com',
      roles: ['readonly', 'maintainer']
    },
    {
      username: 'owner-user',
      password: 'password',
      firstName: 'Owner',
      lastName: 'User',
      email: 'owner@example.com',
      roles: ['readonly', 'maintainer', 'owner']
    }
  ]
};

// Get admin access token
async function getAdminToken() {
  try {
    const response = await axios.post(
      `${keycloakConfig.baseUrl}/realms/master/protocol/openid-connect/token`,
      new URLSearchParams({
        'grant_type': 'password',
        'client_id': 'admin-cli',
        'username': keycloakConfig.adminUser,
        'password': keycloakConfig.adminPassword
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    return response.data.access_token;
  } catch (error) {
    console.error('Failed to get admin token:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

// Check if realm exists
async function checkRealmExists(adminToken) {
  try {
    await axios.get(
      `${keycloakConfig.baseUrl}/admin/realms/${keycloakConfig.realm}`,
      {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      }
    );
    return true;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return false;
    }
    throw error;
  }
}

// Create a new realm
async function createRealm(adminToken) {
  try {
    const realmExists = await checkRealmExists(adminToken);
    
    if (realmExists) {
      console.log(`Realm '${keycloakConfig.realm}' already exists.`);
      return;
    }
    
    await axios.post(
      `${keycloakConfig.baseUrl}/admin/realms`,
      {
        realm: keycloakConfig.realm,
        enabled: true,
        displayName: 'ScaledTest4 Realm',
        registrationAllowed: true,
        resetPasswordAllowed: true,
        rememberMe: true,
        verifyEmail: false,
        loginWithEmailAllowed: true,
        duplicateEmailsAllowed: false,
        sslRequired: 'external'
      },
      {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`Realm '${keycloakConfig.realm}' created successfully.`);
  } catch (error) {
    console.error('Failed to create realm:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

// Create a client
async function createClient(adminToken) {
  try {
    // Check if client exists
    try {
      const clientsResponse = await axios.get(
        `${keycloakConfig.baseUrl}/admin/realms/${keycloakConfig.realm}/clients`,
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`
          }
        }
      );
      
      const client = clientsResponse.data.find(c => c.clientId === keycloakConfig.clientId);
      
      if (client) {
        console.log(`Client '${keycloakConfig.clientId}' already exists.`);
        return client.id;
      }
    } catch (error) {
      // If error, continue to create client
      console.error('Error checking for client:', error.message);
    }
    
    // Create client
    await axios.post(
      `${keycloakConfig.baseUrl}/admin/realms/${keycloakConfig.realm}/clients`,
      {
        clientId: keycloakConfig.clientId,
        enabled: true,
        publicClient: true,
        directAccessGrantsEnabled: true,
        redirectUris: keycloakConfig.redirectUris,
        webOrigins: ['*'],
        standardFlowEnabled: true,
        fullScopeAllowed: true,
        protocol: 'openid-connect'
      },
      {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    // Get client ID
    const clientsResponse = await axios.get(
      `${keycloakConfig.baseUrl}/admin/realms/${keycloakConfig.realm}/clients`,
      {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      }
    );
    
    const client = clientsResponse.data.find(c => c.clientId === keycloakConfig.clientId);
    
    console.log(`Client '${keycloakConfig.clientId}' created successfully.`);
    return client.id;
  } catch (error) {
    console.error('Failed to create client:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

// Create roles
async function createRoles(adminToken, clientId) {
  try {
    const roles = ['readonly', 'maintainer', 'owner'];
    
    for (const role of roles) {
      try {
        // Check if role exists
        try {
          await axios.get(
            `${keycloakConfig.baseUrl}/admin/realms/${keycloakConfig.realm}/clients/${clientId}/roles/${role}`,
            {
              headers: {
                'Authorization': `Bearer ${adminToken}`
              }
            }
          );
          console.log(`Role '${role}' already exists.`);
          continue;
        } catch (error) {
          // If 404, create role
          if (error.response && error.response.status !== 404) {
            throw error;
          }
        }
        
        // Create role
        await axios.post(
          `${keycloakConfig.baseUrl}/admin/realms/${keycloakConfig.realm}/clients/${clientId}/roles`,
          {
            name: role,
            description: `${role} role for the application`
          },
          {
            headers: {
              'Authorization': `Bearer ${adminToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        console.log(`Role '${role}' created successfully.`);
      } catch (error) {
        console.error(`Failed to create role '${role}':`, error.message);
        if (error.response) {
          console.error('Response data:', error.response.data);
        }
      }
    }
  } catch (error) {
    console.error('Failed to create roles:', error.message);
    throw error;
  }
}

// Create test users
async function createTestUsers(adminToken, clientId) {
  try {
    for (const user of keycloakConfig.testUsers) {
      try {
        // Check if user exists
        try {
          const usersResponse = await axios.get(
            `${keycloakConfig.baseUrl}/admin/realms/${keycloakConfig.realm}/users?username=${user.username}`,
            {
              headers: {
                'Authorization': `Bearer ${adminToken}`
              }
            }
          );
          
          if (usersResponse.data.length > 0) {
            console.log(`User '${user.username}' already exists.`);
            continue;
          }
        } catch (error) {
          // If error, continue to create user
          console.error(`Error checking for user '${user.username}':`, error.message);
        }
        
        // Create user
        const userResponse = await axios.post(
          `${keycloakConfig.baseUrl}/admin/realms/${keycloakConfig.realm}/users`,
          {
            username: user.username,
            enabled: true,
            emailVerified: true,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            credentials: [
              {
                type: 'password',
                value: user.password,
                temporary: false
              }
            ]
          },
          {
            headers: {
              'Authorization': `Bearer ${adminToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        // Get user ID
        const usersResponse = await axios.get(
          `${keycloakConfig.baseUrl}/admin/realms/${keycloakConfig.realm}/users?username=${user.username}`,
          {
            headers: {
              'Authorization': `Bearer ${adminToken}`
            }
          }
        );
        
        const userId = usersResponse.data[0].id;
        
        // Assign roles to user
        for (const role of user.roles) {
          // Get role representation
          const roleResponse = await axios.get(
            `${keycloakConfig.baseUrl}/admin/realms/${keycloakConfig.realm}/clients/${clientId}/roles/${role}`,
            {
              headers: {
                'Authorization': `Bearer ${adminToken}`
              }
            }
          );
          
          const roleRepresentation = roleResponse.data;
          
          // Assign role to user
          await axios.post(
            `${keycloakConfig.baseUrl}/admin/realms/${keycloakConfig.realm}/users/${userId}/role-mappings/clients/${clientId}`,
            [roleRepresentation],
            {
              headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
              }
            }
          );
        }
        
        console.log(`User '${user.username}' created successfully with roles: ${user.roles.join(', ')}`);
      } catch (error) {
        console.error(`Failed to create user '${user.username}':`, error.message);
        if (error.response) {
          console.error('Response data:', error.response.data);
        }
      }
    }
  } catch (error) {
    console.error('Failed to create test users:', error.message);
    throw error;
  }
}

// Main function to run the setup
async function setup() {
  try {
    console.log('Setting up Keycloak...');
    
    // Wait for Keycloak to start
    console.log('Waiting for Keycloak to start...');
    let keycloakReady = false;
    let retries = 0;
    
    while (!keycloakReady && retries < 30) {
      try {
        await axios.get(`${keycloakConfig.baseUrl}`);
        keycloakReady = true;
      } catch (error) {
        console.log('Keycloak not ready yet, waiting...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        retries++;
      }
    }
    
    if (!keycloakReady) {
      throw new Error('Keycloak failed to start after multiple retries');
    }
    
    // Get admin token
    const adminToken = await getAdminToken();
    
    // Create realm
    await createRealm(adminToken);
    
    // Create client
    const clientId = await createClient(adminToken);
    
    // Create roles
    await createRoles(adminToken, clientId);
    
    // Create test users
    await createTestUsers(adminToken, clientId);
    
    console.log('Keycloak setup completed successfully!');
    console.log('\nTest users created:');
    keycloakConfig.testUsers.forEach(user => {
      console.log(`- Username: ${user.username}, Password: ${user.password}, Roles: ${user.roles.join(', ')}`);
    });
    
  } catch (error) {
    console.error('Setup failed:', error.message);
    process.exit(1);
  }
}

// Run the setup
setup();