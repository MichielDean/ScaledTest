import { execSync } from 'child_process';
import path from 'path';
import { nextAppProcess } from './setup';
import { testLogger } from '../../src/logging/logger';
import { cleanupPort } from '../../src/lib/portCleanup';

/**
 * Shutdown the Next.js app - fire and forget approach
 */
export async function stopNextApp(): Promise<void> {
  if (nextAppProcess !== null && nextAppProcess !== undefined && !nextAppProcess.killed) {
    try {
      nextAppProcess.kill('SIGKILL');
      nextAppProcess.removeAllListeners();
    } catch {
      // Ignore errors - fire and forget
    }
  }

  // Fire and forget port cleanup
  cleanupPort(3000, { maxRetries: 1, retryDelay: 100 }).catch(() => {
    // Ignore errors
  });
}

/**
 * Shutdown Docker environment - fire and forget approach
 */
export async function stopDockerEnvironment(): Promise<void> {
  const dockerComposePath = path.resolve(process.cwd(), 'docker/docker-compose.yml');

  testLogger.info('Starting Docker environment teardown...');

  // Fire and forget - just start the command and let it run in background
  try {
    execSync(`docker compose -f "${dockerComposePath}" down --remove-orphans`, {
      stdio: 'ignore',
    });
  } catch {
    // Ignore errors - fire and forget
  }

  testLogger.info('Docker environment teardown command executed');
}

/**
 * Main teardown function for Jest - fire and forget approach
 */
export async function teardown(): Promise<void> {
  // Fire and forget - don't wait for anything
  stopNextApp().catch(() => {
    // Ignore errors
  });

  stopDockerEnvironment().catch(() => {
    // Ignore errors
  });

  testLogger.info('System test environment teardown initiated');
}

export default teardown;
