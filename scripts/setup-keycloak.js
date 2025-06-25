/**
 * Keycloak Setup Script
 *
 * This script creates a new realm, client, roles, and test users in Keycloak.
 * Run this script after the Keycloak server is started to set up the environment.
 *
 * Configuration is loaded from environment variables only:
 * - .env.local
 * - .env
 *
 * All required configuration values must be provided in environment variables.
 *
 * CLI Usage:
 *   node setup-keycloak.js [--option=value ...]
 *   node setup-keycloak.js --help
 */

import axios from 'axios';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import {
  getRequiredEnvVar,
  getOptionalEnvVarOrUndefined,
  parseBooleanEnvVar,
  parseArrayEnvVar,
  parseIntEnvVar,
} from './environment/variableHandling.js';
import { getKeycloakAdminToken } from './keycloak/adminAuthentication.js';

// Process command-line arguments if provided
function processCliArgs() {
  const args = process.argv.slice(2);

  // Check for help
  if (args.includes('--help')) {
    showHelp();
    process.exit(0);
  }

  // Process arguments
  args.forEach(arg => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.substring(2).split('=');
      if (value) {
        // Convert key from kebab-case to environment variable format
        const envKey = 'KEYCLOAK_' + key.toUpperCase().replace(/-/g, '_');
        process.env[envKey] = value;
      }
    }
  });
}

// Display help information
function showHelp() {
  console.log(`
Keycloak Setup Script

Usage:
  node setup-keycloak.js [options]

Required Options:
  --url=URL                  Keycloak server URL
  --admin-user=USERNAME      Admin username
  --admin-password=PASSWORD  Admin password
  --realm=REALM              Realm name
  --realm-display-name=NAME  Realm display name
  --client-id=CLIENT_ID      Client ID

Optional Options:
  --redirect-uris=URIs       Comma-separated redirect URIs (default: http://localhost:3000/*)
  --web-origins=ORIGINS      Comma-separated web origins (default: *)
  --roles=ROLES              Comma-separated role names (default: readonly,maintainer,owner)
  --registration-allowed=BOOL Enable/disable registration (default: true)
  --reset-password-allowed=BOOL Enable/disable password reset (default: true)
  --remember-me=BOOL         Enable/disable remember me feature (default: true)
  --verify-email=BOOL        Enable/disable email verification (default: false)
  --login-with-email=BOOL    Enable/disable login with email (default: true)
  --max-retries=NUM          Maximum number of connection retries (default: 30)
  --retry-interval=MS        Retry interval in milliseconds (default: 2000)
  --help                     Show this help information

User Creation Examples:
  # To create a readonly user:
  --readonly-user-username=USERNAME --readonly-user-password=PASSWORD

  # To create a maintainer user:
  --maintainer-user-username=USERNAME --maintainer-user-password=PASSWORD

  # To create an owner user:
  --owner-user-username=USERNAME --owner-user-password=PASSWORD

Example:
  node setup-keycloak.js --url=http://localhost:8080 --realm=scaledtest --client-id=scaledtest-client

Environment Configuration:
  Alternatively, you can set configuration via environment variables in .env files.
  CLI arguments will override environment variables.
  `);
}

// Process CLI arguments first (before loading .env files)
processCliArgs();

// Load environment variables from .env files
dotenv.config({ path: './.env.local' });
dotenv.config({ path: './.env' });

