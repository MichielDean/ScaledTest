/**
 * DELETE /api/v1/teams/[teamId]/tokens/[tokenId]  — revoke an API token
 *
 * Auth: maintainer or owner required
 *
 * Response 200: { success: true, message: 'Token revoked' }
 * Response 404: token not found or not owned by this team
 */

import type { NextApiResponse } from 'next';
import { createBetterAuthApi, type BetterAuthenticatedRequest } from '@/auth/betterAuthApi';
import { revokeApiToken } from '@/lib/apiTokens';
import { getUserTeams } from '@/lib/teamManagement';
import { isValidUuid } from '@/lib/validation';
import { apiLogger as logger } from '@/logging/logger';

async function handleDelete(req: BetterAuthenticatedRequest, res: NextApiResponse): Promise<void> {
  const { teamId, tokenId } = req.query as { teamId: string; tokenId: string };

  if (!isValidUuid(teamId)) {
    res.status(400).json({ success: false, error: 'Invalid teamId — must be a UUID' });
    return;
  }

  if (!isValidUuid(tokenId)) {
    res.status(400).json({ success: false, error: 'Invalid tokenId — must be a UUID' });
    return;
  }

  // Verify user is a member of this team before allowing token revocation
  const teams = await getUserTeams(req.user.id);
  if (!teams.some(t => t.id === teamId)) {
    res.status(403).json({ success: false, error: 'You do not have access to this team' });
    return;
  }

  try {
    const deleted = await revokeApiToken(tokenId, teamId);

    if (!deleted) {
      res.status(404).json({ success: false, error: 'Token not found' });
      return;
    }

    logger.info({ tokenId, teamId, revokedBy: req.user.id }, 'API token revoked');

    res.status(200).json({ success: true, message: 'Token revoked' });
  } catch (error) {
    logger.error({ error, tokenId, teamId }, 'Failed to revoke API token');
    res.status(500).json({ success: false, error: 'Failed to revoke API token' });
  }
}

export default createBetterAuthApi(
  {
    DELETE: handleDelete,
  },
  'maintainer'
);
