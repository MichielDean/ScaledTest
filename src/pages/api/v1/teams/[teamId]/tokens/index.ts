/**
 * GET  /api/v1/teams/[teamId]/tokens  — list API tokens for a team
 * POST /api/v1/teams/[teamId]/tokens  — create a new API token
 *
 * Auth: maintainer or owner required
 *
 * POST body: { name: string, expiresAt?: string (ISO date) }
 *
 * POST response 201:
 * {
 *   success: true,
 *   data: {
 *     id, name, tokenPrefix, teamId, createdByUserId, createdAt,
 *     lastUsedAt, expiresAt,
 *     token: "<raw secret — shown ONCE>"
 *   }
 * }
 *
 * GET response 200:
 * {
 *   success: true,
 *   data: ApiToken[]   // no token hash, no raw secret
 * }
 */

import type { NextApiResponse } from 'next';
import { createBetterAuthApi, type BetterAuthenticatedRequest } from '@/auth/betterAuthApi';
import {
  generateToken,
  getTokenDisplayPrefix,
  hashToken,
  createApiToken,
  listApiTokens,
} from '@/lib/apiTokens';
import { getUserTeams } from '@/lib/teamManagement';
import { isValidUuid } from '@/lib/validation';
import { apiLogger as logger } from '@/logging/logger';

/** Maximum token expiration: 1 year from now */
const MAX_EXPIRATION_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Verify the authenticated user is a member of the given team.
 * Returns true if the user belongs to the team, false otherwise.
 */
async function verifyTeamMembership(userId: string, teamId: string): Promise<boolean> {
  const teams = await getUserTeams(userId);
  return teams.some(t => t.id === teamId);
}

// ── POST handler ──────────────────────────────────────────────────────────────

async function handlePost(req: BetterAuthenticatedRequest, res: NextApiResponse): Promise<void> {
  const { teamId } = req.query as { teamId: string };

  if (!isValidUuid(teamId)) {
    res.status(400).json({ success: false, error: 'Invalid teamId — must be a UUID' });
    return;
  }

  // Verify user is a member of this team before allowing token operations
  if (!(await verifyTeamMembership(req.user.id, teamId))) {
    res.status(403).json({ success: false, error: 'You do not have access to this team' });
    return;
  }

  const { name, expiresAt: expiresAtRaw } = req.body as {
    name?: string;
    expiresAt?: string;
  };

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ success: false, error: 'name is required' });
    return;
  }

  let expiresAt: Date | null = null;
  if (expiresAtRaw) {
    const parsed = new Date(expiresAtRaw);
    if (isNaN(parsed.getTime())) {
      res.status(400).json({ success: false, error: 'expiresAt must be a valid ISO date' });
      return;
    }
    if (parsed <= new Date()) {
      res.status(400).json({ success: false, error: 'expiresAt must be in the future' });
      return;
    }
    if (parsed.getTime() > Date.now() + MAX_EXPIRATION_MS) {
      res.status(400).json({
        success: false,
        error: 'expiresAt cannot be more than 1 year in the future',
      });
      return;
    }
    expiresAt = parsed;
  }

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const tokenPrefix = getTokenDisplayPrefix(rawToken);

  try {
    const created = await createApiToken({
      name: name.trim(),
      tokenHash,
      tokenPrefix,
      teamId,
      createdByUserId: req.user.id,
      expiresAt,
    });

    logger.info({ tokenId: created.id, teamId, createdBy: req.user.id }, 'API token created');

    // Return the raw token exactly once — it will never be retrievable again
    res.status(201).json({
      success: true,
      data: {
        ...created,
        token: rawToken,
      },
    });
  } catch (error) {
    logger.error({ error, teamId }, 'Failed to create API token');
    res.status(500).json({ success: false, error: 'Failed to create API token' });
  }
}

// ── GET handler ───────────────────────────────────────────────────────────────

async function handleGet(req: BetterAuthenticatedRequest, res: NextApiResponse): Promise<void> {
  const { teamId } = req.query as { teamId: string };

  if (!isValidUuid(teamId)) {
    res.status(400).json({ success: false, error: 'Invalid teamId — must be a UUID' });
    return;
  }

  // Verify user is a member of this team before listing tokens
  if (!(await verifyTeamMembership(req.user.id, teamId))) {
    res.status(403).json({ success: false, error: 'You do not have access to this team' });
    return;
  }

  try {
    const tokens = await listApiTokens(teamId);
    res.status(200).json({ success: true, data: tokens });
  } catch (error) {
    logger.error({ error, teamId }, 'Failed to list API tokens');
    res.status(500).json({ success: false, error: 'Failed to list API tokens' });
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

export default createBetterAuthApi(
  {
    GET: handleGet,
    POST: handlePost,
  },
  'maintainer'
);
