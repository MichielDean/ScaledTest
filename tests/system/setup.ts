import waitOn from 'wait-on';
import { teardown } from './teardown';
import { setupTestEnv } from '../setup/environmentConfiguration';
import { testLogger } from '../../src/logging/logger';
import { getRequiredEnvVar } from '../../src/environment/env';
import { execSync } from 'child_process';

type TestUser = {
  email: string;
  name: string;
  password: string;
  role: string;
};

const TEST_USERS: TestUser[] = [
  {
    email: 'user@scaledtest.com',
    name: 'Test User',
    password: 'TestUser123!',
    role: 'user',
  },
  {
    email: 'admin@scaledtest.com',
    name: 'Admin User',
    password: 'Admin123!',
    role: 'admin',
  },
];

async function registerNewUser(user: TestUser) {
  testLogger.info(`Creating user: ${user.email} with role: ${user.role}`);

  const baseUrl = getRequiredEnvVar('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000');
  const response: Response = await fetch(`${baseUrl}/api/auth/register-with-role`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: user.email,
      password: user.password,
      name: user.name,
      role: user.role,
    }),
  });

  if (response.ok) {
    testLogger.info(`User ${user.email} created successfully with role: ${user.role}`);
    return;
  }

  // Try to parse the response as JSON for more actionable error info
  let errorDetails: Record<string, unknown> | null = null;
  let responseBody: string = await response.text();
  try {
    errorDetails = JSON.parse(responseBody);
  } catch {
    // Not JSON, leave as string
  }

  // Build a more actionable error message
  const status = response.status;
  const statusText = response.statusText;
  const apiMessage = errorDetails?.message || errorDetails?.error || responseBody;

  throw new Error(
    `Failed to create user during test setup: ${user.email} (role: ${user.role}) - Status: ${status} ${statusText} - API message: ${apiMessage}`
  );
}

/**
 * Start Next.js application using PM2 for system tests
 */
export async function startAllResources(): Promise<void> {
  // All orchestration (Docker, migrations, Next.js) is handled by scripts/start-dev-server.js via npm run pm2:dev
  // This function simply starts the dev environment and waits for readiness
  const port = 3000;
  testLogger.info(`Starting Next.js application using PM2 (npm run pm2:dev) on port ${port}`);
  try {
    execSync('npm run pm2:dev', {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        TEST_PORT: port.toString(),
      },
    });

    // Wait for Next.js to be ready
    await waitOn({
      resources: [`http://localhost:${port}`],
      timeout: 60000, // 60 seconds
      log: true,
      interval: 500,
    });
    testLogger.info(`Next.js application is ready on port ${port}`);
  } catch (error) {
    testLogger.error({ err: error }, 'Failed to start Next.js application with PM2');
    throw error;
  }
}

/**
 * Quick cleanup function using PM2 for initial setup
 */
async function stopAllResources(): Promise<void> {
  testLogger.info('Performing cleanup of existing environment...');

  try {
    execSync('npm run pm2:stop', {
      stdio: 'ignore',
      timeout: 10000,
    });
  } catch (error) {
    testLogger.debug({ err: error }, 'Stopping resources had issues');
  }
}

/**
 * Main setup function for Jest with improved error handling
 */
export default async function setup(): Promise<void> {
  try {
    // Set up required environment variables
    setupTestEnv();

    await stopAllResources();
    await startAllResources();

    // Set up test users
    await Promise.all(TEST_USERS.map((user: TestUser) => registerNewUser(user)));
  } catch (error) {
    testLogger.error({ err: error }, 'System test environment setup failed');

    // Try to clean up anything that might have started, but don't let cleanup errors mask the original error
    try {
      await teardown();
    } catch (cleanupError) {
      testLogger.warn({ err: cleanupError }, 'Cleanup after failed setup also encountered issues');
    }

    throw error;
  }
}
