import type { NextApiRequest, NextApiResponse } from 'next';
import { auth } from '@/lib/auth';
import { dbLogger as authLogger } from '@/logging/logger';

interface UserTeamRequest {
  userId: string;
  teams: Array<{
    id: string;
    name: string;
    role: string;
  }>;
}

interface UserTeamResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<UserTeamResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // Get session from Better Auth
    const session = await auth.api.getSession({
      headers: new Headers(req.headers as Record<string, string>),
    });

    if (!session?.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    // Check if user has admin role (maintainer or owner)
    const userWithRole = session.user as { role?: string };
    const userRole = userWithRole.role;

    if (!userRole || !['maintainer', 'owner'].includes(userRole)) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }

    const { userId, teams }: UserTeamRequest = req.body;

    if (!userId || !Array.isArray(teams)) {
      return res.status(400).json({
        success: false,
        error: 'User ID and teams array are required',
      });
    }

    // Update user metadata with teams using Better Auth admin API
    try {
      // TODO: Implement proper Better Auth user metadata update
      // This is a placeholder for now - teams are stored in user metadata
      // await auth.api.admin.updateUser({
      //   userId,
      //   metadata: { teams },
      // });

      authLogger.info('User teams update requested', {
        userId,
        teams,
        updatedBy: session.user.id,
        note: 'Placeholder implementation - teams stored in user metadata',
      });

      return res.status(200).json({
        success: true,
        message: 'User teams updated successfully (placeholder)',
      });
    } catch (updateError) {
      authLogger.error('Failed to update user teams', {
        error: updateError,
        userId,
        teams,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to update user teams',
      });
    }
  } catch (error) {
    authLogger.error('Failed to handle user team assignment', {
      error,
      method: req.method,
      url: req.url,
    });

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
}
