'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.hasFullAccess =
  exports.hasWriteAccess =
  exports.hasReadAccess =
  exports.hasRole =
  exports.UserRole =
  exports.getKeycloakInstance =
  exports.initKeycloak =
    void 0;
const keycloak_js_1 = require('keycloak-js');
const logger_1 = require('../utils/logger');
const keycloak_1 = require('../config/keycloak');
// Log configuration for debugging
if (typeof window !== 'undefined') {
  logger_1.authLogger.info(
    {
      url: keycloak_1.default.url,
      realm: keycloak_1.default.realm,
      clientId: keycloak_1.default.clientId,
    },
    'Keycloak configuration'
  );
}
// Singleton instance of Keycloak
let keycloak = null;
const initKeycloak = () => {
  if (keycloak) {
    return keycloak;
  }
  if (typeof window !== 'undefined') {
    keycloak = new keycloak_js_1.default(keycloak_1.default);
    return keycloak;
  }
  throw new Error('Keycloak can only be initialized in the browser');
};
exports.initKeycloak = initKeycloak;
// Helper function to get the initialized keycloak instance
const getKeycloakInstance = () => {
  if (!keycloak) {
    return (0, exports.initKeycloak)();
  }
  return keycloak;
};
exports.getKeycloakInstance = getKeycloakInstance;
// Re-export the UserRole from the centralized config
exports.UserRole = keycloak_1.UserRole;
// Check if the user has a specific role
const hasRole = role => {
  const instance = (0, exports.getKeycloakInstance)();
  return instance.authenticated === true ? instance.hasResourceRole(role) : false;
};
exports.hasRole = hasRole;
// Check if the user has read access
const hasReadAccess = () => {
  return (0, exports.getKeycloakInstance)().authenticated === true;
};
exports.hasReadAccess = hasReadAccess;
// Check if the user has write access (maintainer or owner)
const hasWriteAccess = () => {
  return (
    (0, exports.hasRole)(exports.UserRole.MAINTAINER) ||
    (0, exports.hasRole)(exports.UserRole.OWNER)
  );
};
exports.hasWriteAccess = hasWriteAccess;
// Check if the user has full access (owner)
const hasFullAccess = () => {
  return (0, exports.hasRole)(exports.UserRole.OWNER);
};
exports.hasFullAccess = hasFullAccess;
exports.default = keycloak_1.default;
