// tests/system/setup-functions.ts
// This file contains the original setup functions from setup.ts
import { execSync } from 'child_process';
import { spawn, ChildProcess } from 'child_process';
import waitOn from 'wait-on';
import path from 'path';
import { teardown } from './teardown';
import { setupOpenSearchTestEnv } from '../utils/testEnvSetup';

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

  console.log('Starting Docker environment...');

  try {
    // Navigate to docker directory and start the containers
    execSync('cd docker && docker compose up -d', { stdio: 'inherit' });
    console.log('Docker containers started successfully');
  } catch (error) {
    console.error('Failed to start Docker environment:', error);
    throw error;
  }
}

/**
 * Setup Keycloak with required configuration
 */
export async function setupKeycloak(): Promise<void> {
  console.log('Setting up Keycloak configuration...');

  try {
    // Run the Keycloak setup script
    execSync('node scripts/setup-keycloak.js', { stdio: 'inherit' });
    console.log('Keycloak setup completed');
  } catch (error) {
    console.error('Failed to set up Keycloak:', error);
    throw error;
  }
}

/**
 * Start Next.js application
 */
export async function startNextApp(): Promise<void> {
  console.log('Starting Next.js application...');

  try {
    // First build the app
    execSync('npm run build', { stdio: 'inherit' });

    // Then start it
    nextAppProcess = spawn('npm', ['run', 'start'], {
      stdio: 'inherit',
      detached: true,
    });

    // Wait for the app to be available
    await waitOn({
      resources: ['http://localhost:3000'],
      timeout: 60000,
      verbose: true,
    });

    console.log('Next.js application started successfully');
  } catch (error) {
    console.error('Failed to start Next.js application:', error);
    throw error;
  }
}

// Export the teardown functions so they can be used elsewhere
export { teardown };