// Validate and build configuration from environment variables
function buildConfigFromEnv() {
  // Build server configuration
  const server = {
    baseUrl: getRequiredEnvVar('KEYCLOAK_URL'),
    adminUser: getRequiredEnvVar('KEYCLOAK_ADMIN_USERNAME'),
    adminPassword: getRequiredEnvVar('KEYCLOAK_ADMIN_PASSWORD'),
    maxRetries: parseIntEnvVar('KEYCLOAK_MAX_RETRIES', 30),
    retryInterval: parseIntEnvVar('KEYCLOAK_RETRY_INTERVAL', 2000),
  };

  // Build realm configuration
  const realm = {
    name: getRequiredEnvVar('KEYCLOAK_REALM'),
    displayName: getRequiredEnvVar('KEYCLOAK_REALM_DISPLAY_NAME'),
    enabled: true,
    registrationAllowed: parseBooleanEnvVar('KEYCLOAK_REGISTRATION_ALLOWED', true),
    resetPasswordAllowed: parseBooleanEnvVar('KEYCLOAK_RESET_PASSWORD_ALLOWED', true),
    rememberMe: parseBooleanEnvVar('KEYCLOAK_REMEMBER_ME', true),
    verifyEmail: parseBooleanEnvVar('KEYCLOAK_VERIFY_EMAIL', false),
    loginWithEmailAllowed: parseBooleanEnvVar('KEYCLOAK_LOGIN_WITH_EMAIL', true),
    duplicateEmailsAllowed: parseBooleanEnvVar('KEYCLOAK_DUPLICATE_EMAILS_ALLOWED', false),
    sslRequired: getOptionalEnvVarOrUndefined('KEYCLOAK_SSL_REQUIRED') || 'external',
  };

  // Build client configuration
  const client = {
    id: getRequiredEnvVar('KEYCLOAK_CLIENT_ID'),
    enabled: true,
    publicClient: true,
    directAccessGrantsEnabled: true,
    standardFlowEnabled: true,
    fullScopeAllowed: true,
    protocol: 'openid-connect',
    redirectUris: parseArrayEnvVar('KEYCLOAK_REDIRECT_URIS', ',', ['http://localhost:3000/*']),
    webOrigins: parseArrayEnvVar('KEYCLOAK_WEB_ORIGINS', ',', ['*']),
  };

  // Get roles
  const roles = parseArrayEnvVar('KEYCLOAK_ROLES', ',', ['readonly', 'maintainer', 'owner']);

  // Build users array
  const users = [];

  // Only add users if their username is defined
  if (process.env.KEYCLOAK_READONLY_USER_USERNAME) {
    users.push({
      username: getRequiredEnvVar('KEYCLOAK_READONLY_USER_USERNAME'),
      password: getRequiredEnvVar('KEYCLOAK_READONLY_USER_PASSWORD'),
      firstName: getOptionalEnvVarOrUndefined('KEYCLOAK_READONLY_USER_FIRSTNAME') || 'Read',
      lastName: getOptionalEnvVarOrUndefined('KEYCLOAK_READONLY_USER_LASTNAME') || 'Only',
      email:
        getOptionalEnvVarOrUndefined('KEYCLOAK_READONLY_USER_EMAIL') ||
        `${getRequiredEnvVar('KEYCLOAK_READONLY_USER_USERNAME')}@example.com`,
      roles: parseArrayEnvVar('KEYCLOAK_READONLY_USER_ROLES', ',', ['readonly']),
    });
  }

  if (process.env.KEYCLOAK_MAINTAINER_USER_USERNAME) {
    users.push({
      username: getRequiredEnvVar('KEYCLOAK_MAINTAINER_USER_USERNAME'),
      password: getRequiredEnvVar('KEYCLOAK_MAINTAINER_USER_PASSWORD'),
      firstName: getOptionalEnvVarOrUndefined('KEYCLOAK_MAINTAINER_USER_FIRSTNAME') || 'Maintainer',
      lastName: getOptionalEnvVarOrUndefined('KEYCLOAK_MAINTAINER_USER_LASTNAME') || 'User',
      email:
        getOptionalEnvVarOrUndefined('KEYCLOAK_MAINTAINER_USER_EMAIL') ||
        `${getRequiredEnvVar('KEYCLOAK_MAINTAINER_USER_USERNAME')}@example.com`,
      roles: parseArrayEnvVar('KEYCLOAK_MAINTAINER_USER_ROLES', ',', ['readonly', 'maintainer']),
    });
  }

  if (process.env.KEYCLOAK_OWNER_USER_USERNAME) {
    users.push({
      username: getRequiredEnvVar('KEYCLOAK_OWNER_USER_USERNAME'),
      password: getRequiredEnvVar('KEYCLOAK_OWNER_USER_PASSWORD'),
      firstName: getOptionalEnvVarOrUndefined('KEYCLOAK_OWNER_USER_FIRSTNAME') || 'Owner',
      lastName: getOptionalEnvVarOrUndefined('KEYCLOAK_OWNER_USER_LASTNAME') || 'User',
      email:
        getOptionalEnvVarOrUndefined('KEYCLOAK_OWNER_USER_EMAIL') ||
        `${getRequiredEnvVar('KEYCLOAK_OWNER_USER_USERNAME')}@example.com`,
      roles: parseArrayEnvVar('KEYCLOAK_OWNER_USER_ROLES', ',', [
        'readonly',
        'maintainer',
        'owner',
      ]),
    });
  }

  return {
    server,
    realm,
    client,
    roles,
    users,
  };
}

