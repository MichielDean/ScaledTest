/**
 * /api/admin/invitations/[token]
 *
 * GET    — Preview invitation details (public, no auth required).
 *   Returns 200 { invitation: PublicInvitation }
 *   Returns 404 if not found, 410 if expired/accepted/revoked.
 *
 * POST   — Accept invitation: create account + assign role (public, no auth required).
 *   Body: { name: string; password: string }
 *   Returns 201 { message: string }
 *   Returns 400 if validation fails or email already taken.
 *   Rolls back user creation if role assignment fails.
 *
 * DELETE — Revoke invitation (maintainer or owner only).
 *   Returns 200 { message: string }
 *   Returns 404 if not found.
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { auth, authAdminApi } from '@/lib/auth';
import { getRequestLogger, logError } from '@/logging/logger';
import {
  getInvitationByToken,
  revokeInvitation,
  markInvitationAccepted,
  type Invitation,
} from '@/lib/invitations';
import { authClient } from '@/lib/auth-client';
import type { RoleName } from '@/lib/auth-shared';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Safe public view of an invitation — no tokenHash, no internal fields. */
interface PublicInvitation {
  id: string;
  email: string;
  role: string;
  expiresAt: Date;
  createdAt: Date;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract and validate the raw token from req.query.token. */
function extractToken(req: NextApiRequest): string | null {
  const { token } = req.query;
  if (!token || typeof token !== 'string') return null;
  return token;
}

/** Check if an invitation is usable (not expired, accepted, or revoked). */
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

/** Determine the caller's role from the session (returns null if unauthenticated). */
async function getCallerRole(req: NextApiRequest): Promise<RoleName | null> {
  try {
    const session = await auth.api.getSession({
      headers: new Headers(req.headers as Record<string, string>),
    });
    if (!session?.user) return null;
    return ((session.user as { role?: RoleName }).role as RoleName) ?? null;
  } catch {
    return null;
  }
}

/** Returns true if the role is at least maintainer. */
function isMaintainerOrAbove(role: RoleName | null): boolean {
  return role === 'maintainer' || role === 'owner';
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

  const { name, password } = req.body as { name?: unknown; password?: unknown };

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'Missing or invalid name' });
    return;
  }

  if (!password || typeof password !== 'string' || password.length === 0) {
    res.status(400).json({ error: 'Missing or invalid password' });
    return;
  }

  let inv: Invitation | null;
  try {
    inv = await getInvitationByToken(rawToken);
  } catch (error) {
    reqLogger.error({ error }, 'DB error fetching invitation for acceptance');
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

  // Create user account via Better Auth
  const signUpResult = await authClient.signUp.email({
    email: inv.email,
    password,
    name: name.trim(),
  });

  if (signUpResult.error || !signUpResult.data?.user) {
    const message = signUpResult.error?.message ?? 'Registration failed';
    reqLogger.warn({ email: inv.email, error: message }, 'Sign-up failed during invitation accept');
    res.status(400).json({ error: message });
    return;
  }

  const newUserId = signUpResult.data.user.id;

  // Assign role — roll back user on failure
  try {
    await authAdminApi?.updateUser?.({ userId: newUserId, role: inv.role });
  } catch (roleError) {
    reqLogger.error(
      { error: roleError, userId: newUserId, role: inv.role },
      'Role assignment failed — rolling back user creation'
    );
    try {
      await authAdminApi?.deleteUser?.({ userId: newUserId });
    } catch (deleteError) {
      reqLogger.error(
        { error: deleteError, userId: newUserId },
        'Rollback failed: could not delete user'
      );
    }
    res.status(500).json({ error: 'Failed to assign role. Please try again.' });
    return;
  }

  // Mark invitation accepted
  try {
    await markInvitationAccepted(inv.id);
  } catch (acceptError) {
    // Non-fatal: user is created and role is assigned. Log and continue.
    reqLogger.warn(
      { error: acceptError, invitationId: inv.id },
      'Could not mark invitation as accepted — user was created successfully'
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
  // Auth check
  const callerRole = await getCallerRole(req);
  if (!callerRole) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (!isMaintainerOrAbove(callerRole)) {
    res.status(403).json({ error: 'Insufficient permissions. Maintainer or owner required.' });
    return;
  }

  const rawToken = extractToken(req);
  if (!rawToken) {
    res.status(400).json({ error: 'Missing token parameter' });
    return;
  }

  let revoked: boolean;
  try {
    revoked = await revokeInvitation(rawToken);
  } catch (error) {
    reqLogger.error({ error }, 'DB error revoking invitation');
    res.status(500).json({ error: 'Failed to revoke invitation' });
    return;
  }

  if (!revoked) {
    res.status(404).json({ error: 'Invitation not found or already used/revoked' });
    return;
  }

  reqLogger.info({ token: rawToken }, 'Invitation revoked');
  res.status(200).json({ message: 'Invitation revoked' });
}
