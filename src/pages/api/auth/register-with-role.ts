import { NextApiRequest, NextApiResponse } from 'next';
import { auth } from '../../../lib/auth';
import { apiLogger } from '../../../logging/logger';

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
  details?: unknown;
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

    const { email, password, name, role } = req.body as RegisterRequest;

    // Ensure fields are strings
    if (typeof email !== 'string' || typeof password !== 'string' || typeof name !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Email, password, and name must be strings',
      });
    }

    // Basic validation
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        message: 'Email, password, and name are required',
        details: {
          missingFields: {
            email: !email,
            password: !password,
            name: !name,
          },
        },
      });
    }

    // Email validation
    // Guard against extremely long input to avoid catastrophic regex cost
    const MAX_EMAIL_LENGTH = 254; // RFC recommends 254 as a practical maximum
    if (email.length > MAX_EMAIL_LENGTH) {
      return res.status(400).json({
        success: false,
        message: 'Email is too long',
        details: { emailLength: email.length },
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format',
        details: { email },
      });
    }

    // Password validation (minimum and maximum requirements)
    const MAX_PASSWORD_LENGTH = 128;
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long',
        details: { passwordLength: password.length },
      });
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        message: 'Password is too long',
        details: { passwordLength: password.length },
      });
    }

    // Name length guard to avoid extremely large payloads
    const MAX_NAME_LENGTH = 100;
    if (name.length > MAX_NAME_LENGTH) {
      return res.status(400).json({
        success: false,
        message: 'Name is too long',
        details: { nameLength: name.length },
      });
    }

    const assignedRole = role || 'user';

    // Validate role before assignment
    const validRoles = ['admin', 'user'] as const;
    type ValidRole = (typeof validRoles)[number];
    const roleToAssign: ValidRole = validRoles.includes(assignedRole as ValidRole)
      ? (assignedRole as ValidRole)
      : 'user';

    apiLogger.debug('Creating user with Better Auth server-side admin API');

    // First, create the user using regular signup
    const signUpResult = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
      },
    });

    if (!signUpResult || !signUpResult.user) {
      apiLogger.error({ error: signUpResult }, 'User creation failed');
      return res.status(400).json({
        success: false,
        message: 'Failed to create user',
        details: signUpResult,
      });
    }

    const newUserId = signUpResult.user.id;

    // Then set the role using direct database access
    try {
      // Access the database instance from the auth object
      const authOptions = auth as {
        options?: { database?: { query: (sql: string, params: unknown[]) => Promise<void> } };
      };
      const database = authOptions.options?.database;

      if (database) {
        // Update the user's role and ensure email is verified (since we never require verification)
        await database.query(
          'UPDATE "user" SET role = $1, "emailVerified" = true, "updatedAt" = NOW() WHERE id = $2',
          [roleToAssign, newUserId]
        );
        apiLogger.info(
          { userId: newUserId, assignedRole: roleToAssign, email },
          'User role assigned and email marked as verified via direct database update'
        );
      } else {
        apiLogger.warn('Database instance not available for role assignment');
      }
    } catch (roleError) {
      apiLogger.warn(
        { userId: newUserId, assignedRole: roleToAssign, roleError },
        'Role assignment failed, but user was created'
      );
    }

    // Success response
    apiLogger.info(
      { userId: newUserId, assignedRole: roleToAssign, email },
      'User created successfully via Better Auth admin API'
    );

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      userId: newUserId,
      details: {
        assignedRole: roleToAssign,
      },
    });
  } catch (err) {
    // User creation failed
    let errorMessage = 'Failed to create user';
    let errorDetails: unknown = undefined;

    if (err instanceof Error) {
      errorMessage = err.message;
      errorDetails = {
        name: err.name,
        message: err.message,
      };
    } else {
      errorMessage = String(err);
      errorDetails = err;
    }

    // Check for common error patterns
    if (errorMessage.includes('duplicate') || errorMessage.includes('already exists')) {
      errorMessage = 'User with this email already exists';
    } else if (errorMessage.includes('invalid email')) {
      errorMessage = 'Invalid email format';
    } else if (errorMessage.includes('password')) {
      errorMessage = 'Password does not meet requirements';
    }

    apiLogger.error({ err, errorDetails }, 'User registration failed');

    return res.status(500).json({
      success: false,
      message: `Registration failed: ${errorMessage}`,
      details: {
        error: errorDetails,
      },
    });
  }
}
