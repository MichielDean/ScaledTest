import Keycloak from 'keycloak-js';

const keycloakConfig = {
  url: process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'http://localhost:8080',
  realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM || 'scaledtest',
  clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || 'scaledtest-client',
};

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

// User roles defined in Keycloak
export enum UserRole {
  READONLY = 'readonly',
  MAINTAINER = 'maintainer',
  OWNER = 'owner',
}

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
