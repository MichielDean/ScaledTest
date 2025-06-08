'use strict';
// src/config/keycloak.ts
/**
 * Centralized Keycloak Configuration
 *
 * This module provides a single source of truth for all Keycloak configuration values.
 * It can be used on both client and server-side.
 */
Object.defineProperty(exports, '__esModule', { value: true });
exports.keycloakJsonConfig =
  exports.keycloakEndpoints =
  exports.UserRole =
  exports.keycloakAdminConfig =
  exports.keycloakConfig =
    void 0;
// Base Keycloak configuration
exports.keycloakConfig = {
  // Base URL of the Keycloak server
  url: process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'http://localhost:8080',
  // Realm name
  realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM || 'scaledtest',
  // Client ID
  clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || 'scaledtest-client',
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
exports.keycloakAdminConfig = {
  username: process.env.KEYCLOAK_ADMIN_USERNAME || 'admin',
  password: process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin',
};
// User roles
var UserRole;
(function (UserRole) {
  UserRole['READONLY'] = 'readonly';
  UserRole['MAINTAINER'] = 'maintainer';
  UserRole['OWNER'] = 'owner';
})(UserRole || (exports.UserRole = UserRole = {}));
// URL endpoints
exports.keycloakEndpoints = {
  // OpenID Connect endpoints for the configured realm
  token: `${exports.keycloakConfig.url}/realms/${exports.keycloakConfig.realm}/protocol/openid-connect/token`,
  userInfo: `${exports.keycloakConfig.url}/realms/${exports.keycloakConfig.realm}/protocol/openid-connect/userinfo`,
  logout: `${exports.keycloakConfig.url}/realms/${exports.keycloakConfig.realm}/protocol/openid-connect/logout`,
  jwks: `${exports.keycloakConfig.url}/realms/${exports.keycloakConfig.realm}/protocol/openid-connect/certs`,
  // Admin API endpoints
  adminToken: `${exports.keycloakConfig.url}/realms/master/protocol/openid-connect/token`,
  users: `${exports.keycloakConfig.url}/admin/realms/${exports.keycloakConfig.realm}/users`,
  clients: `${exports.keycloakConfig.url}/admin/realms/${exports.keycloakConfig.realm}/clients`,
  // Helper function to get the client roles endpoint for a user
  getUserClientRolesEndpoint: (userId, clientId) =>
    `${exports.keycloakConfig.url}/admin/realms/${exports.keycloakConfig.realm}/users/${userId}/role-mappings/clients/${clientId}`,
  // Helper function to get the client roles endpoint
  getClientRolesEndpoint: clientId =>
    `${exports.keycloakConfig.url}/admin/realms/${exports.keycloakConfig.realm}/clients/${clientId}/roles`,
  // Helper function to get a specific client role endpoint
  getClientRoleEndpoint: (clientId, roleName) =>
    `${exports.keycloakConfig.url}/admin/realms/${exports.keycloakConfig.realm}/clients/${clientId}/roles/${roleName}`,
};
// JSON representation for keycloak.json file
exports.keycloakJsonConfig = {
  realm: exports.keycloakConfig.realm,
  'auth-server-url': exports.keycloakConfig.url,
  'ssl-required': exports.keycloakConfig.sslRequired,
  resource: exports.keycloakConfig.clientId,
  'public-client': exports.keycloakConfig.publicClient,
  'confidential-port': exports.keycloakConfig.confidentialPort,
};
exports.default = exports.keycloakConfig;
