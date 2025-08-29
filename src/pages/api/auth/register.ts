import type { NextApiRequest, NextApiResponse } from 'next';
import axios, { AxiosError } from 'axios';
import { authLogger as logger } from '../../../logging/logger';
import { keycloakConfig, keycloakEndpoints, keycloakAdminConfig } from '../../../config/keycloak';
import { getAdminToken } from '../../../authentication/keycloakAdminApi';
import { assignUserToTeam } from '../../../authentication/teamManagement';
import { RegisterResponse } from '../../../types/api';
import { RegisterRequestBody } from '../../../types/user';

export default async function handler(req: NextApiRequest, res: NextApiResponse<RegisterResponse>) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { username, email, password, firstName, lastName, teamIds } =
      req.body as RegisterRequestBody;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
      });
    }

    // If username isn't provided, use email as username
    const finalUsername = username || email;

    // Check if admin credentials are available
    if (!keycloakAdminConfig.username || !keycloakAdminConfig.password) {
      logger.error('Missing Keycloak admin credentials in environment variables');
      return res.status(500).json({
        success: false,
        error: 'Server configuration error: Missing Keycloak admin credentials',
      });
    }

    // Log Keycloak config for debugging (omitting sensitive data)
    logger.info(
      {
        keycloakRealm: keycloakConfig.realm,
        keycloakUrl: keycloakConfig.url,
        keycloakClientId: keycloakConfig.clientId,
        adminUsernameAvailable: !!keycloakAdminConfig.username,
        adminPasswordAvailable: !!keycloakAdminConfig.password,
      },
      'Keycloak configuration for registration'
    );

    const adminToken = await getAdminToken();

    // Then create user
    const userData = {
      username: finalUsername,
      email,
      enabled: true,
      emailVerified: true, // Set to true for auto-login functionality
      firstName,
      lastName,
      credentials: [
        {
          type: 'password',
          value: password,
          temporary: false,
        },
      ],
    };

    await axios.post(keycloakEndpoints.users, userData, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
    });

    // Get the user ID to perform additional setup
    const usersResponse = await axios.get(
      `${keycloakEndpoints.users}?username=${encodeURIComponent(finalUsername)}`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );

    if (!usersResponse.data || usersResponse.data.length === 0) {
      throw new Error('User was created but could not be found');
    }

    const userId = usersResponse.data[0].id;

    // Assign the readonly role to the new user (required for dashboard access)
    try {
      const readonlyRoleResponse = await axios.get(
        `${keycloakConfig.url}/admin/realms/${keycloakConfig.realm}/roles/readonly`,
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      if (readonlyRoleResponse.data) {
        await axios.post(
          `${keycloakConfig.url}/admin/realms/${keycloakConfig.realm}/users/${userId}/role-mappings/realm`,
          [readonlyRoleResponse.data],
          {
            headers: {
              Authorization: `Bearer ${adminToken}`,
              'Content-Type': 'application/json',
            },
          }
        );
        logger.info(
          { username: finalUsername, role: 'readonly' },
          'Assigned readonly role to new user'
        );

        // Wait a short time for role assignment to propagate in Keycloak
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      logger.warn({ username: finalUsername, error }, 'Failed to assign readonly role to new user');
      // Don't fail registration if role assignment fails
    }

    // Assign user to selected teams
    if (teamIds && Array.isArray(teamIds) && teamIds.length > 0) {
      logger.info({ username: finalUsername, teamIds }, 'Assigning user to selected teams');

      for (const teamId of teamIds) {
        try {
          await assignUserToTeam(userId, teamId, 'registration');
          logger.info({ username: finalUsername, teamId }, 'User assigned to team successfully');
        } catch (error) {
          logger.warn({ username: finalUsername, teamId, error }, 'Failed to assign user to team');
          // Continue with other teams - don't fail registration if one team assignment fails
        }
      }
    }

    // After successful registration, get a token for the new user
    logger.info({ username: finalUsername }, 'User registered successfully, obtaining token');

    const userTokenFormData = new URLSearchParams();
    userTokenFormData.append('client_id', keycloakConfig.clientId);
    userTokenFormData.append('username', finalUsername);
    userTokenFormData.append('password', password);
    userTokenFormData.append('grant_type', 'password');

    let tokenAttempts = 0;
    const maxAttempts = 5; // Increased attempts to account for role propagation
    let userTokenResponse;

    while (tokenAttempts < maxAttempts) {
      try {
        userTokenResponse = await axios.post(
          keycloakEndpoints.token,
          userTokenFormData.toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          }
        );

        // Verify that the token includes the readonly role before returning
        try {
          const { verifyToken } = await import('../../../auth/apiAuth');
          const payload = await verifyToken(userTokenResponse.data.access_token);
          const userRoles = [
            ...(payload.realm_access?.roles || []),
            ...(payload.resource_access?.[keycloakConfig.clientId]?.roles || []),
          ];

          if (userRoles.includes('readonly')) {
            logger.info(
              { username: finalUsername, roles: userRoles },
              'Token verified with readonly role'
            );
            break; // Success with proper role, exit retry loop
          } else {
            logger.warn(
              { username: finalUsername, roles: userRoles, attempt: tokenAttempts + 1 },
              'Token does not include readonly role, retrying...'
            );
            if (tokenAttempts >= maxAttempts - 1) {
              logger.error(
                { username: finalUsername, roles: userRoles },
                'Failed to get token with readonly role after all attempts'
              );
              break; // Use the token even without role verification
            }
          }
        } catch (verifyError) {
          logger.warn(
            { username: finalUsername, error: verifyError, attempt: tokenAttempts + 1 },
            'Failed to verify token, proceeding anyway'
          );
          break; // Use the token even if verification fails
        }
      } catch (error) {
        tokenAttempts++;
        if (tokenAttempts >= maxAttempts) {
          throw error; // Re-throw the error if we've exhausted retries
        }
        // Wait before retrying (progressive backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * (tokenAttempts + 1)));
        logger.info(
          { username: finalUsername, attempt: tokenAttempts },
          'Token request failed, retrying...'
        );
      }

      if (!userTokenResponse) {
        tokenAttempts++;
        // Wait before retrying for role propagation
        await new Promise(resolve => setTimeout(resolve, 1000 * (tokenAttempts + 1)));
      }
    }

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token: userTokenResponse!.data.access_token,
      refreshToken: userTokenResponse!.data.refresh_token,
      expiresIn: userTokenResponse!.data.expires_in,
    });
  } catch (err) {
    const axiosError = err as AxiosError;

    logger.error(
      {
        err,
        statusCode: axiosError.response?.status,
        errorCode: axiosError.code,
        url: axiosError.config?.url,
        data: axiosError.response?.data,
      },
      'User registration failed'
    );

    // Handle different error cases
    if (axiosError.response?.status === 409) {
      return res.status(409).json({
        success: false,
        error: 'Email already exists',
      });
    } else if (axiosError.response?.status === 401) {
      return res.status(500).json({
        success: false,
        error: 'Authentication failed with Keycloak admin',
      });
    } else if (axiosError.response?.data) {
      // Return more specific error from Keycloak if available
      let errorMessage = 'Unknown error';
      try {
        if (typeof axiosError.response.data === 'object') {
          // Try to extract error message from response data
          const data = axiosError.response.data as Record<string, unknown>;
          errorMessage =
            (data.errorMessage as string) || (data.error as string) || JSON.stringify(data);
        } else if (typeof axiosError.response.data === 'string') {
          errorMessage = axiosError.response.data;
        } else {
          errorMessage = JSON.stringify(axiosError.response.data);
        }
      } catch {
        // If any error occurs during parsing, use default message
        errorMessage = 'Error parsing response data';
      }

      return res.status(500).json({
        success: false,
        error: `Keycloak error: ${errorMessage.substring(0, 200)}`, // Limit length of error message
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Registration failed. Please try again later.',
    });
  }
}
