/**
 * Manages Keycloak tokens in the browser environment
 */
import { authLogger as logger } from '../logging/logger';
import { keycloakEndpoints, keycloakConfig } from '../config/keycloak';
import axios, { AxiosError } from 'axios';

const TOKEN_STORAGE_KEY = 'keycloak_token';
const REFRESH_TOKEN_STORAGE_KEY = 'keycloak_refresh_token';

/**
 * Retrieves the stored access token
 */
export const getStoredToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_STORAGE_KEY);
};

/**
 * Retrieves the stored refresh token
 */
export const getStoredRefreshToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
};

/**
 * Stores the provided tokens in local storage
 */
export const storeTokens = (accessToken: string, refreshToken: string): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken);

  logger.info('Tokens stored in local storage');
};

/**
 * Clears stored tokens from local storage
 */
export const clearTokens = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);

  logger.info('Tokens cleared from local storage');
};

/**
 * Attempts to refresh the access token using the stored refresh token
 * @returns A promise that resolves to true if successful, false otherwise
 */
export const refreshToken = async (): Promise<boolean> => {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return false;

  try {
    const formData = new URLSearchParams();
    formData.append('client_id', keycloakConfig.clientId);
    formData.append('grant_type', 'refresh_token');
    formData.append('refresh_token', refreshToken);

    const response = await axios.post(keycloakEndpoints.token, formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (response.data && response.data.access_token) {
      storeTokens(response.data.access_token, response.data.refresh_token);
      return true;
    }

    return false;
  } catch (error) {
    logger.error({ err: error }, 'Failed to refresh token');
    clearTokens();
    return false;
  }
};

/**
 * Performs direct login with username and password
 * @returns A promise that resolves to true if successful, false otherwise
 */
export const directLogin = async (username: string, password: string): Promise<boolean> => {
  try {
    const formData = new URLSearchParams();
    formData.append('client_id', keycloakConfig.clientId);
    formData.append('username', username);
    formData.append('password', password);
    formData.append('grant_type', 'password');

    const response = await axios.post(keycloakEndpoints.token, formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (response.data && response.data.access_token) {
      storeTokens(response.data.access_token, response.data.refresh_token);
      return true;
    }

    return false;
  } catch (error: unknown) {
    const axiosError = error as AxiosError;
    logger.error(
      {
        err: error,
        username,
        errorMessage: axiosError?.message,
        statusCode: axiosError?.response?.status,
        errorData: axiosError?.response?.data,
        url: axiosError?.config?.url,
      },
      'Direct login failed'
    );
    // Re-throw the error with more details for the UI to handle
    throw error;
  }
};
