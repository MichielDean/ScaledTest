#!/usr/bin/env tsx

/**
 * PM2-compatible development server management script (TypeScript)
 * This script provides methods for starting, stopping, and managing the development server
 * It can be called directly or with command arguments for different operations
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import process from 'process';
import { config } from 'dotenv';
import { testLogger } from '@/logging/logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Set the working directory to project root
process.chdir(projectRoot);

// Load environment variables from .env file
config();

const PROCESS_NAME = 'scaledtest-dev';

// Function to stop PM2 process
export function stopPM2() {
  testLogger.info(`Stopping PM2 process: ${PROCESS_NAME}`);

  execSync(`npx pm2 stop ${PROCESS_NAME}`, {
    stdio: 'inherit',
    windowsHide: true,
  });

  testLogger.info('PM2 process stopped successfully');
}

// Function to delete PM2 processes and clean up Docker volumes
export function deletePM2() {
  testLogger.info('Deleting all PM2 processes');

  execSync('npx pm2 delete all', {
    stdio: 'inherit',
    windowsHide: true,
  });

  testLogger.info('PM2 processes deleted successfully');
}

// Function to start PM2 process using the runner script
export function startPM2(environment: string = 'development') {
  testLogger.info(`Starting PM2 process: ${PROCESS_NAME} in ${environment} mode`);

  execSync('npx pm2 start scripts/pm2-setup.js --name ' + PROCESS_NAME, {
    stdio: 'inherit',
    windowsHide: true,
  });

  testLogger.info('PM2 process started successfully');
}

// Function to restart PM2 process
export function restartPM2() {
  testLogger.info(`Restarting PM2 process: ${PROCESS_NAME}`);

  execSync(`npx pm2 restart ${PROCESS_NAME}`, {
    stdio: 'inherit',
    windowsHide: true,
  });

  testLogger.info('PM2 process restarted successfully');
}

// Function to show PM2 logs
export function logsPM2() {
  testLogger.info(`PM2 Logs for ${PROCESS_NAME}:`);

  execSync(`npx pm2 logs ${PROCESS_NAME} --lines 50 --nostream`, {
    stdio: 'inherit',
    windowsHide: true,
  });
}

function cleanupDockerEnvironment(): void {
  testLogger.info('Cleaning up Docker for fresh environment');

  execSync('docker compose -f docker/docker-compose.yml down --volumes --remove-orphans', {
    stdio: 'inherit',
    windowsHide: true,
  });

  testLogger.info('Docker cleaned up successfully');
}

// Command-line interface
async function main(): Promise<void> {
  const command = process.argv[2];
  switch (command) {
    case 'stop':
      stopPM2();
      cleanupDockerEnvironment();
      break;
    case 'delete':
      deletePM2();
      cleanupDockerEnvironment();
      break;
    case 'restart':
      cleanupDockerEnvironment();
      restartPM2();
      break;
    case 'logs':
      logsPM2();
      break;
    case 'start':
      cleanupDockerEnvironment();
      await startPM2();
      break;
    default:
      testLogger.error(
        'Unknown command. Usage: tsx scripts/start-dev-server.ts [start|stop|delete|restart|logs]'
      );
      process.exit(1);
  }
}

main();
