/**
 * Centralized Keycloak Configuration
 *
 * This module provides a single source of truth for all Keycloak configuration values.
 * It can be used on both client and server-side.
 */

import { KeycloakConfig } from 'keycloak-js';

// Official Keycloak client configuration
export const keycloakConfig: KeycloakConfig = {
  // Base URL of the Keycloak server
  url: process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'http://localhost:8080',

  // Realm name
  realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM || 'scaledtest',

  // Client ID
  clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || 'scaledtest-client',
};

// Additional configuration for legacy compatibility and admin operations
export const keycloakExtendedConfig = {
  // SSL Required setting
  sslRequired: 'external',

  // Client is public
  publicClient: true,

  // Confidential port
  confidentialPort: 0,

  // App base URL
  appBaseUrl: process.env.NEXT_PUBLIC_APP_BASE_URL || 'http://localhost:3000',
};

// Admin credentials for server-side operations
export const keycloakAdminConfig = {
  username: process.env.KEYCLOAK_ADMIN_USERNAME || 'admin',
  password: process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin',
};

// User roles
export enum UserRole {
  READONLY = 'readonly',
  MAINTAINER = 'maintainer',
  OWNER = 'owner',
}

// URL endpoints
export const keycloakEndpoints = {
  // OpenID Connect endpoints for the configured realm
  token: `${keycloakConfig.url}/realms/${keycloakConfig.realm}/protocol/openid-connect/token`,
  userInfo: `${keycloakConfig.url}/realms/${keycloakConfig.realm}/protocol/openid-connect/userinfo`,
  logout: `${keycloakConfig.url}/realms/${keycloakConfig.realm}/protocol/openid-connect/logout`,
  jwks: `${keycloakConfig.url}/realms/${keycloakConfig.realm}/protocol/openid-connect/certs`,

  // Admin API endpoints
  adminToken: `${keycloakConfig.url}/realms/master/protocol/openid-connect/token`,
  users: `${keycloakConfig.url}/admin/realms/${keycloakConfig.realm}/users`,
  clients: `${keycloakConfig.url}/admin/realms/${keycloakConfig.realm}/clients`,

  // Helper function to get the client roles endpoint for a user
  getUserClientRolesEndpoint: (userId: string, clientId: string) =>
    `${keycloakConfig.url}/admin/realms/${keycloakConfig.realm}/users/${userId}/role-mappings/clients/${clientId}`,

  // Helper function to get the client roles endpoint
  getClientRolesEndpoint: (clientId: string) =>
    `${keycloakConfig.url}/admin/realms/${keycloakConfig.realm}/clients/${clientId}/roles`,

  // Helper function to get a specific client role endpoint
  getClientRoleEndpoint: (clientId: string, roleName: string) =>
    `${keycloakConfig.url}/admin/realms/${keycloakConfig.realm}/clients/${clientId}/roles/${roleName}`,
};

// JSON representation for keycloak.json file (legacy format)
export const keycloakJsonConfig = {
  realm: keycloakConfig.realm,
  'auth-server-url': keycloakConfig.url,
  'ssl-required': keycloakExtendedConfig.sslRequired,
  resource: keycloakConfig.clientId,
  'public-client': keycloakExtendedConfig.publicClient,
  'confidential-port': keycloakExtendedConfig.confidentialPort,
};

export default keycloakConfig;
