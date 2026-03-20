import { FullConfig } from '@playwright/test';

/**
 * Playwright global setup — seeds test users before the suite runs.
 *
 * Creates each user via POST /auth/register. A 409 (email already registered)
 * is treated as success so the setup is idempotent across repeated runs.
 */

interface SeedUser {
  email: string;
  password: string;
  display_name: string;
}

const SEED_USERS: SeedUser[] = [
  {
    email: 'maintainer@example.com',
    password: 'Maintainer123!',
    display_name: 'Maintainer User',
  },
];

const REQUEST_TIMEOUT_MS = 10_000;

async function seedUser(baseURL: string, user: SeedUser): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${baseURL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (res.ok || res.status === 409) {
    // 201 Created — new user; 409 Conflict — user already exists. Both are fine.
    return;
  }

  const body = await res.text();
  throw new Error(
    `Failed to seed user ${user.email}: HTTP ${res.status} ${res.statusText} — ${body}`
  );
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL =
    config.projects[0]?.use?.baseURL ??
    process.env.E2E_BASE_URL ??
    'http://localhost:8080';

  for (const user of SEED_USERS) {
    await seedUser(baseURL, user);
  }
}
