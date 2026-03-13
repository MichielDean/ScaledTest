import { expect, type Page, type APIRequestContext } from '@playwright/test';

export const MAINTAINER = {
  email: 'maintainer@example.com',
  password: 'Maintainer123!',
};

export interface AuthSession {
  accessToken: string;
  userId: string;
}

/** Login via the browser UI form. */
export async function loginViaUI(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(MAINTAINER.email);
  await page.getByLabel('Password').fill(MAINTAINER.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL('/');
}

/** Login via API and return access token. */
export async function loginViaAPI(request: APIRequestContext): Promise<AuthSession> {
  const loginRes = await request.post('/auth/login', {
    data: { email: MAINTAINER.email, password: MAINTAINER.password },
  });
  expect(loginRes.ok(), `Login failed: ${loginRes.status()}`).toBeTruthy();
  const data = await loginRes.json();
  return { accessToken: data.access_token, userId: data.user.id };
}

/** Auth headers for JWT-based API calls. */
export function authHeaders(session: AuthSession): Record<string, string> {
  return { Authorization: `Bearer ${session.accessToken}` };
}

/** Auth headers for API-token-based calls. */
export function tokenHeaders(apiToken: string): Record<string, string> {
  return { Authorization: `Bearer ${apiToken}` };
}

/** Get an existing team or create one. Returns team ID. */
export async function getOrCreateTeam(
  request: APIRequestContext,
  session: AuthSession,
): Promise<string> {
  const listRes = await request.get('/api/v1/teams', {
    headers: authHeaders(session),
  });
  if (listRes.ok()) {
    const data = await listRes.json();
    if (data.teams?.length > 0) {
      return data.teams[0].id;
    }
  }
  const createRes = await request.post('/api/v1/teams', {
    headers: authHeaders(session),
    data: { name: `e2e-team-${Date.now()}` },
  });
  expect(createRes.ok(), 'Failed to create team').toBeTruthy();
  const team = await createRes.json();
  return team.id;
}

/** Create an API token scoped to a team. Returns the raw token string. */
export async function createAPIToken(
  request: APIRequestContext,
  session: AuthSession,
  teamId: string,
): Promise<string> {
  const res = await request.post(`/api/v1/teams/${teamId}/tokens`, {
    headers: authHeaders(session),
    data: { name: `e2e-token-${Date.now()}` },
  });
  expect(res.ok(), 'Failed to create API token').toBeTruthy();
  const data = await res.json();
  return data.token;
}

/** Build a valid CTRF report payload. */
export function buildCtrfReport(toolName = 'E2E-Test-Tool'): Record<string, unknown> {
  const now = Date.now();
  return {
    results: {
      tool: { name: toolName, version: '1.0.0' },
      summary: {
        tests: 3,
        passed: 2,
        failed: 1,
        skipped: 0,
        pending: 0,
        other: 0,
        start: now - 5000,
        stop: now,
      },
      tests: [
        { name: 'Test passes A', status: 'passed', duration: 1250 },
        { name: 'Test passes B', status: 'passed', duration: 890 },
        {
          name: 'Test fails C',
          status: 'failed',
          duration: 500,
          message: 'Expected true to be false',
        },
      ],
      environment: { appName: 'ScaledTest-E2E', branchName: 'main' },
    },
  };
}
