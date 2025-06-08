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
 * Start Next.js app
 */
export async function startNextApp(): Promise<void> {
  testLogger.info('Starting Next.js application...');

  // Use next start to run the production build
  // You might want to build the app first if it's not already built
  try {
    // Check if we need to build first
    execSync('npm run build', { stdio: 'inherit' });

    // Start the Next.js app
    nextAppProcess = spawn('npx', ['next', 'start'], {
      stdio: 'pipe',
      shell: true,
    });

    nextAppProcess.stdout?.on('data', data => {
      testLogger.info(`Next.js: ${data.toString().trim()}`);
    });

    nextAppProcess.stderr?.on('data', data => {
      testLogger.error(`Next.js error: ${data.toString().trim()}`);
    });

    // Wait for Next.js to be ready
    testLogger.info('Waiting for Next.js to be ready...');
    await waitOn({
      resources: ['http://localhost:3000'],
      timeout: 30000, // 30 seconds timeout
    });

    testLogger.info('Next.js application is ready');
  } catch (error) {
    testLogger.error({ err: error }, 'Failed to start Next.js application');
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
