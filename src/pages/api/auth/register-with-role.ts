import { NextApiRequest, NextApiResponse } from 'next';
import { authClient } from '../../../lib/auth-client';
import { auth } from '../../../lib/auth';
import { roleNames } from '../../../lib/auth-shared';
import { apiLogger } from '../../../logging/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password, name, role = 'readonly' } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Missing required fields: email and password',
      });
    }

    // Validate role if provided
    const validRoles = Object.values(roleNames);
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        error: 'Invalid role. Must be one of: ' + validRoles.join(', '),
      });
    }

    // Register user with Better Auth
    const result = await authClient.signUp.email({
      email,
      password,
      name: name || email.split('@')[0], // Use email prefix as default name
    });

    if (!result.data) {
      return res.status(400).json({
        error: 'Registration failed',
        details: result.error || 'Unknown error',
      });
    }

    // User registration successful, now set their role
    apiLogger.info(
      {
        userId: result.data.user.id,
        email,
        role,
        name: result.data.user.name,
      },
      'User registered with Better Auth'
    );

    // Set the user role using Better Auth admin API
    try {
      await auth.api.setRole({
        body: {
          userId: result.data.user.id,
          role: role,
        },
      });

      apiLogger.info(
        {
          userId: result.data.user.id,
          role,
          email,
        },
        'User role successfully set'
      );
    } catch (roleError) {
      apiLogger.error(
        {
          userId: result.data.user.id,
          email,
          intendedRole: role,
          error: roleError,
        },
        'Failed to set user role - CRITICAL SECURITY ISSUE'
      );

      // This is a critical security issue - user was created but role not set
      // In production, you might want to delete the user or mark them as needing manual role assignment
      return res.status(500).json({
        error: 'User registered but role assignment failed - contact administrator',
        userId: result.data.user.id,
      });
    }

    return res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: result.data.user.id,
        email: result.data.user.email,
        name: result.data.user.name,
        role: role,
      },
    });
  } catch (error) {
    apiLogger.error({ error, email: req.body?.email }, 'Registration error');
    return res.status(500).json({
      error: 'Failed to register user',
    });
  }
}