// Build configuration from environment variables
let keycloakConfig;
try {
  keycloakConfig = buildConfigFromEnv();
  console.log('Configuration loaded from environment variables');
} catch (error) {
  console.error(`Error loading configuration: ${error.message}`);
  process.exit(1);
}

// Create axios instance with common configuration
const api = axios.create({
  baseURL: keycloakConfig.server.baseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
});

// API error handler
const handleApiError = (error, operation) => {
  console.error(`Error during ${operation}:`, error.message);
  if (error.response) {
    console.error('Status:', error.response.status);
    console.error('Response data:', error.response.data);
  }
  throw error;
};

// Get admin access token (using shared utility)
async function getAdminToken() {
  try {
    console.log('Authenticating as admin...');
    const token = await getKeycloakAdminToken(
      keycloakConfig.server.baseUrl,
      keycloakConfig.server.adminUser,
      keycloakConfig.server.adminPassword
    );
    console.log('Admin authentication successful');
    return token;
  } catch (error) {
    return handleApiError(error, 'admin authentication');
  }
}

// Check if realm exists
async function checkRealmExists(adminToken, realmName) {
  try {
    await api.get(`/admin/realms/${realmName}`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    return true;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return false;
    }
    return handleApiError(error, `checking if realm '${realmName}' exists`);
  }
}

// Create a new realm
async function createRealm(adminToken) {
  try {
    console.log(`Checking if realm '${keycloakConfig.realm.name}' exists...`);
    const realmExists = await checkRealmExists(adminToken, keycloakConfig.realm.name);

    if (realmExists) {
      console.log(`Realm '${keycloakConfig.realm.name}' already exists.`);
      return;
    }

    console.log(`Creating realm '${keycloakConfig.realm.name}'...`);
    await api.post(
      '/admin/realms',
      {
        realm: keycloakConfig.realm.name,
        enabled: keycloakConfig.realm.enabled,
        displayName: keycloakConfig.realm.displayName,
        registrationAllowed: keycloakConfig.realm.registrationAllowed,
        resetPasswordAllowed: keycloakConfig.realm.resetPasswordAllowed,
        rememberMe: keycloakConfig.realm.rememberMe,
        verifyEmail: keycloakConfig.realm.verifyEmail,
        loginWithEmailAllowed: keycloakConfig.realm.loginWithEmailAllowed,
        duplicateEmailsAllowed: keycloakConfig.realm.duplicateEmailsAllowed,
        sslRequired: keycloakConfig.realm.sslRequired,
      },
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );

    console.log(`Realm '${keycloakConfig.realm.name}' created successfully.`);
  } catch (error) {
    return handleApiError(error, 'creating realm');
  }
}

