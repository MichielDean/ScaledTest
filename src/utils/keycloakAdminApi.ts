// src/utils/keycloakAdminApi.ts
import axios, { AxiosError } from 'axios';
import { keycloakEndpoints, keycloakAdminConfig, keycloakConfig } from '../config/keycloak';
import { authLogger as logger, logError } from './logger';

// Cache for admin token to avoid too many requests
interface TokenCache {
  token: string;
  expiresAt: number;
}

let adminTokenCache: TokenCache | null = null;
const TOKEN_EXPIRY_BUFFER = 30; // seconds before expiry to refresh

/**
 * Gets an admin token from Keycloak, with caching
 */
export async function getAdminToken(): Promise<string> {
  // Check if we have a cached unexpired token
  const now = Math.floor(Date.now() / 1000);
  if (adminTokenCache && adminTokenCache.expiresAt > now + TOKEN_EXPIRY_BUFFER) {
    return adminTokenCache.token;
  }

  try {
    const formData = new URLSearchParams();
    formData.append('grant_type', 'password');
    formData.append('client_id', 'admin-cli');
    formData.append('username', keycloakAdminConfig.username);
    formData.append('password', keycloakAdminConfig.password);

    const response = await axios.post(keycloakEndpoints.adminToken, formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    // Cache the token with expiry
    adminTokenCache = {
      token: response.data.access_token,
      expiresAt: now + response.data.expires_in,
    };

    return adminTokenCache.token;
  } catch (error) {
    const axiosError = error as AxiosError;
    logError(logger, 'Failed to get admin token', axiosError, {
      statusCode: axiosError.response?.status,
      url: keycloakEndpoints.adminToken,
    });
    throw new Error('Failed to authenticate with Keycloak admin');
  }
}

/**
 * Finds a client ID by client identifier
 */
export async function getClientId(clientIdParam: string): Promise<string | null> {
  try {
    const token = await getAdminToken();

    const response = await axios.get(`${keycloakEndpoints.clients}?clientId=${clientIdParam}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.data && response.data.length > 0) {
      return response.data[0].id;
    }

    return null;
  } catch (error) {
    const axiosError = error as AxiosError;
    logError(logger, 'Failed to get client ID', axiosError, {
      clientId: clientIdParam,
      statusCode: axiosError.response?.status,
    });
    throw new Error(`Failed to get client ID for ${clientIdParam}`);
  }
}

/**
 * Gets a user by username
 */
export async function getUserByUsername(username: string) {
  try {
    const token = await getAdminToken();

    const response = await axios.get(
      `${keycloakEndpoints.users}?username=${encodeURIComponent(username)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (response.data && response.data.length > 0) {
      return response.data[0];
    }

    return null;
  } catch (error) {
    const axiosError = error as AxiosError;
    logError(logger, 'Failed to get user', axiosError, {
      username,
      statusCode: axiosError.response?.status,
    });
    throw new Error(`Failed to get user: ${username}`);
  }
}

/**
 * Gets all users with their roles
 */
export async function getAllUsersWithRoles() {
  try {
    const token = await getAdminToken();
    const clientId = await getClientId(keycloakConfig.clientId);

    // First get all users
    const usersResponse = await axios.get(keycloakEndpoints.users, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    // Then get roles for each user
    const usersWithRoles = await Promise.all(
      usersResponse.data.map(
        async (user: {
          id: string;
          username: string;
          firstName: string;
          lastName: string;
          email: string;
          [key: string]: unknown;
        }) => {
          try {
            if (!clientId) {
              return {
                ...user,
                roles: [],
              };
            }

            // Get user roles for this client
            const rolesResponse = await axios.get(
              keycloakEndpoints.getUserClientRolesEndpoint(user.id, clientId),
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            );

            const roles = rolesResponse.data;
            const roleNames = roles.map((role: { name: string }) => role.name);

            return {
              id: user.id,
              username: user.username,
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              roles: roleNames,
              isMaintainer: roleNames.includes('maintainer') || roleNames.includes('owner'),
            };
          } catch {
            // If we can't get roles for a user, return the user without roles
            return {
              ...user,
              roles: [],
              isMaintainer: false,
            };
          }
        }
      )
    );

    return usersWithRoles;
  } catch (error) {
    const axiosError = error as AxiosError;
    logError(logger, 'Failed to get all users with roles', axiosError, {
      statusCode: axiosError.response?.status,
    });
    throw new Error('Failed to get users with roles');
  }
}
