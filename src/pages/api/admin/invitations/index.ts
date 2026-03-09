/**
 * /api/admin/invitations
 *
 * POST — Create a new invitation (maintainer or owner only).
 *   Body: { email: string; role: 'readonly' | 'maintainer' | 'owner'; teamId?: string }
 *   Returns 201 { invitation: SafeInvitation; token: string }
 *   Note: `token` is the raw invite token — only returned here, never again.
 *
 * GET  — List all invitations (maintainer or owner only).
 *   Returns 200 { invitations: SafeInvitation[] }
 */

import { NextApiResponse } from 'next';
import {
  BetterAuthenticatedRequest,
  BetterAuthMethodHandler,
  createBetterAuthApi,
} from '@/auth/betterAuthApi';
import { getRequestLogger } from '@/logging/logger';
import {
  generateInviteToken,
  hashInviteToken,
  normaliseEmail,
  createInvitation,
  listInvitations,
  type Invitation,
} from '@/lib/invitations';
import { validateUuid } from '@/lib/validation';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Invitation shape safe to return to API consumers — no tokenHash. */
export type SafeInvitation = Omit<Invitation, 'tokenHash'>;

/** Valid roles that can be assigned via invitation. */
const VALID_ROLES = ['readonly', 'maintainer', 'owner'] as const;
type InviteRole = (typeof VALID_ROLES)[number];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Strip tokenHash from an invitation before returning it to callers. */
function safeInvitation(inv: Invitation): SafeInvitation {
  const safe: Omit<Invitation, 'tokenHash'> = {
    id: inv.id,
    email: inv.email,
    role: inv.role,
    tokenPrefix: inv.tokenPrefix,
    invitedByUserId: inv.invitedByUserId,
    teamId: inv.teamId,
    expiresAt: inv.expiresAt,
    acceptedAt: inv.acceptedAt,
    revokedAt: inv.revokedAt,
    createdAt: inv.createdAt,
  };
  return safe;
}

/** Basic email validation — linear-time, no backtracking risk. */
function isValidEmail(email: unknown): email is string {
  if (typeof email !== 'string') return false;
  // Reject unreasonably long strings before any character scanning
  if (email.length > 254) return false;
  // Locate '@' — must appear exactly once, not at the start or end.
  const atIdx = email.indexOf('@');
  if (atIdx <= 0 || atIdx === email.length - 1 || atIdx !== email.lastIndexOf('@')) return false;
  const domain = email.slice(atIdx + 1);
  // Domain must contain at least one '.' that isn't at the start or end.
  const dotIdx = domain.indexOf('.');
  return dotIdx > 0 && dotIdx < domain.length - 1;
}

// ── Handlers ──────────────────────────────────────────────────────────────────

const handlePost: BetterAuthMethodHandler = async (
  req: BetterAuthenticatedRequest,
  res: NextApiResponse,
  reqLogger: ReturnType<typeof getRequestLogger>
) => {
  const { email, role, teamId } = req.body as {
    email?: unknown;
    role?: unknown;
    teamId?: unknown;
  };

  // Validate email
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Invalid or missing email address' });
  }

  // Validate role
  if (!role || !VALID_ROLES.includes(role as InviteRole)) {
    return res.status(400).json({
      error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`,
    });
  }

  // Maintainers can only invite readonly or maintainer — not owner
  if (req.user.role === 'maintainer' && role === 'owner') {
    return res.status(403).json({
      error: 'Maintainers cannot invite users with the owner role',
    });
  }

  // Validate optional teamId
  const resolvedTeamId =
    teamId !== undefined && teamId !== null && typeof teamId === 'string' ? teamId : null;

  // Validate teamId as UUID if provided
  if (resolvedTeamId !== null) {
    try {
      validateUuid(resolvedTeamId, 'teamId');
    } catch {
      return res.status(400).json({ error: 'Invalid teamId: must be a valid UUID' });
    }
  }

  try {
    const rawToken = generateInviteToken();
    const tokenHash = hashInviteToken(rawToken);
    // First 16 chars of raw token used as display prefix (includes 'inv_' prefix)
    const tokenPrefix = rawToken.substring(0, 16);

    const invitation = await createInvitation({
      email: normaliseEmail(email as string),
      role: role as string,
      tokenHash,
      tokenPrefix,
      invitedByUserId: req.user.id,
      teamId: resolvedTeamId,
    });

    reqLogger.info(
      { invitationId: invitation.id, email: invitation.email, role: invitation.role },
      'Invitation created'
    );

    return res.status(201).json({
      invitation: safeInvitation(invitation),
      token: rawToken,
    });
  } catch (error) {
    reqLogger.error({ error }, 'Failed to create invitation');
    return res.status(500).json({ error: 'Failed to create invitation' });
  }
};

const handleGet: BetterAuthMethodHandler = async (
  req: BetterAuthenticatedRequest,
  res: NextApiResponse,
  reqLogger: ReturnType<typeof getRequestLogger>
) => {
  const teamId = req.query.teamId && typeof req.query.teamId === 'string' ? req.query.teamId : null;

  // Validate teamId as UUID if provided — prevents unexpected Postgres cast errors
  if (teamId !== null) {
    try {
      validateUuid(teamId, 'teamId');
    } catch {
      return res.status(400).json({ error: 'Invalid teamId: must be a valid UUID' });
    }
  }

  try {
    const invitations = await listInvitations(teamId);

    reqLogger.info({ count: invitations.length }, 'Invitations listed');

    return res.status(200).json({
      invitations: invitations.map(safeInvitation),
    });
  } catch (error) {
    reqLogger.error({ error }, 'Failed to list invitations');
    return res.status(500).json({ error: 'Failed to list invitations' });
  }
};

// ── Export ────────────────────────────────────────────────────────────────────

/**
 * /api/admin/invitations
 *
 * Requires maintainer or owner role.
 * Readonly users cannot create or list invitations.
 */
export default createBetterAuthApi(
  {
    POST: handlePost,
    GET: handleGet,
  },
  'maintainer'
);