// Check if client exists and get its ID
async function getClientId(adminToken) {
  try {
    console.log(`Checking if client '${keycloakConfig.client.id}' exists...`);

    const clientsResponse = await api.get(`/admin/realms/${keycloakConfig.realm.name}/clients`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    const client = clientsResponse.data.find(c => c.clientId === keycloakConfig.client.id);

    if (client) {
      console.log(`Client '${keycloakConfig.client.id}' already exists.`);
      return client.id;
    }

    return null;
  } catch (error) {
    return handleApiError(error, 'checking if client exists');
  }
}

// Create a client
async function createClient(adminToken) {
  try {
    // Check if client exists
    let clientId = await getClientId(adminToken);

    if (clientId) {
      // Check and create audience mapper for existing client
      await createAudienceMapper(adminToken, clientId);
      return clientId;
    }

    // Create client
    console.log(`Creating client '${keycloakConfig.client.id}'...`);
    await api.post(
      `/admin/realms/${keycloakConfig.realm.name}/clients`,
      {
        clientId: keycloakConfig.client.id,
        enabled: keycloakConfig.client.enabled,
        publicClient: keycloakConfig.client.publicClient,
        directAccessGrantsEnabled: keycloakConfig.client.directAccessGrantsEnabled,
        redirectUris: keycloakConfig.client.redirectUris,
        webOrigins: keycloakConfig.client.webOrigins,
        standardFlowEnabled: keycloakConfig.client.standardFlowEnabled,
        fullScopeAllowed: keycloakConfig.client.fullScopeAllowed,
        protocol: keycloakConfig.client.protocol,
      },
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );

    // Get client ID
    clientId = await getClientId(adminToken);

    console.log(`Client '${keycloakConfig.client.id}' created successfully.`);

    // Create audience mapper for the client
    await createAudienceMapper(adminToken, clientId);

    return clientId;
  } catch (error) {
    return handleApiError(error, 'creating client');
  }
}

// Create audience mapper for the client
async function createAudienceMapper(adminToken, clientId) {
  try {
    console.log(`Creating audience mapper for client '${keycloakConfig.client.id}'...`);

    // Check if audience mapper already exists
    const mappersResponse = await api.get(
      `/admin/realms/${keycloakConfig.realm.name}/clients/${clientId}/protocol-mappers/models`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );

    const existingMapper = mappersResponse.data.find(
      mapper =>
        mapper.name === 'audience-mapper' && mapper.protocolMapper === 'oidc-audience-mapper'
    );

    if (existingMapper) {
      console.log('Audience mapper already exists.');
      return;
    }

    // Create audience mapper
    await api.post(
      `/admin/realms/${keycloakConfig.realm.name}/clients/${clientId}/protocol-mappers/models`,
      {
        name: 'audience-mapper',
        protocol: 'openid-connect',
        protocolMapper: 'oidc-audience-mapper',
        consentRequired: false,
        config: {
          'included.client.audience': keycloakConfig.client.id,
          'id.token.claim': 'false',
          'access.token.claim': 'true',
          'introspection.token.claim': 'true',
        },
      },
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );

    console.log(`Audience mapper created successfully for client '${keycloakConfig.client.id}'.`);
  } catch (error) {
    return handleApiError(error, 'creating audience mapper');
  }
}

// Check if role exists
async function checkRoleExists(adminToken, clientId, roleName) {
  try {
    await api.get(
      `/admin/realms/${keycloakConfig.realm.name}/clients/${clientId}/roles/${roleName}`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );
    return true;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return false;
    }
    return handleApiError(error, `checking if role '${roleName}' exists`);
  }
}

// Create roles
async function createRoles(adminToken, clientId) {
  try {
    console.log('Creating roles...');

    for (const role of keycloakConfig.roles) {
      // Check if role exists
      const roleExists = await checkRoleExists(adminToken, clientId, role);

      if (roleExists) {
        console.log(`Role '${role}' already exists.`);
        continue;
      }

      // Create role
      console.log(`Creating role '${role}'...`);
      await api.post(
        `/admin/realms/${keycloakConfig.realm.name}/clients/${clientId}/roles`,
        {
          name: role,
          description: `${role} role for the application`,
        },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      console.log(`Role '${role}' created successfully.`);
    }
  } catch (error) {
    return handleApiError(error, 'creating roles');
  }
}

// Check if user exists
async function getUserId(adminToken, username) {
  try {
    const usersResponse = await api.get(
      `/admin/realms/${keycloakConfig.realm.name}/users?username=${username}`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );

    if (usersResponse.data.length > 0) {
      return usersResponse.data[0].id;
    }

    return null;
  } catch (error) {
    return handleApiError(error, `checking if user '${username}' exists`);
  }
}

// Get role representation
async function getRoleRepresentation(adminToken, clientId, roleName) {
  try {
    const roleResponse = await api.get(
      `/admin/realms/${keycloakConfig.realm.name}/clients/${clientId}/roles/${roleName}`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );

    return roleResponse.data;
  } catch (error) {
    return handleApiError(error, `getting role representation for '${roleName}'`);
  }
}

// Create test users
async function createTestUsers(adminToken, clientId) {
  try {
    console.log('Creating test users...');

    for (const user of keycloakConfig.users) {
      try {
        // Check if user exists
        let userId = await getUserId(adminToken, user.username);

        if (userId) {
          console.log(`User '${user.username}' already exists.`);
        } else {
          // Create user
          console.log(`Creating user '${user.username}'...`);
          await api.post(
            `/admin/realms/${keycloakConfig.realm.name}/users`,
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
                  temporary: false,
                },
              ],
            },
            {
              headers: {
                Authorization: `Bearer ${adminToken}`,
              },
            }
          );

          // Get user ID after creation
          userId = await getUserId(adminToken, user.username);
        }

        // Assign roles to user
        console.log(`Assigning roles to user '${user.username}'...`);
        for (const roleName of user.roles) {
          // Get role representation
          const roleRepresentation = await getRoleRepresentation(adminToken, clientId, roleName);

          // Assign role to user
          await api.post(
            `/admin/realms/${keycloakConfig.realm.name}/users/${userId}/role-mappings/clients/${clientId}`,
            [roleRepresentation],
            {
              headers: {
                Authorization: `Bearer ${adminToken}`,
              },
            }
          );
        }

        console.log(`User '${user.username}' setup completed with roles: ${user.roles.join(', ')}`);
      } catch (error) {
        console.error(`Error setting up user '${user.username}':`, error.message);
        // Continue with other users even if one fails
      }
    }
  } catch (error) {
    return handleApiError(error, 'creating test users');
  }
}

