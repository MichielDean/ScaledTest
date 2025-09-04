import { type NextApiRequest, type NextApiResponse } from 'next';
import { apiLogger } from '../../../logging/logger';
import { authClient } from '../../../lib/auth-client';
import { roleNames } from '../../../lib/auth-shared';

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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RegisterResponse>
) {
  if (req.method !== 'POST') {
    apiLogger.warn('Invalid method for registration endpoint', { method: req.method });
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { email, password, name, role }: RegisterRequest = req.body;

    // Validate required fields
    if (!email || !password || !name) {
      apiLogger.warn('Missing required fields for registration', { 
        hasEmail: !!email, 
        hasPassword: !!password, 
        hasName: !!name 
      });
      return res.status(400).json({ 
        success: false, 
        message: 'Email, password, and name are required' 
      });
    }

    // Validate role if provided
    if (role && !Object.values(roleNames).includes(role as any)) {
      apiLogger.warn('Invalid role provided for registration', { role, validRoles: Object.values(roleNames) });
      return res.status(400).json({ 
        success: false, 
        message: `Invalid role. Must be one of: ${Object.values(roleNames).join(', ')}` 
      });
    }

    // First, create the user using Better Auth
    const signUpResult = await authClient.signUp.email({
      email,
      password,
      name,
    });

    if (!signUpResult.data?.user) {
      apiLogger.error('User creation failed', { email, signUpResult });
      return res.status(400).json({ 
        success: false, 
        message: signUpResult.error?.message || 'Failed to create user' 
      });
    }

    const userId = signUpResult.data.user.id;
    const assignedRole = role || roleNames.USER;

    // Assign role to the user using Better Auth admin API
    try {
      const roleResult = await authClient.admin.setRole({
        userId,
        role: assignedRole,
      });

      if (!roleResult.data) {
        apiLogger.error('Role assignment failed', { 
          userId, 
          role: assignedRole, 
          error: roleResult.error 
        });
        // User was created but role assignment failed
        return res.status(500).json({ 
          success: false, 
          message: 'User created but role assignment failed' 
        });
      }

      apiLogger.info('User registered successfully with role', { 
        userId, 
        email, 
        role: assignedRole 
      });

      return res.status(201).json({ 
        success: true, 
        message: 'User registered successfully',
        userId 
      });

    } catch (roleError) {
      apiLogger.error('Role assignment threw exception', { 
        userId, 
        role: assignedRole, 
        error: roleError 
      });
      return res.status(500).json({ 
        success: false, 
        message: 'User created but role assignment failed' 
      });
    }

  } catch (error) {
    apiLogger.error('Registration process failed', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error during registration' 
    });
  }
}