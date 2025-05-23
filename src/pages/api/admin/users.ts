import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import { UserRole } from '../../../auth/keycloak';
import { apiLogger, getRequestLogger, logError } from '../../../utils/logger';

// Define module logger
const logger = apiLogger.child({ module: 'admin' });

/**
 * Represents a Keycloak user retrieved from the Admin API
 */
interface KeycloakUser {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  enabled?: boolean;
  emailVerified?: boolean;
  attributes?: Record<string, string[]>;
}

/**
 * Represents a Keycloak role retrieved from the Admin API
 */
interface KeycloakRole {
  id: string;
  name: string;
  description?: string;
  composite?: boolean;
  clientRole?: boolean;
  containerId?: string;
}

/**
 * Represents a Keycloak client retrieved from the Admin API
 */
interface KeycloakClient {
  id: string;
  clientId: string;
  name?: string;
}

/**
 * Enhanced user object with role information
 */
interface UserWithRoles {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  roles: string[];
  isMaintainer: boolean;
}

// Service account credentials for Keycloak Admin API
const KEYCLOAK_URL = process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'http://localhost:8080';
const REALM = process.env.NEXT_PUBLIC_KEYCLOAK_REALM || 'scaledtest';
const CLIENT_ID = process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || 'scaledtest-client';
// CLIENT_SECRET is not currently used but may be needed for token exchange in the future
const ADMIN_USERNAME = process.env.KEYCLOAK_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin';

// Get admin token from Keycloak
const getAdminToken = async (): Promise<string> => {
  try {
    const response = await axios.post(
      `${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`,
      new URLSearchParams({
        client_id: 'admin-cli',
        username: ADMIN_USERNAME,
        password: ADMIN_PASSWORD,
        grant_type: 'password',
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    return response.data.access_token;
  } catch (error) {
    logError(logger, 'Error getting admin token', error, {
      realm: 'master',
      clientId: 'admin-cli',
      url: `${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`,
    });
    throw new Error('Failed to authenticate with Keycloak admin');
  }
};

// Handler for user-related API requests
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Create a request-specific logger with request ID
  const reqLogger = getRequestLogger(req);

  // Check if the request has a valid session
  // This is a simplified check - in a real app, you'd validate the user's session and role
  // For simplicity, we're skipping that here but you should add proper authorization

  // Get admin token
  let adminToken;
  try {
    adminToken = await getAdminToken();
  } catch {
    return res.status(500).json({ error: 'Failed to authenticate with Keycloak admin' });
  }

  if (req.method === 'GET') {
    // Get all users
    try {
      const response = await axios.get<KeycloakUser[]>(
        `${KEYCLOAK_URL}/admin/realms/${REALM}/users`,
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      // Get users with their roles
      const usersWithRoles = await Promise.all(
        response.data.map(async (user: KeycloakUser) => {
          try {
            // Get client ID first
            const clientsResponse = await axios.get<KeycloakClient[]>(
              `${KEYCLOAK_URL}/admin/realms/${REALM}/clients?clientId=${CLIENT_ID}`,
              {
                headers: {
                  Authorization: `Bearer ${adminToken}`,
                },
              }
            );

            const client = clientsResponse.data[0];

            // Get user roles for this client
            const rolesResponse = await axios.get<KeycloakRole[]>(
              `${KEYCLOAK_URL}/admin/realms/${REALM}/users/${user.id}/role-mappings/clients/${client.id}`,
              {
                headers: {
                  Authorization: `Bearer ${adminToken}`,
                },
              }
            );

            const roles = rolesResponse.data;
            const roleNames = roles.map((role: KeycloakRole) => role.name);

            const userWithRoles: UserWithRoles = {
              id: user.id,
              username: user.username,
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              roles: roleNames,
              isMaintainer: roleNames.includes(UserRole.MAINTAINER),
            };

            return userWithRoles;
          } catch (error) {
            logError(reqLogger, 'Error getting user roles', error, {
              userId: user.id,
              username: user.username,
            });
            return {
              id: user.id,
              username: user.username,
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              roles: [],
              isMaintainer: false,
            } as UserWithRoles;
          }
        })
      );

      return res.status(200).json(usersWithRoles);
    } catch (error) {
      logError(reqLogger, 'Error fetching users', error, {
        realm: REALM,
      });
      return res.status(500).json({ error: 'Failed to fetch users' });
    }
  } else if (req.method === 'POST') {
    // Update user role
    const { userId, grantMaintainer } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    try {
      // First, get the client ID
      const clientsResponse = await axios.get<KeycloakClient[]>(
        `${KEYCLOAK_URL}/admin/realms/${REALM}/clients?clientId=${CLIENT_ID}`,
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      const client = clientsResponse.data[0];

      // Get available roles
      const rolesResponse = await axios.get<KeycloakRole[]>(
        `${KEYCLOAK_URL}/admin/realms/${REALM}/clients/${client.id}/roles`,
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      const roles = rolesResponse.data;
      const maintainerRole = roles.find((role: KeycloakRole) => role.name === UserRole.MAINTAINER);

      if (!maintainerRole) {
        return res.status(404).json({ error: 'Maintainer role not found' });
      }

      if (grantMaintainer) {
        // Add maintainer role
        await axios.post(
          `${KEYCLOAK_URL}/admin/realms/${REALM}/users/${userId}/role-mappings/clients/${client.id}`,
          [maintainerRole],
          {
            headers: {
              Authorization: `Bearer ${adminToken}`,
              'Content-Type': 'application/json',
            },
          }
        );

        return res.status(200).json({ message: 'Successfully granted maintainer role' });
      } else {
        // Remove maintainer role
        await axios.delete(
          `${KEYCLOAK_URL}/admin/realms/${REALM}/users/${userId}/role-mappings/clients/${client.id}`,
          {
            headers: {
              Authorization: `Bearer ${adminToken}`,
              'Content-Type': 'application/json',
            },
            data: [maintainerRole],
          }
        );

        return res.status(200).json({ message: 'Successfully revoked maintainer role' });
      }
    } catch (error) {
      logError(reqLogger, 'Error updating user role', error, {
        userId,
        grantMaintainer,
        realm: REALM,
        clientId: CLIENT_ID,
      });
      return res.status(500).json({ error: 'Failed to update user role' });
    }
  } else {
    // Method not allowed
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
}
