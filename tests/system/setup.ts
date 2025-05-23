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
  } catch (error) {
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
    console.log('Setting up Keycloak configuration...');
    execSync('node scripts/setup-keycloak.js', { stdio: 'inherit' });
    console.log('Keycloak setup completed');
  } catch (error) {
    console.error('Failed to setup Keycloak:', error);
    throw error;
  }
}

/**
 * Start Next.js app
 */
export async function startNextApp(): Promise<void> {
  console.log('Starting Next.js application...');

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
      console.log(`Next.js: ${data.toString().trim()}`);
    });

    nextAppProcess.stderr?.on('data', data => {
      console.error(`Next.js error: ${data.toString().trim()}`);
    });

    // Wait for Next.js to be ready
    console.log('Waiting for Next.js to be ready...');
    await waitOn({
      resources: ['http://localhost:3000'],
      timeout: 30000, // 30 seconds timeout
    });

    console.log('Next.js application is ready');
  } catch (error) {
    console.error('Failed to start Next.js application:', error);
    throw error;
  }
}

/**
 * Main setup function for Jest
 */
export default async function setup(): Promise<void> {
  console.log('Starting system test environment setup...');

  try {
    // Set up required environment variables
    setupOpenSearchTestEnv();

    // First try to clean up any existing environment
    // Ignore any errors if nothing is running
    try {
      await teardown();
    } catch (error) {
      console.log('No previous environment to clean up, or clean up failed (this is usually okay)');
    }

    // Start fresh environment
    await startDockerEnvironment();
    await setupKeycloak();
    await startNextApp();

    console.log('System test environment setup completed successfully');
  } catch (error) {
    console.error('System test environment setup failed:', error);
    // Try to clean up anything that might have started
    await teardown();
    throw error;
  }
}

// Export the Next.js process for teardown
export { nextAppProcess };
