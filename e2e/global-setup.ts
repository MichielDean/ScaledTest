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
 */

interface SeedUser {
  email: string;
  password: string;
  display_name: string;
  role: string;
}

export interface CachedTokens {
  maintainer: { accessToken: string; userId: string };
}

const SEED_USERS: SeedUser[] = [
  {
    email: 'maintainer@example.com',
    password: 'Maintainer123!',
    display_name: 'Maintainer User',
    role: 'maintainer',
  },
];

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
  user: SeedUser
): Promise<{ accessToken: string; userId: string }> {
  const res = await fetch(`${baseURL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: user.password }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to login ${user.email}: HTTP ${res.status} ${res.statusText} — ${body}`
    );
  }

  const data = await res.json() as { access_token: string; user: { id: string } };
  return { accessToken: data.access_token, userId: data.user.id };
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL =
    config.projects[0]?.use?.baseURL ??
    process.env.E2E_BASE_URL ??
    'http://localhost:8080';

  // Seed users
  for (const user of SEED_USERS) {
    await seedUser(baseURL, user);
  }

  // Login once per role and cache tokens
  const maintainerLogin = await loginUser(
    baseURL,
    SEED_USERS.find(u => u.role === 'maintainer')!
  );

  const tokens: CachedTokens = {
    maintainer: maintainerLogin,
  };

  const authDir = path.join(__dirname, '.auth');
  fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(path.join(authDir, 'tokens.json'), JSON.stringify(tokens, null, 2));
}
