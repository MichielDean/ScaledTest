import { NextApiRequest, NextApiResponse } from 'next';
import { authClient } from '../../../lib/auth-client';
import { roleNames } from '../../../lib/auth-shared';
import { apiLogger } from '../../../logging/logger';
import { Pool } from 'pg';

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
    const { email, password, name, role }: RegisterRequest = req.body;

    // Validate required fields
    if (!email || !password || !name) {
      apiLogger.warn('Missing required fields for registration');
      return res.status(400).json({
        success: false,
        message: 'Email, password, and name are required',
      });
    }

    // Validate role if provided
    if (role && !Object.values(roleNames).includes(role as keyof typeof roleNames)) {
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
      apiLogger.error('User creation failed');
      return res.status(400).json({
        success: false,
        message: signUpResult.error?.message || 'Failed to create user',
      });
    }

    const userId = signUpResult.data.user.id;
    const assignedRole = role || roleNames.readonly;

    // Set the user role using direct database update
    try {
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
      });

      try {
        // Update user role in the database
        await pool.query('UPDATE "user" SET role = $1 WHERE id = $2', [assignedRole, userId]);

        apiLogger.info('User registered and role assigned successfully');

        return res.status(201).json({
          success: true,
          message: 'User registered successfully',
          userId,
        });
      } finally {
        await pool.end();
      }
    } catch {
      apiLogger.error('Role assignment failed after user registration');

      return res.status(500).json({
        success: false,
        message: 'User registered, but failed to assign role',
      });
    }
  } catch {
    apiLogger.error('Registration process failed');

    return res.status(500).json({
      success: false,
      message: 'Internal server error during registration',
    });
  }
}
