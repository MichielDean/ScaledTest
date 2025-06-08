import type { NextApiRequest, NextApiResponse } from 'next';
import axios, { AxiosError } from 'axios';
import { authLogger as logger } from '../../../utils/logger';
import { keycloakConfig, keycloakEndpoints, keycloakAdminConfig } from '../../../config/keycloak';
import { getAdminToken } from '../../../utils/keycloakAdminApi';
import { RegisterResponse } from '../../../types/api';
import { RegisterRequestBody } from '../../../types/user';

export default async function handler(req: NextApiRequest, res: NextApiResponse<RegisterResponse>) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { username, email, password, firstName, lastName } = req.body as RegisterRequestBody;

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
      emailVerified: false,
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

    // After successful registration, get a token for the new user
    logger.info({ username: finalUsername }, 'User registered successfully, obtaining token');

    const userTokenFormData = new URLSearchParams();
    userTokenFormData.append('client_id', keycloakConfig.clientId);
    userTokenFormData.append('username', finalUsername);
    userTokenFormData.append('password', password);
    userTokenFormData.append('grant_type', 'password');

    const userTokenResponse = await axios.post(
      keycloakEndpoints.token,
      userTokenFormData.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token: userTokenResponse.data.access_token,
      refreshToken: userTokenResponse.data.refresh_token,
      expiresIn: userTokenResponse.data.expires_in,
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
