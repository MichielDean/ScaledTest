import { execSync } from 'child_process';
import waitOn from 'wait-on';
import path from 'path';
import { teardown } from './teardown';
import { setupTestEnv } from '../setup/environmentConfiguration';
import { testLogger } from '../../src/logging/logger';

/**
 * Checks if Docker is running
 */
function isDockerRunning(): boolean {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Start environment using Docker Compose with CI optimizations
 */
export async function startDockerEnvironment(): Promise<void> {
  if (!isDockerRunning()) {
    throw new Error('Docker is not running. Please start Docker and try again.');
  }

  const dockerComposePath = path.resolve(process.cwd(), 'docker/docker-compose.yml');

  // Check if we're in CI environment
  const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

  try {
    // Use pull policy and timeout optimizations for CI
    const composeCommand = isCI
      ? `docker compose -f "${dockerComposePath}" up -d --quiet-pull --wait --wait-timeout 180`
      : `docker compose -f "${dockerComposePath}" up -d`;

    execSync(composeCommand, { stdio: 'inherit' });

    // Wait for PostgreSQL to be ready
    const serviceTimeout = isCI ? 60000 : 60000; // 60s both in CI and locally

    await waitOn({
      resources: ['tcp:localhost:5432'],
      timeout: serviceTimeout,
    });
  } catch (error) {
    testLogger.error({ err: error }, 'Failed to start Docker environment');
    throw error;
  }
}

/**
 * Setup Better Auth test users
 */
export async function setupBetterAuth() {
  testLogger.info('Setting up Better Auth test users...');

  try {
    // Run the API-based Better Auth test user setup script
    // This runs after the Next.js app is started so API endpoints are available
    execSync('npx tsx scripts/setup-better-auth-test-users.ts', {
      cwd: process.cwd(),
      stdio: 'inherit',
    });

    testLogger.info('Better Auth test users setup completed successfully');
  } catch (error) {
    testLogger.error('Failed to setup Better Auth test users:', error);
    throw new Error('Better Auth test user setup failed');
  }
}

/**
 * Start Next.js application using PM2 for system tests
 */
export async function startNextApp(): Promise<void> {
  const port = 3000;
  testLogger.info(`Starting Next.js application using PM2 on port ${port}`);

  try {
    // Stop any existing PM2 processes
    try {
      execSync('npm run pm2:stop', {
        stdio: 'pipe',
        timeout: 10000,
      });
      testLogger.debug('Stopped existing PM2 processes');
    } catch {
      testLogger.debug('No existing PM2 processes to stop or stop command failed');
    }

    // Start the Next.js application using PM2 with test environment
    execSync('npm run pm2:dev', {
      stdio: 'pipe',
      timeout: 30000,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        TEST_PORT: port.toString(),
      },
    });

    testLogger.info('PM2 process started successfully');

    // Wait for Next.js to be ready with retry logic
    let retries = 0;
    const maxRetries = 6; // 60 seconds total

    while (retries < maxRetries) {
      try {
        await waitOn({
          resources: [`http://localhost:${port}`],
          timeout: 10000, // 10 seconds per attempt
        });
        testLogger.info(`Next.js application is ready on port ${port}`);
        break; // Success, exit the retry loop
      } catch (waitError) {
        retries++;
        testLogger.warn(
          { err: waitError, attempt: retries },
          `Attempt ${retries} failed, retrying...`
        );

        if (retries >= maxRetries) {
          const errorMessage = waitError instanceof Error ? waitError.message : String(waitError);
          throw new Error(`Next.js failed to start after ${maxRetries} attempts: ${errorMessage}`);
        }

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  } catch (error) {
    testLogger.error({ err: error }, 'Failed to start Next.js application with PM2');

    // Cleanup if startup failed
    try {
      execSync('npm run pm2:stop', { stdio: 'pipe', timeout: 10000 });
      testLogger.debug('Cleaned up failed PM2 process');
    } catch (cleanupError) {
      testLogger.warn({ err: cleanupError }, 'Failed to cleanup failed PM2 process');
    }

    throw error;
  }
}

/**
 * Quick cleanup function using PM2 for initial setup
 */
async function quickCleanup(): Promise<void> {
  testLogger.info('Performing quick cleanup of existing environment...');

  // Stop any existing PM2 processes
  try {
    execSync('npm run pm2:stop', {
      stdio: 'ignore',
      timeout: 10000,
    });
  } catch (error) {
    testLogger.debug({ err: error }, 'Quick PM2 cleanup had issues');
  }

  // Aggressive Docker cleanup with short timeout
  const dockerComposePath = path.resolve(process.cwd(), 'docker/docker-compose.yml');
  try {
    // Force stop all containers quickly
    execSync(`docker compose -f "${dockerComposePath}" kill`, {
      stdio: 'ignore',
      timeout: 5000,
    });

    // Quick removal
    execSync(`docker compose -f "${dockerComposePath}" down --remove-orphans`, {
      stdio: 'ignore',
      timeout: 10000,
    });
  } catch (dockerError) {
    testLogger.debug({ err: dockerError }, 'Quick Docker cleanup had issues, trying alternative');

    // Alternative: try to kill Docker containers using cross-platform commands
    try {
      // Get list of running containers and kill them
      execSync('docker kill $(docker ps -q) 2>/dev/null || true', {
        stdio: 'ignore',
        timeout: 5000,
      });
    } catch (altError) {
      testLogger.debug({ err: altError }, 'Alternative Docker cleanup also had issues');
    }
  }

  // Brief pause to let resources be released
  await new Promise(resolve => setTimeout(resolve, 1000));
  testLogger.info('Quick cleanup completed');
}

/**
 * Main setup function for Jest with improved error handling
 */
export default async function setup(): Promise<void> {
  try {
    // Set up required environment variables
    setupTestEnv();

    // First try to clean up any existing environment quickly
    // Use a more resilient and faster cleanup approach
    try {
      await quickCleanup();
    } catch (cleanupError) {
      // Log warning but don't fail setup due to cleanup issues
      testLogger.warn(
        { err: cleanupError },
        'Previous environment cleanup had issues, but continuing with setup'
      );
    }

    // Start fresh environment
    await startDockerEnvironment();
    await startNextApp();
    await setupBetterAuth();
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
