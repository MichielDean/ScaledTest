import Keycloak from 'keycloak-js';
import { authLogger as logger } from '../utils/logger';
import keycloakConfig, { UserRole as ConfigUserRole } from '../config/keycloak';

// Log configuration for debugging
if (typeof window !== 'undefined') {
  logger.info(
    {
      url: keycloakConfig.url,
      realm: keycloakConfig.realm,
      clientId: keycloakConfig.clientId,
    },
    'Keycloak configuration'
  );
}

// Singleton instance of Keycloak
let keycloak: Keycloak | null = null;

export const initKeycloak = (): Keycloak => {
  if (keycloak) {
    return keycloak;
  }

  if (typeof window !== 'undefined') {
    keycloak = new Keycloak(keycloakConfig);
    return keycloak;
  }

  throw new Error('Keycloak can only be initialized in the browser');
};

// Helper function to get the initialized keycloak instance
export const getKeycloakInstance = (): Keycloak => {
  if (!keycloak) {
    return initKeycloak();
  }
  return keycloak;
};

// Re-export the UserRole from the centralized config
export import UserRole = ConfigUserRole;

// Check if the user has a specific role
export const hasRole = (role: UserRole): boolean => {
  const instance = getKeycloakInstance();
  return instance.authenticated === true ? instance.hasResourceRole(role) : false;
};

// Check if the user has read access
export const hasReadAccess = (): boolean => {
  return getKeycloakInstance().authenticated === true;
};

// Check if the user has write access (maintainer or owner)
export const hasWriteAccess = (): boolean => {
  return hasRole(UserRole.MAINTAINER) || hasRole(UserRole.OWNER);
};

// Check if the user has full access (owner)
export const hasFullAccess = (): boolean => {
  return hasRole(UserRole.OWNER);
};

export default keycloakConfig;
