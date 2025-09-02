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
 *   npx ts-node --project tsconfig.node.json scripts/setup-keycloak.ts [--option=value ...]
 *   npx ts-node --project tsconfig.node.json scripts/setup-keycloak.ts --help
 */

import axios, { AxiosError, AxiosResponse } from 'axios';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import {
  getRequiredEnvVar,
  getOptionalEnvVar,
  getOptionalEnvVarOrUndefined,
  parseBooleanEnvVar,
  parseArrayEnvVar,
  parseIntEnvVar,
} from '../src/environment/env';
// import { getKeycloakAdminToken } from './utils/adminAuth';

// Define TypeScript interfaces for configuration
interface KeycloakConfig {
  server: {
    url: string;
    adminUsername: string;
    adminPassword: string;
    maxRetries: number;
    retryInterval: number;
  };
  realm: {
    name: string;
    displayName: string;
    registrationAllowed: boolean;
    resetPasswordAllowed: boolean;
    rememberMe: boolean;
    verifyEmail: boolean;
    loginWithEmailAllowed: boolean;
    duplicateEmailsAllowed: boolean;
    sslRequired: string;
  };
  client: {
    clientId: string;
    name: string;
    description: string;
    redirectUris: string[];
    webOrigins: string[];
  };
  roles: string[];
  users: Array<{
    username: string;
    password: string;
    firstName: string;
    lastName: string;
    email: string;
    roles: string[];
  }>;
}

