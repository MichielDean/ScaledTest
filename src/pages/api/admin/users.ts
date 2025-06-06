// filepath: c:\Users\mokey\source\ScaledTest\src\pages\api\admin\users.ts
import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import { UserRole } from '../../../auth/keycloak';
import { getRequestLogger, logError } from '../../../utils/logger';
import { keycloakConfig, keycloakEndpoints } from '../../../config/keycloak';
import { getAdminToken, getAllUsersWithRoles, getClientId } from '../../../utils/keycloakAdminApi';

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

// Handler for user-related API requests
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Create a request-specific logger with request ID
  const reqLogger = getRequestLogger(req);

  // Get admin token
  let adminToken;
  try {
    adminToken = await getAdminToken();
  } catch {
    return res.status(500).json({ error: 'Failed to authenticate with Keycloak admin' });
  }

  if (req.method === 'GET') {
    // Get all users with their roles
    try {
      const usersWithRoles = await getAllUsersWithRoles();
      return res.status(200).json(usersWithRoles);
    } catch (error) {
      logError(reqLogger, 'Error fetching users', error, {
        realm: keycloakConfig.realm,
      });
      return res.status(500).json({ error: 'Failed to fetch users' });
    }
  } else if (req.method === 'POST') {
    // Update user role
    const { userId, grantMaintainer } = req.body;

    // Validate userId to ensure it is a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!userId || !uuidRegex.test(userId)) {
      return res.status(400).json({ error: 'Invalid or missing User ID' });
    }

    try {
      // First, get the client ID
      const clientId = await getClientId(keycloakConfig.clientId);

      if (!clientId) {
        return res.status(404).json({ error: 'Client not found' });
      }

      // Get available roles
      const rolesResponse = await axios.get<KeycloakRole[]>(
        keycloakEndpoints.getClientRolesEndpoint(clientId),
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
          keycloakEndpoints.getUserClientRolesEndpoint(userId, clientId),
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
        await axios.delete(keycloakEndpoints.getUserClientRolesEndpoint(userId, clientId), {
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
          data: [maintainerRole],
        });

        return res.status(200).json({ message: 'Successfully revoked maintainer role' });
      }
    } catch (error) {
      logError(reqLogger, 'Error updating user role', error, {
        userId,
        grantMaintainer,
        realm: keycloakConfig.realm,
        clientId: keycloakConfig.clientId,
      });
      return res.status(500).json({ error: 'Failed to update user role' });
    }
  } else {
    // Method not allowed
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
}
