/**
 * /api/admin/invitations/[token]
 *
 * GET    — Preview invitation details (public, no auth required).
 *   Returns 200 { invitation: PublicInvitation }
 *   Returns 404 if not found, 410 if expired/accepted/revoked.
 *
 * POST   — Accept invitation: create account + assign role (public, no auth required).
 *   Body: { name: string; password: string; email: string }
 *   - email must match the invited email (case-insensitive)
 *   - Atomically claims the invitation via conditional UPDATE (TOCTOU guard)
 *   - Unclaims on any failure so the invitation can be retried
 *   Returns 201 { message: string }
 *   Returns 400 if validation fails or email mismatch
 *   Returns 410 if invitation not found / expired / already accepted / revoked
 *   Returns 500 with rollback if role assignment fails
 *
 * DELETE — Revoke invitation (maintainer or owner only).
 *   Returns 200 { message: string }
 *   Returns 404 if not found.
 *
 * Security note — raw token in URL path:
 *   The token travels as a path param (/api/admin/invitations/:token).
 *   This application uses pino without a request serializer; no framework
 *   middleware logs req.url. This handler never logs the raw token or req.url.
 *   Structured log fields use invitationId (UUID) only. HTTPS in transit is
 *   assumed for production deployments.
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { authAdminApi } from '@/lib/auth';
import { authenticateRequest } from '@/auth/betterAuthApi';
import { getRequestLogger, logError } from '@/logging/logger';
import {
  claimInvitationForAcceptance,
  unclaimInvitation,
  getInvitationByToken,
  markInvitationAccepted,
  revokeInvitation,
  normaliseEmail,
  validatePassword,
  type Invitation,
} from '@/lib/invitations';

// ── Types ─────────────────────────────────────────────────────────────────────
/** Safe public view of an invitation — no tokenHash, no internal fields. */
interface PublicInvitation {
  id: string;
  email: string;
  role: string;
  expiresAt: Date;
  createdAt: Date;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_NAME_LENGTH = 100;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract and validate the raw token from req.query.token. */
function extractToken(req: NextApiRequest): string | null {
  const { token } = req.query;
  if (!token || typeof token !== 'string') return null;
  return token;
}

/** Check if an invitation is still previewable (not expired, accepted, or revoked). */
function isInvitationValid(inv: Invitation): { valid: boolean; reason?: string } {
  if (inv.revokedAt) return { valid: false, reason: 'revoked' };
  if (inv.acceptedAt) return { valid: false, reason: 'accepted' };
  if (inv.expiresAt < new Date()) return { valid: false, reason: 'expired' };
  return { valid: true };
}

/** Strip sensitive fields for public consumption. */
function publicInvitation(inv: Invitation): PublicInvitation {
  return {
    id: inv.id,
    email: inv.email,
    role: inv.role,
    expiresAt: inv.expiresAt,
    createdAt: inv.createdAt,
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const reqLogger = getRequestLogger(req);

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(req, res, reqLogger);
      case 'POST':
        return await handlePost(req, res, reqLogger);
      case 'DELETE':
        return await handleDelete(req, res, reqLogger);
      default:
        return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }
  } catch (error) {
    logError(reqLogger, 'Unhandled error in /api/admin/invitations/[token]', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ── GET handler ───────────────────────────────────────────────────────────────

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  reqLogger: ReturnType<typeof getRequestLogger>
): Promise<void> {
  const rawToken = extractToken(req);
  if (!rawToken) {
    res.status(400).json({ error: 'Missing token parameter' });
    return;
  }

  let inv: Invitation | null;
  try {
    inv = await getInvitationByToken(rawToken);
  } catch (error) {
    reqLogger.error({ error }, 'DB error fetching invitation');
    res.status(500).json({ error: 'Failed to fetch invitation' });
    return;
  }

  if (!inv) {
    res.status(404).json({ error: 'Invitation not found' });
    return;
  }

  const { valid, reason } = isInvitationValid(inv);
  if (!valid) {
    res.status(410).json({ error: `Invitation is no longer valid (${reason})` });
    return;
  }

  reqLogger.info({ invitationId: inv.id }, 'Invitation preview fetched');
  res.status(200).json({ invitation: publicInvitation(inv) });
}

// ── POST handler (accept) ─────────────────────────────────────────────────────

async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  reqLogger: ReturnType<typeof getRequestLogger>
): Promise<void> {
  const rawToken = extractToken(req);
  if (!rawToken) {
    res.status(400).json({ error: 'Missing token parameter' });
    return;
  }

  const {
    name,
    password,
    email: emailInput,
  } = req.body as {
    name?: unknown;
    password?: unknown;
    email?: unknown;
  };

  // Validate name
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'Missing or invalid name' });
    return;
  }
  if (name.trim().length > MAX_NAME_LENGTH) {
    res.status(400).json({ error: `Name must be ${MAX_NAME_LENGTH} characters or fewer` });
    return;
  }

  // Validate password strength before hitting the DB
  if (!password || typeof password !== 'string') {
    res.status(400).json({ error: 'Missing or invalid password' });
    return;
  }
  const passwordError = validatePassword(password);
  if (passwordError) {
    res.status(400).json({ error: passwordError });
    return;
  }

  // Require email confirmation before touching the DB
  if (!emailInput || typeof emailInput !== 'string' || emailInput.trim().length === 0) {
    res.status(400).json({ error: 'Missing email confirmation' });
    return;
  }

  // Fail fast if authAdminApi is not available — we cannot create or assign a role to the user.
  // This check must happen BEFORE any DB side effects (claim, createUser) to avoid
  // creating orphan users or claimed-but-unfinishable invitations.
  if (!authAdminApi?.createUser || !authAdminApi?.updateUser) {
    reqLogger.error(
      {},
      'authAdminApi.createUser or authAdminApi.updateUser not available — cannot process invitation acceptance'
    );
    res.status(500).json({ error: 'Server configuration error. Please contact an administrator.' });
    return;
  }

  // Atomically claim the invitation.
  // This single UPDATE guards against TOCTOU races: only one concurrent request
  // can claim the invitation. Any subsequent request finds accepted_at IS NOT NULL
  // and receives null → 410.
  let inv: Invitation | null;
  try {
    inv = await claimInvitationForAcceptance(rawToken);
  } catch (error) {
    reqLogger.error({ error }, 'DB error claiming invitation for acceptance');
    res.status(500).json({ error: 'Failed to process invitation' });
    return;
  }

  if (!inv) {
    // Covers: not found, expired, already accepted, already revoked.
    res.status(410).json({ error: 'Invitation is not valid or has already been used' });
    return;
  }

  // Verify the requester-supplied email matches the invited email (case-insensitive).
  // This prevents an attacker holding a high-privilege token for alice@corp.com
  // from registering as attacker@evil.com and receiving alice's role.
  if (normaliseEmail(emailInput) !== inv.email) {
    // Unclaim so the rightful invitee can still use the token.
    // If unclaim fails the invitation is stuck — return 500 so the admin knows to re-issue it.
    try {
      await unclaimInvitation(inv.id);
    } catch (unclaimError) {
      reqLogger.error(
        { error: unclaimError, invitationId: inv.id },
        'CRITICAL: failed to unclaim invitation after email mismatch — invitation is stuck; re-issue required'
      );
      res.status(500).json({
        error: 'Server error. Please contact an administrator to re-issue the invitation.',
      });
      return;
    }
    res.status(400).json({ error: 'Email address does not match the invitation' });
    return;
  }

  // Create user account via the Better Auth admin API.
  // Using authAdminApi.createUser (server-side) instead of authClient.signUp.email because:
  // 1. Invitation acceptance inherently proves email ownership — no verification email needed.
  // 2. authClient.signUp.email goes through the standard signup flow which sends a verification
  //    email and may block login until the user verifies — defeating the purpose of invitations.
  // 3. The admin API sets emailVerified: true via the data field, matching the invitation intent.
  let createUserResult: { user: { id: string; email: string; name: string } };
  try {
    createUserResult = await authAdminApi.createUser({
      body: {
        email: inv.email,
        password,
        name: name.trim(),
        role: inv.role,
        data: { emailVerified: true },
      },
    });
  } catch (signUpError) {
    const message =
      signUpError instanceof Error ? signUpError.message : 'Registration failed';
    reqLogger.warn({ email: inv.email, error: message }, 'User creation failed during invitation accept');
    // Unclaim so the invitation can be retried after the signup issue is resolved.
    // If unclaim fails the invitation is stuck — return 500 so the admin knows to re-issue it.
    try {
      await unclaimInvitation(inv.id);
    } catch (unclaimError) {
      reqLogger.error(
        { error: unclaimError, invitationId: inv.id },
        'CRITICAL: failed to unclaim invitation after sign-up failure — invitation is stuck; re-issue required'
      );
      res.status(500).json({
        error: 'Server error. Please contact an administrator to re-issue the invitation.',
      });
      return;
    }
    res.status(400).json({ error: message });
    return;
  }

  const newUserId = createUserResult.user.id;

  // The role was already set by createUser above. This updateUser call is a belt-and-suspenders
  // check to ensure the role is correctly persisted via the admin API's role-setting path.
  // On failure: delete the user AND unclaim the invitation for retry.
  // Note: authAdminApi availability (createUser + updateUser) was already checked above.
  try {
    await authAdminApi.updateUser({ userId: newUserId, role: inv.role });
  } catch (roleError) {
    reqLogger.error(
      { error: roleError, userId: newUserId, role: inv.role },
      'Role assignment failed — rolling back user creation and unclaiming invitation'
    );
    // Best-effort user deletion rollback. If deleteUser is unavailable (it's optional on the
    // interface), log a CRITICAL alert so an admin knows to clean up manually.
    if (authAdminApi.deleteUser) {
      try {
        await authAdminApi.deleteUser({ userId: newUserId });
      } catch (deleteError) {
        reqLogger.error(
          { error: deleteError, userId: newUserId },
          'Rollback failed: could not delete user'
        );
      }
    } else {
      reqLogger.error(
        { userId: newUserId },
        'CRITICAL: authAdminApi.deleteUser unavailable — orphaned user requires manual cleanup'
      );
    }
    // If unclaim fails the invitation is stuck — return a distinct message so the admin knows.
    try {
      await unclaimInvitation(inv.id);
    } catch (unclaimError) {
      reqLogger.error(
        { error: unclaimError, invitationId: inv.id },
        'CRITICAL: failed to unclaim invitation after role assignment failure — invitation is stuck; re-issue required'
      );
      res.status(500).json({
        error: 'Server error. Please contact an administrator to re-issue the invitation.',
      });
      return;
    }
    res.status(500).json({ error: 'Failed to assign role. Please try again.' });
    return;
  }

  // accepted_at was already set by claimInvitationForAcceptance. This call ensures
  // the timestamp is refreshed to the actual acceptance time (not the claim time).
  // Non-fatal: user exists with correct role regardless.
  try {
    await markInvitationAccepted(inv.id);
  } catch (acceptError) {
    reqLogger.warn(
      { error: acceptError, invitationId: inv.id },
      'Could not refresh accepted_at timestamp — user was created and role assigned successfully'
    );
  }

  reqLogger.info(
    { userId: newUserId, invitationId: inv.id, role: inv.role },
    'Invitation accepted'
  );
  res.status(201).json({ message: 'Account created successfully' });
}

// ── DELETE handler (revoke) ───────────────────────────────────────────────────

async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse,
  reqLogger: ReturnType<typeof getRequestLogger>
): Promise<void> {
  // Use the shared authenticateRequest helper so that both session-cookie auth
  // AND Bearer/API-token auth are supported — consistent with all other admin endpoints.
  const caller = await authenticateRequest(req);
  if (!caller) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (caller.role !== 'maintainer' && caller.role !== 'owner') {
    res.status(403).json({ error: 'Insufficient permissions. Maintainer or owner required.' });
    return;
  }

  const rawToken = extractToken(req);
  if (!rawToken) {
    res.status(400).json({ error: 'Missing token parameter' });
    return;
  }

  let revokedId: string | null;
  try {
    revokedId = await revokeInvitation(rawToken);
  } catch (error) {
    reqLogger.error({ error }, 'DB error revoking invitation');
    res.status(500).json({ error: 'Failed to revoke invitation' });
    return;
  }

  if (!revokedId) {
    res.status(404).json({ error: 'Invitation not found or already used/revoked' });
    return;
  }

  reqLogger.info({ invitationId: revokedId }, 'Invitation revoked');
  res.status(200).json({ message: 'Invitation revoked' });
}
