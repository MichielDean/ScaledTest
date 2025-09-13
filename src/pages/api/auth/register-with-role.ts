import { NextApiRequest, NextApiResponse } from 'next';
import { authClient } from '../../../lib/auth-client';
import { roleNames } from '../../../lib/auth-shared';
import { apiLogger } from '../../../logging/logger';
import { authAdminApi } from '../../../lib/auth';

interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  role?: string;
}

interface RegisterResponse {
  success: boolean;
  message: string;
  userId?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<RegisterResponse>) {
  if (req.method !== 'POST') {
    apiLogger.warn('Invalid method for registration endpoint');
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    if (typeof req.body !== 'object' || req.body === null || Array.isArray(req.body)) {
      apiLogger.warn('Invalid request body for registration');
      return res.status(400).json({
        success: false,
        message: 'Request body must be a JSON object',
      });
    }

    const { email, password, name, role }: RegisterRequest = req.body;

    // Validate required fields
    if (!email || !password || !name) {
      apiLogger.warn('Missing required fields for registration');
      return res.status(400).json({
        success: false,
        message: 'Email, password, and name are required',
      });
    }

    // Validate role if provided - check against the allowed string values
    const allowedRoles = Object.values(roleNames) as string[];
    if (role && !allowedRoles.includes(role)) {
      apiLogger.warn('Invalid role provided for registration');
      return res.status(400).json({
        success: false,
        message: `Invalid role. Must be one of: ${Object.values(roleNames).join(', ')}`,
      });
    }

    // First, create the user using Better Auth
    const signUpResult = await authClient.signUp.email({
      email,
      password,
      name,
    });

    if (!signUpResult.data?.user) {
      // Try to extract the most informative error message possible
      let errorMessage = 'Failed to create user';
      if (signUpResult.error) {
        if (signUpResult.error.message) {
          errorMessage = signUpResult.error.message;
        } else {
          errorMessage = JSON.stringify(signUpResult.error);
        }
      }
      apiLogger.error({ error: signUpResult.error }, 'User creation failed');
      return res.status(400).json({
        success: false,
        message: errorMessage,
      });
    }

    const userId = signUpResult.data.user.id;
    const assignedRole = role || roleNames.readonly;

    // Helper function to perform atomic cleanup of created user
    const rollbackUserCreation = async (reason: string): Promise<void> => {
      try {
        const adminApi = authAdminApi;
        if (adminApi && typeof adminApi.deleteUser === 'function') {
          await adminApi.deleteUser({ userId });
          apiLogger.info({ userId, reason }, 'Successfully rolled back user creation');
        } else {
          const warningMessage =
            'Cannot rollback user creation: Better Auth admin API deleteUser not available';
          apiLogger.warn({ userId, reason }, warningMessage);

          // Alert administrators about manual cleanup requirement
          apiLogger.error(
            {
              userId,
              reason,
              alertType: 'ADMIN_ATTENTION_REQUIRED',
              action: 'MANUAL_USER_CLEANUP_NEEDED',
              instructions: `User ${userId} was created but role assignment failed. Manual deletion required.`,
            },
            'ADMIN ALERT: Manual user cleanup required due to missing admin API'
          );
        }
      } catch (cleanupErr) {
        // Critical error: automatic cleanup failed, requires immediate administrator attention
        const criticalError = {
          userId,
          reason,
          cleanupError: cleanupErr,
          alertType: 'CRITICAL_CLEANUP_FAILURE',
          action: 'IMMEDIATE_MANUAL_INTERVENTION_REQUIRED',
          severity: 'HIGH',
          instructions: `User ${userId} exists but role assignment failed and automatic cleanup failed. Immediate manual intervention required to prevent orphaned accounts.`,
          timestamp: new Date().toISOString(),
        };

        apiLogger.error(
          criticalError,
          'CRITICAL ALERT: Failed to rollback user creation - immediate manual cleanup required'
        );

        // TODO: Implement cleanup retry queue or alerting system
        // This could integrate with monitoring systems, send notifications, or queue for retry
        // For now, we ensure the error is prominently logged with clear action items
      }
    };

    // Attempt to set the user role. MUST use the Better Auth admin API when
    // available — do NOT modify the auth DB directly from the application code.
    // This implements a transaction-like pattern with automatic rollback on failure.
    try {
      const adminApi = authAdminApi;

      if (!adminApi || typeof adminApi.updateUser !== 'function') {
        // We must not touch the auth DB directly. Fail with a clear error and rollback.
        apiLogger.error(
          { userId },
          'Better Auth admin API is not available; cannot assign role without direct DB access'
        );

        await rollbackUserCreation('admin API unavailable for role assignment');

        return res.status(500).json({
          success: false,
          message:
            'Registration failed: role assignment is not possible because the Better Auth admin API is not available. Please contact an administrator.',
        });
      }

      // Atomic operation: assign role to the created user
      await adminApi.updateUser({ userId, role: assignedRole });

      apiLogger.info({ userId, assignedRole }, 'User registered and role assigned successfully');

      return res.status(201).json({
        success: true,
        message: 'User registered successfully',
        userId,
      });
    } catch (err) {
      apiLogger.error(
        { err, userId, assignedRole },
        'Role assignment failed after user registration'
      );

      // Automatic rollback: remove the created user to maintain consistency
      await rollbackUserCreation('role assignment failure');

      return res.status(500).json({
        success: false,
        message: 'Registration failed: user could not be created with the specified role',
      });
    }
  } catch (err) {
    apiLogger.error({ err }, 'Registration process failed');

    return res.status(500).json({
      success: false,
      message: 'Internal server error during registration',
    });
  }
}
