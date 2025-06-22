import { execSync } from 'child_process';
import { spawn, ChildProcess } from 'child_process';
import waitOn from 'wait-on';
import path from 'path';
import { teardown } from './teardown';
import { setupOpenSearchTestEnv } from '../utils/testEnvSetup';
import { testLogger } from '../../src/utils/logger';

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
 * Start environment using Docker Compose
 */
export async function startDockerEnvironment(): Promise<void> {
  if (!isDockerRunning()) {
    throw new Error('Docker is not running. Please start Docker and try again.');
  }

  testLogger.info('Starting Docker environment');
  const dockerComposePath = path.resolve(process.cwd(), 'docker/docker-compose.yml');

  try {
    execSync(`docker compose -f "${dockerComposePath}" up -d`, { stdio: 'inherit' });
    testLogger.info('Docker containers started successfully'); // Wait for services to be ready
    testLogger.info('Waiting for Keycloak to be ready');
    await waitOn({
      resources: ['http://localhost:8080'],
      timeout: 60000, // 60 seconds timeout
    });

    testLogger.info('Waiting for OpenSearch to be ready');
    await waitOn({
      resources: ['http://localhost:9200'],
      timeout: 60000, // 60 seconds timeout
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
    testLogger.info('Setting up Keycloak configuration...');
    execSync('node scripts/setup-keycloak.js', { stdio: 'inherit' });
    testLogger.info('Keycloak setup completed');
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
  testLogger.info('Starting Next.js application...');

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
            testLogger.info(`Cleaning up existing process on port 3000, PID: ${pid.trim()}`);
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
      testLogger.info('No existing processes found on port 3000');
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
      testLogger.info(`Next.js: ${data.toString().trim()}`);
    });

    nextAppProcess.stderr?.on('data', data => {
      const output = data.toString().trim();
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
      testLogger.info(`Next.js process exited with code ${code} and signal ${signal}`);
    });

    nextAppProcess.on('error', error => {
      testLogger.error({ err: error }, 'Next.js process error');
    });

    // Wait for Next.js to be ready with retry logic
    testLogger.info('Waiting for Next.js to be ready...');

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

    testLogger.info('Next.js application is ready');
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
 * Main setup function for Jest
 */
export default async function setup(): Promise<void> {
  testLogger.info('Starting system test environment setup...');

  try {
    // Set up required environment variables
    setupOpenSearchTestEnv();

    // First try to clean up any existing environment
    // Ignore any errors if nothing is running
    try {
      await teardown();
    } catch {
      testLogger.info(
        'No previous environment to clean up, or clean up failed (this is usually okay)'
      );
    }

    // Start fresh environment
    await prepareNextApp();
    await startDockerEnvironment();
    await setupKeycloak();
    await startNextApp();

    testLogger.info('System test environment setup completed successfully');
  } catch (error) {
    testLogger.error({ err: error }, 'System test environment setup failed');
    // Try to clean up anything that might have started
    await teardown();
    throw error;
  }
}

// Export the Next.js process for teardown
export { nextAppProcess };
