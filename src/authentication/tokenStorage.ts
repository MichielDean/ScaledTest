/**
 * Token Storage Utilities
 *
 * Centralized utilities for handling Keycloak token storage in localStorage.
 * This eliminates duplication across multiple components and provides
 * consistent token management functionality.
 */

// Token storage keys
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'keycloak_token',
  REFRESH_TOKEN: 'keycloak_refresh_token',
} as const;

/**
 * Store authentication tokens in localStorage
 * @param accessToken - The access token to store
 * @param refreshToken - The refresh token to store (optional)
 */
export const storeTokens = (accessToken: string, refreshToken?: string): void => {
  if (typeof window === 'undefined') {
    return; // Skip storage on server-side
  }

  localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);

  if (refreshToken) {
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
  }
};

/**
 * Retrieve the stored access token from localStorage
 * @returns The access token or null if not found
 */
export const getStoredAccessToken = (): string | null => {
  if (typeof window === 'undefined') {
    return null; // Return null on server-side
  }

  return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
};

/**
 * Retrieve the stored refresh token from localStorage
 * @returns The refresh token or null if not found
 */
export const getStoredRefreshToken = (): string | null => {
  if (typeof window === 'undefined') {
    return null; // Return null on server-side
  }

  return localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
};

/**
 * Clear all stored tokens from localStorage
 */
export const clearStoredTokens = (): void => {
  if (typeof window === 'undefined') {
    return; // Skip clearing on server-side
  }

  localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
};

/**
 * Check if tokens are currently stored
 * @returns True if both access and refresh tokens are stored
 */
export const hasStoredTokens = (): boolean => {
  return !!(getStoredAccessToken() && getStoredRefreshToken());
};

/**
 * Update only the access token (useful for token refresh scenarios)
 * @param accessToken - The new access token to store
 */
export const updateAccessToken = (accessToken: string): void => {
  if (typeof window === 'undefined') {
    return; // Skip storage on server-side
  }

  localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
};