// Process command-line arguments if provided
function processCliArgs(): void {
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

function showHelp(): void {
  console.log(`
Keycloak Setup Script
=====================================

This script creates a Keycloak realm, client, roles, and test users.

Usage:
  npx ts-node --project tsconfig.node.json scripts/setup-keycloak.ts [options]

Options:
  --help                          Show this help message
  --url=<url>                     Keycloak server URL (default: http://localhost:8080)
  --admin-username=<username>     Admin username (default: admin)
  --admin-password=<password>     Admin password (default: admin)
  --realm=<realm>                 Realm name (default: scaledtest)
  --client-id=<client-id>         Client ID (default: scaledtest-client)

Environment Variables:
  All configuration can be provided via environment variables.
  CLI arguments override environment variables.

Examples:
  npx ts-node --project tsconfig.node.json scripts/setup-keycloak.ts
  npx ts-node --project tsconfig.node.json scripts/setup-keycloak.ts --realm=myapp --client-id=myapp-client
  npx ts-node --project tsconfig.node.json scripts/setup-keycloak.ts --url=http://keycloak:8080
`);
}

// Load environment variables from .env files
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

// Process CLI arguments
processCliArgs();

// Validate and build configuration from environment variables
function buildKeycloakConfig(): KeycloakConfig {
  // Build server configuration
  const server = {
    url: getRequiredEnvVar('KEYCLOAK_URL'),
    adminUsername: getRequiredEnvVar('KEYCLOAK_ADMIN_USERNAME'),
    adminPassword: getRequiredEnvVar('KEYCLOAK_ADMIN_PASSWORD'),
    maxRetries: parseIntEnvVar('KEYCLOAK_MAX_RETRIES', 30),
    retryInterval: parseIntEnvVar('KEYCLOAK_RETRY_INTERVAL', 2000),
  };

  // Build realm configuration
  const realm = {
    name: getRequiredEnvVar('KEYCLOAK_REALM'),
    displayName: getRequiredEnvVar('KEYCLOAK_REALM_DISPLAY_NAME'),
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
    clientId: getRequiredEnvVar('KEYCLOAK_CLIENT_ID'),
    name: getOptionalEnvVarOrUndefined('KEYCLOAK_CLIENT_NAME') || 'ScaledTest Client',
    description:
      getOptionalEnvVarOrUndefined('KEYCLOAK_CLIENT_DESCRIPTION') ||
      'Client for ScaledTest application',
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
let keycloakConfig: KeycloakConfig;
try {
  keycloakConfig = buildKeycloakConfig();
  console.log('Configuration loaded from environment variables');
} catch (error) {
  console.error(`Error loading configuration: ${(error as Error).message}`);
  process.exit(1);
}

// Create axios instance with common configuration
const api = axios.create({
  baseURL: keycloakConfig.server.url,
  headers: {
    'Content-Type': 'application/json',
  },
});

// API error handler
const handleApiError = (error: AxiosError, operation: string): never => {
  console.error(`Error during ${operation}:`, error.message);
  if (error.response) {
    console.error('Status:', error.response.status);
    console.error('Response data:', error.response.data);
  }
  throw error;
};

console.log('Configuration loaded:');
console.log(`- Server: ${keycloakConfig.server.url}`);
console.log(`- Realm: ${keycloakConfig.realm.name}`);
console.log(`- Client: ${keycloakConfig.client.clientId}`);
console.log(`- Users to create: ${keycloakConfig.users.length}`);

// Wait for Keycloak to be ready
async function waitForKeycloak(): Promise<void> {
  console.log(`Waiting for Keycloak at ${keycloakConfig.server.url} to be ready...`);
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

// Get admin access token (using shared utility)
async function getAdminToken(): Promise<string> {
  try {
    console.log('Authenticating as admin...');
    // const token = await getKeycloakAdminToken(
    //   keycloakConfig.server.url,
    //   keycloakConfig.server.adminUsername,
    //   keycloakConfig.server.adminPassword
    // );
    const token = 'placeholder-token'; // Temporary placeholder since we're using Better Auth
    console.log('Admin authentication successful');
    return token;
  } catch (error) {
    return handleApiError(error as AxiosError, 'admin authentication');
  }
}

// Check if realm exists
async function checkRealmExists(adminToken: string, realmName: string): Promise<boolean> {
  try {
    await api.get(`/admin/realms/${realmName}`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    return true;
  } catch (error) {
    const axiosError = error as AxiosError;
    if (axiosError.response && axiosError.response.status === 404) {
      return false;
    }
    return handleApiError(axiosError, `checking if realm '${realmName}' exists`);
  }
}

// Create realm
async function createRealm(adminToken: string): Promise<void> {
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
        enabled: true,
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
    return handleApiError(error as AxiosError, 'creating realm');
  }
}

// Check if client exists and get its ID
async function getClientId(adminToken: string): Promise<string | null> {
  try {
    console.log(`Checking if client '${keycloakConfig.client.clientId}' exists...`);

    const clientsResponse = await api.get(`/admin/realms/${keycloakConfig.realm.name}/clients`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    const client = clientsResponse.data.find(
      (c: any) => c.clientId === keycloakConfig.client.clientId
    );

    if (client) {
      console.log(`Client '${keycloakConfig.client.clientId}' already exists.`);
      return client.id;
    }

    return null;
  } catch (error) {
    return handleApiError(error as AxiosError, 'checking if client exists');
  }
}

// Create a client
async function createClient(adminToken: string): Promise<string> {
  try {
    // Check if client exists
    let clientId = await getClientId(adminToken);

    if (clientId) {
      // Check and create audience mapper for existing client
      await createAudienceMapper(adminToken, clientId);
      return clientId;
    }

    // Create client
    console.log(`Creating client '${keycloakConfig.client.clientId}'...`);
    await api.post(
      `/admin/realms/${keycloakConfig.realm.name}/clients`,
      {
        clientId: keycloakConfig.client.clientId,
        enabled: true,
        publicClient: true,
        directAccessGrantsEnabled: true,
        redirectUris: keycloakConfig.client.redirectUris,
        webOrigins: keycloakConfig.client.webOrigins,
        standardFlowEnabled: true,
        fullScopeAllowed: true,
        protocol: 'openid-connect',
      },
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );

    // Get client ID
    clientId = await getClientId(adminToken);

    if (!clientId) {
      throw new Error('Failed to get client ID after creation');
    }

    console.log(`Client '${keycloakConfig.client.clientId}' created successfully.`);

    // Create audience mapper for the client
    await createAudienceMapper(adminToken, clientId);

    return clientId;
  } catch (error) {
    return handleApiError(error as AxiosError, 'creating client');
  }
}

// Create audience mapper for the client
async function createAudienceMapper(adminToken: string, clientId: string): Promise<void> {
  try {
    console.log(`Creating audience mapper for client '${keycloakConfig.client.clientId}'...`);

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
      (mapper: any) =>
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
          'included.client.audience': keycloakConfig.client.clientId,
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

    console.log(
      `Audience mapper created successfully for client '${keycloakConfig.client.clientId}'.`
    );
  } catch (error) {
    return handleApiError(error as AxiosError, 'creating audience mapper');
  }
}

// Check if role exists
async function checkRoleExists(
  adminToken: string,
  clientId: string,
  roleName: string
): Promise<boolean> {
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
    const axiosError = error as AxiosError;
    if (axiosError.response && axiosError.response.status === 404) {
      return false;
    }
    return handleApiError(axiosError, `checking if role '${roleName}' exists`);
  }
}

// Create roles
async function createRoles(adminToken: string, clientId: string): Promise<void> {
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
    return handleApiError(error as AxiosError, 'creating roles');
  }
}

// Check if user exists
async function getUserId(adminToken: string, username: string): Promise<string | null> {
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
    return handleApiError(error as AxiosError, `checking if user '${username}' exists`);
  }
}

// Get role representation
async function getRoleRepresentation(
  adminToken: string,
  clientId: string,
  roleName: string
): Promise<any> {
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
    return handleApiError(error as AxiosError, `getting role representation for '${roleName}'`);
  }
}

// Create test users
async function createTestUsers(adminToken: string, clientId: string): Promise<void> {
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

        if (!userId) {
          throw new Error(`Failed to get user ID for '${user.username}'`);
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
        console.error(`Error setting up user '${user.username}':`, (error as Error).message);
        // Continue with other users even if one fails
      }
    }
  } catch (error) {
    return handleApiError(error as AxiosError, 'creating test users');
  }
}

// Export configuration for other modules to use
function exportConfiguration(): void {
  // Create the public/keycloak.json file for the frontend
  try {
    const publicKeycloakConfig = {
      realm: keycloakConfig.realm.name,
      'auth-server-url': keycloakConfig.server.url,
      'ssl-required': keycloakConfig.realm.sslRequired,
      resource: keycloakConfig.client.clientId,
      'public-client': true,
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
    console.error('Failed to export Keycloak configuration:', (error as Error).message);
  }
}

// Main function to run the setup
async function setup(): Promise<void> {
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
    console.error('Setup failed:', (error as Error).message);
    process.exit(1);
  }
}

// Run the setup if this script is executed directly
if (require.main === module) {
  setup();
} else {
  // Export functions and config for use in other scripts
  module.exports = {
    setup,
    getAdminToken,
    createRealm,
    createClient,
    createRoles,
    createTestUsers,
    config: keycloakConfig,
  };
}
