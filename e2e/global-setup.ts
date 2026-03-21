import { FullConfig } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Playwright global setup — seeds test users and caches JWT tokens before the suite runs.
 *
 * Creates each user via POST /auth/register. A 409 (email already registered)
 * is treated as success so the setup is idempotent across repeated runs.
 *
 * After seeding, logs in once per role and writes tokens to e2e/.auth/tokens.json.
 * Tests import loadCachedToken() from helpers.ts instead of calling loginViaAPI()
 * on every test, avoiding the rate limiter (httprate.LimitByIP(10, 1*time.Minute)).
 *
 * Owner seeding: the public /auth/register endpoint sets role='maintainer' by default.
 * To create an owner user, we use the invitation flow: the maintainer creates a team,
 * invites owner@example.com with role='owner', then accepts the invitation. The token
 * is returned in the invitation creation response, so no email delivery is needed.
 */

interface SeedUser {
  email: string;
  password: string;
  display_name: string;
}

export interface CachedTokens {
  maintainer: { accessToken: string; userId: string };
  owner: { accessToken: string; userId: string };
}

const MAINTAINER_USER: SeedUser = {
  email: 'maintainer@example.com',
  password: 'Maintainer123!',
  display_name: 'Maintainer User',
};

export const OWNER_EMAIL = 'owner@example.com';
export const OWNER_PASSWORD = 'Owner123!';

const REQUEST_TIMEOUT_MS = 10_000;

async function seedUser(baseURL: string, user: SeedUser): Promise<void> {
  const res = await fetch(`${baseURL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: user.email,
      password: user.password,
      display_name: user.display_name,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (res.ok || res.status === 409) {
    // 201 Created — new user; 409 Conflict — user already exists. Both are fine.
    return;
  }

  const body = await res.text();
  throw new Error(
    `Failed to seed user ${user.email}: HTTP ${res.status} ${res.statusText} — ${body}`
  );
}

async function loginUser(
  baseURL: string,
  email: string,
  password: string
): Promise<{ accessToken: string; userId: string }> {
  const res = await fetch(`${baseURL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to login ${email}: HTTP ${res.status} ${res.statusText} — ${body}`
    );
  }

  const data = (await res.json()) as { access_token: string; user: { id: string } };
  return { accessToken: data.access_token, userId: data.user.id };
}

/**
 * Try to login as the owner. Returns null if the credentials are wrong or user doesn't exist.
 * Used to make owner seeding idempotent across repeated global-setup runs.
 */
async function tryLoginOwner(
  baseURL: string
): Promise<{ accessToken: string; userId: string } | null> {
  const res = await fetch(`${baseURL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token: string; user: { id: string } };
  return { accessToken: data.access_token, userId: data.user.id };
}

/**
 * Seed the owner user via the invitation flow so that owner@example.com has
 * role='owner' in the users table (not possible via /auth/register which defaults
 * to 'maintainer').
 *
 * Flow:
 *   1. Maintainer gets-or-creates a team.
 *   2. Maintainer creates an invitation for owner@example.com with role='owner'.
 *      The raw token is returned in the API response (no email delivery needed).
 *   3. Accept the invitation → INSERT INTO users … role='owner'.
 */
async function seedOwnerViaInvitation(baseURL: string, maintainerToken: string): Promise<void> {
  // Step 1: get or create a team so we have a teamID for the invitation
  let teamId: string;
  const teamsRes = await fetch(`${baseURL}/api/v1/teams`, {
    headers: { Authorization: `Bearer ${maintainerToken}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!teamsRes.ok) throw new Error(`Failed to list teams: ${teamsRes.status}`);
  const teamsData = (await teamsRes.json()) as { teams: Array<{ id: string }> };
  if (teamsData.teams?.length > 0) {
    teamId = teamsData.teams[0].id;
  } else {
    const createRes = await fetch(`${baseURL}/api/v1/teams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${maintainerToken}`,
      },
      body: JSON.stringify({ name: 'e2e-seed-team' }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!createRes.ok) throw new Error(`Failed to create team: ${createRes.status}`);
    const team = (await createRes.json()) as { id: string };
    teamId = team.id;
  }

  // Step 2: create invitation for owner@example.com with role='owner'
  const inviteRes = await fetch(`${baseURL}/api/v1/teams/${teamId}/invitations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${maintainerToken}`,
    },
    body: JSON.stringify({ email: OWNER_EMAIL, role: 'owner' }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!inviteRes.ok) {
    const body = await inviteRes.text();
    throw new Error(`Failed to create owner invitation: ${inviteRes.status} — ${body}`);
  }
  const { token } = (await inviteRes.json()) as { token: string };

  // Step 3: accept invitation → creates owner user with role='owner'
  const acceptRes = await fetch(`${baseURL}/api/v1/invitations/${token}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: OWNER_PASSWORD, display_name: 'Owner User' }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!acceptRes.ok) {
    const body = await acceptRes.text();
    throw new Error(`Failed to accept owner invitation: ${acceptRes.status} — ${body}`);
  }
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL =
    config.projects[0]?.use?.baseURL ??
    process.env.E2E_BASE_URL ??
    'http://localhost:8080';

  // Seed maintainer
  await seedUser(baseURL, MAINTAINER_USER);

  // Login as maintainer (token used for owner seeding API calls below)
  const maintainerLogin = await loginUser(baseURL, MAINTAINER_USER.email, MAINTAINER_USER.password);

  // Seed owner (idempotent: try login first; create via invitation only if missing)
  let ownerLogin = await tryLoginOwner(baseURL);
  if (!ownerLogin) {
    await seedOwnerViaInvitation(baseURL, maintainerLogin.accessToken);
    ownerLogin = await loginUser(baseURL, OWNER_EMAIL, OWNER_PASSWORD);
  }

  const tokens: CachedTokens = {
    maintainer: maintainerLogin,
    owner: ownerLogin,
  };

  const authDir = path.join(__dirname, '.auth');
  fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(path.join(authDir, 'tokens.json'), JSON.stringify(tokens, null, 2));
}