// Wait for Keycloak to be ready
async function waitForKeycloak() {
  console.log(`Waiting for Keycloak at ${keycloakConfig.server.baseUrl} to be ready...`);
  let keycloakReady = false;
  let retries = 0;

  while (!keycloakReady && retries < keycloakConfig.server.maxRetries) {
    try {
      await api.get('/');
      keycloakReady = true;
    } catch (error) {
      console.log(
        `Keycloak not ready yet (attempt ${retries + 1}/${keycloakConfig.server.maxRetries}), waiting...`
      );
      await new Promise(resolve => setTimeout(resolve, keycloakConfig.server.retryInterval));
      retries++;
    }
  }

  if (!keycloakReady) {
    throw new Error(`Keycloak failed to start after ${keycloakConfig.server.maxRetries} retries`);
  }

  console.log('Keycloak is ready');
}

// Export configuration for other modules to use
function exportConfiguration() {
  // Create the public/keycloak.json file for the frontend
  try {
    const publicKeycloakConfig = {
      realm: keycloakConfig.realm.name,
      'auth-server-url': keycloakConfig.server.baseUrl,
      'ssl-required': keycloakConfig.realm.sslRequired,
      resource: keycloakConfig.client.id,
      'public-client': keycloakConfig.client.publicClient,
      'confidential-port': 0,
    };

    // Ensure public directory exists
    const publicDir = path.resolve(process.cwd(), 'public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    // Write the configuration file
    fs.writeFileSync(
      path.resolve(publicDir, 'keycloak.json'),
      JSON.stringify(publicKeycloakConfig, null, 2)
    );

    console.log('Keycloak client configuration exported to public/keycloak.json');
  } catch (error) {
    console.error('Failed to export Keycloak configuration:', error.message);
  }
}

// Main function to run the setup
async function setup() {
  try {
    console.log('Starting Keycloak setup...');

    // Wait for Keycloak to be ready
    await waitForKeycloak();

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

    // Export configuration
    exportConfiguration();

    console.log('Keycloak setup completed successfully!');
    console.log('\nTest users created:');
    keycloakConfig.users.forEach(user => {
      console.log(
        `- Username: ${user.username}, Password: ${user.password}, Roles: ${user.roles.join(', ')}`
      );
    });
  } catch (error) {
    console.error('Setup failed:', error.message);
    process.exit(1);
  }
}

// Run the setup if this script is executed directly
if (
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith('setup-keycloak.js')
) {
  console.log('Script executed directly, starting setup...');
  setup().catch(error => {
    console.error('Setup failed:', error);
    process.exit(1);
  });
} else {
  console.log('Script imported as module, not running setup automatically');
}

// Export functions and config for use in other scripts
export {
  setup,
  getAdminToken,
  createRealm,
  createClient,
  createRoles,
  createTestUsers,
  keycloakConfig as config,
};
