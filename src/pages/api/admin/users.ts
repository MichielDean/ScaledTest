// Admin API for user management
import axios from 'axios';
import { MethodHandler, createApi } from '../../../auth/apiAuth';
import { UserRole } from '../../../auth/keycloak';
import { logError } from '../../../logging/logger';
import { keycloakConfig, keycloakEndpoints } from '../../../config/keycloak';
import {
  getAdminToken,
  getAllUsersWithRoles,
  getClientId,
} from '../../../authentication/keycloakAdminApi';
import { KeycloakRole } from '../../../types/user';

/**
 * Handle GET requests - retrieve all users with their roles
 */
const handleGet: MethodHandler = async (req, res, reqLogger) => {
  try {
    await getAdminToken();

    const usersWithRoles = await getAllUsersWithRoles();
    return res.status(200).json(usersWithRoles);
  } catch (error) {
    logError(reqLogger, 'Error fetching users', error, {
      realm: keycloakConfig.realm,
    });
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
};

/**
 * Handle POST requests - update user roles (grant/revoke maintainer)
 */
const handlePost: MethodHandler = async (req, res, reqLogger) => {
  try {
    const adminToken = await getAdminToken();

    const { userId, grantMaintainer } = req.body;

    // Validate userId to ensure it is a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!userId || !uuidRegex.test(userId)) {
      return res.status(400).json({ error: 'Invalid or missing User ID' });
    }

    // First, get the client ID
    const clientId = await getClientId(keycloakConfig.clientId);

    if (!clientId) {
      return res.status(404).json({ error: 'Client not found' });
    }

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
      userId: req.body?.userId,
      grantMaintainer: req.body?.grantMaintainer,
      realm: keycloakConfig.realm,
      clientId: keycloakConfig.clientId,
    });
    return res.status(500).json({ error: 'Failed to update user role' });
  }
};

/**
 * Admin API for user management
 * GET  /api/admin/users - Get all users with their roles
 * POST /api/admin/users - Update user roles (grant/revoke maintainer)
 *
 * This endpoint requires OWNER role for all operations
 * Manages Keycloak user roles through admin API
 */

// Export the super-generic API with admin-only access
export default createApi.adminOnly({
  GET: handleGet,
  POST: handlePost,
});
