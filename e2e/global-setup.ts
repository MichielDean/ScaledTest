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
  try {
    return await loginUser(baseURL, OWNER_EMAIL, OWNER_PASSWORD);
  } catch {
    return null;
  }
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

async function getOrCreateTeam(baseURL: string, authToken: string): Promise<string> {
  const listRes = await fetch(`${baseURL}/api/v1/teams`, {
    headers: { Authorization: `Bearer ${authToken}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!listRes.ok) throw new Error(`Failed to list teams: ${listRes.status}`);
  const data = (await listRes.json()) as { teams: Array<{ id: string }> };
  if (data.teams?.length > 0) {
    return data.teams[0].id;
  }
  const createRes = await fetch(`${baseURL}/api/v1/teams`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ name: 'e2e-seed-team' }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!createRes.ok) throw new Error(`Failed to create team: ${createRes.status}`);
  const team = (await createRes.json()) as { id: string };
  return team.id;
}

async function createSeedAPIToken(
  baseURL: string,
  authToken: string,
  teamId: string
): Promise<string> {
  const res = await fetch(`${baseURL}/api/v1/teams/${teamId}/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ name: 'e2e-seed-token' }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create seed API token: ${res.status} — ${body}`);
  }
  const data = (await res.json()) as { token: string };
  return data.token;
}

/**
 * Submit representative CTRF reports so the dashboard and analytics views
 * render real data rather than empty states. Three reports are spread across
 * three distinct calendar days (today, yesterday, 2 days ago) so the
 * pass-rate trend chart has multiple data points.
 *
 * The server's ?created_at= backdating parameter is used to pin each report
 * to noon UTC on its respective date. This parameter is only accepted when
 * ST_DISABLE_RATE_LIMIT=true, which is set in the E2E environment.
 *
 * Pass rates are intentionally varied:
 *   Report 1 (2 days ago): 50% pass rate (6/12 passed)  — dip
 *   Report 2 (yesterday):  75% pass rate (6/8  passed)  — recovery
 *   Report 3 (today):      ~92% pass rate (11/12 passed) — improvement
 */
async function seedCTRFReports(baseURL: string, apiToken: string): Promise<void> {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiToken}`,
  };
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  // Returns an RFC3339 timestamp pinned to noon UTC on a given number of days ago.
  // Using noon UTC ensures the date is unambiguous regardless of the server timezone.
  const backdateISO = (daysAgo: number): string => {
    const d = new Date(now - daysAgo * dayMs);
    d.setUTCHours(12, 0, 0, 0);
    return d.toISOString();
  };

  const reports: Array<{ daysAgo: number; body: Record<string, unknown> }> = [
    // ── Report 1: low pass rate, 2 days ago ───────────────────────────────────
    {
      daysAgo: 2,
      body: {
        results: {
          tool: { name: 'E2E-Seed-Suite', version: '1.0.0' },
          summary: {
            tests: 12,
            passed: 6,
            failed: 5,
            skipped: 1,
            pending: 0,
            other: 0,
            start: now - 2 * dayMs - 300_000,
            stop: now - 2 * dayMs,
          },
          tests: [
            { name: 'login renders correctly', status: 'passed', duration: 1200 },
            { name: 'dashboard loads stat cards', status: 'passed', duration: 850 },
            { name: 'analytics trends chart renders', status: 'passed', duration: 920 },
            { name: 'team settings save', status: 'passed', duration: 430 },
            { name: 'report submission returns 201', status: 'passed', duration: 310 },
            { name: 'API token auth is enforced', status: 'passed', duration: 420 },
            {
              name: 'flaky network timeout test',
              status: 'failed',
              duration: 4200,
              message: 'Expected worker to complete within 3s but timed out after 4.2s',
              trace:
                'Error: Timeout 3000ms exceeded.\n  at Worker.waitForCompletion (worker.ts:142)\n  at Context.<anonymous> (execution.spec.ts:87)',
            },
            {
              name: 'parallel worker coordination fails under load',
              status: 'failed',
              duration: 4500,
              message: 'Expected worker to complete within 3s but timed out after 4.5s',
              trace:
                'Error: Timeout 3000ms exceeded.\n  at Worker.waitForCompletion (worker.ts:142)\n  at Context.<anonymous> (execution.spec.ts:87)',
            },
            {
              name: 'quality gate evaluation passes',
              status: 'failed',
              duration: 1200,
              message: 'AssertionError: expected pass rate 0.5 to be >= 0.8',
              trace:
                'at QualityGateEvaluator.evaluate (quality.go:98)\n  at TestQualityGatePass (quality_test.go:45)',
            },
            {
              name: 'user invitation flow completes',
              status: 'failed',
              duration: 2100,
              message: 'Error: invitation email not delivered within timeout',
            },
            {
              name: 'webhook delivery succeeds',
              status: 'failed',
              duration: 1800,
              message: 'Error: webhook delivery returned 500',
            },
            { name: 'admin user management list renders', status: 'skipped', duration: 0 },
          ],
          environment: { appName: 'ScaledTest', branchName: 'main' },
        },
      },
    },

    // ── Report 2: recovering pass rate, yesterday ──────────────────────────────
    {
      daysAgo: 1,
      body: {
        results: {
          tool: { name: 'E2E-Seed-Suite', version: '1.0.0' },
          summary: {
            tests: 8,
            passed: 6,
            failed: 1,
            skipped: 1,
            pending: 0,
            other: 0,
            start: now - dayMs - 240_000,
            stop: now - dayMs,
          },
          tests: [
            { name: 'login renders correctly', status: 'passed', duration: 1100 },
            { name: 'dashboard loads stat cards', status: 'passed', duration: 790 },
            { name: 'analytics trends chart renders', status: 'passed', duration: 880 },
            { name: 'report submission returns 201', status: 'passed', duration: 280 },
            { name: 'API token auth is enforced', status: 'passed', duration: 390 },
            { name: 'team settings save', status: 'passed', duration: 415 },
            {
              name: 'parallel worker coordination fails under load',
              status: 'failed',
              duration: 4500,
              message: 'Expected worker to complete within 3s but timed out after 4.5s',
              trace:
                'Error: Timeout 3000ms exceeded.\n  at Worker.waitForCompletion (worker.ts:142)\n  at Context.<anonymous> (execution.spec.ts:87)',
            },
            { name: 'admin user management list renders', status: 'skipped', duration: 0 },
          ],
          environment: { appName: 'ScaledTest', branchName: 'feat/fix-worker' },
        },
      },
    },

    // ── Report 3: near-perfect pass rate, today ────────────────────────────────
    {
      daysAgo: 0,
      body: {
        results: {
          tool: { name: 'E2E-Seed-Suite', version: '1.0.0' },
          summary: {
            tests: 12,
            passed: 11,
            failed: 0,
            skipped: 1,
            pending: 0,
            other: 0,
            start: now - 60_000,
            stop: now,
          },
          tests: [
            { name: 'login renders correctly', status: 'passed', duration: 1050 },
            { name: 'dashboard loads stat cards', status: 'passed', duration: 810 },
            { name: 'analytics trends chart renders', status: 'passed', duration: 900 },
            { name: 'team settings save', status: 'passed', duration: 410 },
            { name: 'report submission returns 201', status: 'passed', duration: 295 },
            { name: 'quality gate evaluation passes', status: 'passed', duration: 540 },
            { name: 'user invitation flow completes', status: 'passed', duration: 720 },
            { name: 'webhook delivery succeeds', status: 'passed', duration: 660 },
            { name: 'API token auth is enforced', status: 'passed', duration: 400 },
            {
              name: 'flaky network timeout test',
              status: 'passed',
              duration: 1950,
              flaky: true,
              retry: 1,
            },
            {
              name: 'parallel worker coordination fails under load',
              status: 'passed',
              duration: 2800,
            },
            { name: 'admin user management list renders', status: 'skipped', duration: 0 },
          ],
          environment: { appName: 'ScaledTest', branchName: 'main' },
        },
      },
    },
  ];

  for (const { daysAgo, body } of reports) {
    const createdAt = encodeURIComponent(backdateISO(daysAgo));
    const url = `${baseURL}/api/v1/reports?created_at=${createdAt}`;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const responseBody = await res.text();
      throw new Error(`Failed to seed CTRF report: ${res.status} — ${responseBody}`);
    }
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

  // Seed representative CTRF reports so the dashboard and analytics views
  // render real data instead of empty state in E2E screenshots.
  const teamId = await getOrCreateTeam(baseURL, maintainerLogin.accessToken);
  const seedApiToken = await createSeedAPIToken(baseURL, maintainerLogin.accessToken, teamId);
  await seedCTRFReports(baseURL, seedApiToken);
}
