import type { NextApiRequest, NextApiResponse } from 'next';
import axios, { AxiosError } from 'axios';
import { authLogger as logger } from '../../../logging/logger';
import { keycloakEndpoints, keycloakConfig } from '../../../config/keycloak';

interface LoginRequest {
  email: string;
  password: string;
}

interface LoginResponse {
  success: boolean;
  error?: string;
  tokens?: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<LoginResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body as LoginRequest;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
      });
    }

    // Prepare form data for Keycloak token endpoint
    const formData = new URLSearchParams();
    formData.append('client_id', keycloakConfig.clientId);
    formData.append('username', email);
    formData.append('password', password);
    formData.append('grant_type', 'password');

    logger.info({ email, keycloakUrl: keycloakConfig.url }, 'Attempting login via API proxy');

    // Make request to Keycloak from server-side (no CORS issues)
    const response = await axios.post(keycloakEndpoints.token, formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (response.data && response.data.access_token) {
      logger.info({ email }, 'Login successful via API proxy');
      return res.status(200).json({
        success: true,
        tokens: {
          access_token: response.data.access_token,
          refresh_token: response.data.refresh_token,
          expires_in: response.data.expires_in,
        },
      });
    }

    return res.status(401).json({
      success: false,
      error: 'Invalid credentials',
    });
  } catch (error: unknown) {
    const axiosError = error as AxiosError;
    logger.error(
      {
        err: error,
        email: req.body?.email,
        errorMessage: axiosError?.message,
        statusCode: axiosError?.response?.status,
        errorData: axiosError?.response?.data,
        url: axiosError?.config?.url,
      },
      'Login failed via API proxy'
    );

    // Handle specific Keycloak errors
    if (axiosError?.response?.status === 401) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Login failed. Please try again.',
    });
  }
}
