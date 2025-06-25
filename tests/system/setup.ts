import { execSync } from 'child_process';
import { spawn, ChildProcess } from 'child_process';
import waitOn from 'wait-on';
import path from 'path';
import { teardown } from './teardown';
import { setupOpenSearchTestEnv } from '../setup/environmentConfiguration';
import { testLogger } from '../../src/logging/logger';

// Global variables to track processes
let nextAppProcess: ChildProcess | null = null;

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

    // Wait for services to be ready with longer timeouts in CI
    const serviceTimeout = isCI ? 60000 : 60000; // 60s both in CI and locally

    await waitOn({
      resources: ['http://localhost:8080'],
      timeout: serviceTimeout,
    });

    await waitOn({
      resources: ['http://localhost:9200'],
      timeout: serviceTimeout,
    });
  } catch (error) {
    testLogger.error({ err: error }, 'Failed to start Docker environment');
    throw error;
  }
}

/**
 * Setup Keycloak configuration
 */
export async function setupKeycloak(): Promise<void> {
  try {
    execSync('node scripts/setup-keycloak.js', { stdio: 'inherit' });
  } catch (error) {
    testLogger.error({ err: error }, 'Failed to setup Keycloak');
    throw error;
  }
}

/**
 * Preprations required before stating the application
 */
export async function prepareNextApp(): Promise<void> {
  execSync('npm run format', { stdio: 'inherit' });
  execSync('npm run build', { stdio: 'inherit' });
}

/**
 * Start Next.js app
 */
export async function startNextApp(): Promise<void> {
  // Check if port 3000 is already in use and clean it up
  if (process.platform === 'win32') {
    try {
      const findCommand = `Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess`;
      const result = execSync(`powershell -Command "${findCommand}"`, {
        encoding: 'utf8',
        timeout: 5000,
      }).trim();

      if (result) {
        const pids = result.split('\n').filter(pid => pid.trim());
        for (const pid of pids) {
          if (pid.trim()) {
            try {
              execSync(`taskkill /F /PID ${pid.trim()}`, { timeout: 5000 });
            } catch (killError) {
              testLogger.warn({ err: killError }, `Failed to kill existing PID ${pid.trim()}`);
            }
          }
        }
        // Wait for port to be released
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch {
      // Silently continue if port check fails
    }
  }

  // Use next start to run the production build
  // You might want to build the app first if it's not already built
  try {
    // Start the Next.js app
    nextAppProcess = spawn('npx', ['next', 'start'], {
      stdio: 'pipe',
      shell: true,
    });

    nextAppProcess.stdout?.on('data', data => {
      testLogger.info(`Next.js: ${data.toString('utf8').trim()}`);
    });

    nextAppProcess.stderr?.on('data', data => {
      const output = data.toString('utf8').trim();
      // Filter out expected npm cleanup messages during teardown
      if (
        output.includes('npm verbose') ||
        output.includes('npm info') ||
        output.includes('npm warn Unknown')
      ) {
        testLogger.debug(`Next.js cleanup: ${output}`);
      } else {
        testLogger.error(`Next.js error: ${output}`);
      }
    });

    // Handle process exit
    nextAppProcess.on('exit', (code, signal) => {
      if (code !== 0 && code !== null) {
        testLogger.error(`Next.js process exited with code ${code} and signal ${signal}`);
      }
    });

    nextAppProcess.on('error', error => {
      testLogger.error({ err: error }, 'Next.js process error');
    });

    // Wait for Next.js to be ready with retry logic
    let retries = 0;
    const maxRetries = 6; // 60 seconds total

    while (retries < maxRetries) {
      try {
        await waitOn({
          resources: ['http://localhost:3000'],
          timeout: 10000, // 10 seconds per attempt
        });
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
    testLogger.error({ err: error }, 'Failed to start Next.js application');

    // Cleanup if startup failed
    if (nextAppProcess && !nextAppProcess.killed) {
      try {
        nextAppProcess.kill('SIGTERM');
      } catch (killError) {
        testLogger.warn({ err: killError }, 'Failed to cleanup failed Next.js process');
      }
    }

    throw error;
  }
}

/**
 * Quick cleanup function for initial setup - aggressive cleanup without long timeouts
 */
async function quickCleanup(): Promise<void> {
  testLogger.info('Performing quick cleanup of existing environment...');

  // Quick Next.js process cleanup
  if (nextAppProcess && !nextAppProcess.killed) {
    try {
      nextAppProcess.kill('SIGKILL');
    } catch (error) {
      testLogger.debug({ err: error }, 'Quick Next.js cleanup had issues');
    }
  }

  // Aggressive port 3000 cleanup on Windows
  if (process.platform === 'win32') {
    try {
      const findCommand = `Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess`;
      const result = execSync(`powershell -Command "${findCommand}"`, {
        encoding: 'utf8',
        timeout: 3000,
      }).trim();

      if (result) {
        const pids = result.split('\n').filter(pid => pid.trim());
        for (const pid of pids) {
          if (pid.trim()) {
            try {
              execSync(`taskkill /F /PID ${pid.trim()}`, { timeout: 2000 });
            } catch (killError) {
              testLogger.debug(
                { err: killError },
                `Quick cleanup: couldn't kill PID ${pid.trim()}`
              );
            }
          }
        }
      }
    } catch (portError) {
      testLogger.debug({ err: portError }, 'Quick port cleanup had issues');
    }
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

    // Alternative: kill all running containers that might be from our compose
    try {
      if (process.platform === 'win32') {
        execSync('powershell -Command "docker ps -q | ForEach-Object { docker kill $_ }"', {
          stdio: 'ignore',
          timeout: 5000,
        });
      } else {
        execSync('docker kill $(docker ps -q)', {
          stdio: 'ignore',
          timeout: 5000,
        });
      }
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
    await prepareNextApp();

    // Set up required environment variables
    setupOpenSearchTestEnv();

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
    await setupKeycloak();
    await startNextApp();
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

// Export the Next.js process for teardown
export { nextAppProcess };
