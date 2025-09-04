#!/usr/bin/env node

/**
 * PM2-compatible development server management script
 * This script provides methods for starting, stopping, and managing the development server
 * It can be called directly or with command arguments for different operations
 */

import { spawn, execSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import process from 'process';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Set the working directory to project root
process.chdir(projectRoot);

// Load environment variables from .env file
config();

const PROCESS_NAME = 'scaledtest-dev';

// Windows-specific spawn options to prevent visible command windows
const getSpawnOptions = (inheritStdio = true) => ({
  stdio: inheritStdio ? 'inherit' : 'pipe',
  shell: true,
  windowsHide: true, // Prevent command windows on Windows
  detached: false,
});

// Function to run database migrations
function runMigrations() {
  return new Promise((resolve, reject) => {
    console.log('🗃️ Running database migrations...');

    // Run Better Auth migrations first
    console.log('📝 Running Better Auth migrations...');
    const betterAuthProcess = spawn(
      'npx',
      ['@better-auth/cli', 'migrate', '--yes'],
      getSpawnOptions()
    );

    betterAuthProcess.on('close', code => {
      if (code === 0) {
        console.log('✅ Better Auth migrations completed successfully');

        // Run TimescaleDB migrations
        console.log('📝 Running TimescaleDB migrations...');
        const timescaleProcess = spawn(
          'npx',
          ['node-pg-migrate', 'up', '--migrations-dir', 'migrations/scaledtest'],
          {
            ...getSpawnOptions(),
            env: {
              ...process.env,
              DATABASE_URL: process.env.TIMESCALE_DATABASE_URL, // Use TIMESCALE_DATABASE_URL for node-pg-migrate
            },
          }
        );

        timescaleProcess.on('close', code => {
          if (code === 0) {
            console.log('✅ TimescaleDB migrations completed successfully');
            resolve();
          } else {
            console.error(`❌ TimescaleDB migration failed with exit code ${code}`);
            reject(new Error(`TimescaleDB migration failed with exit code ${code}`));
          }
        });

        timescaleProcess.on('error', error => {
          console.error('❌ Error running TimescaleDB migrations:', error);
          reject(error);
        });
      } else {
        console.error(`❌ Better Auth migration failed with exit code ${code}`);
        reject(new Error(`Better Auth migration failed with exit code ${code}`));
      }
    });

    betterAuthProcess.on('error', error => {
      console.error('❌ Error running Better Auth migrations:', error);
      reject(error);
    });
  });
}

// Function to start Docker Compose
function startDockerCompose() {
  return new Promise((resolve, reject) => {
    console.log('🐳 Starting Docker services...');

    const dockerProcess = spawn(
      'docker',
      ['compose', '-f', 'docker/docker-compose.yml', 'up', '-d'],
      getSpawnOptions()
    );

    dockerProcess.on('close', code => {
      if (code === 0) {
        console.log('✅ Docker services started successfully');
        resolve();
      } else {
        console.error(`❌ Docker compose failed with exit code ${code}`);
        reject(new Error(`Docker compose failed with exit code ${code}`));
      }
    });

    dockerProcess.on('error', error => {
      console.error('❌ Error starting Docker:', error);
      reject(error);
    });
  });
}

// Function to start Next.js development server
function startNextDev(environment = 'development') {
  console.log(`⚡ Starting Next.js development server with Turbopack (${environment})...`);

  const nextProcess = spawn('npx', ['next', 'dev', '--turbopack'], {
    ...getSpawnOptions(),
    env: {
      ...process.env,
      NODE_ENV: environment,
      PORT: process.env.PORT || (environment === 'test' ? process.env.TEST_PORT || '3000' : '3000'),
    },
  });

  nextProcess.on('close', code => {
    console.log(`Next.js development server exited with code ${code}`);
    process.exit(code);
  });

  nextProcess.on('error', error => {
    console.error('❌ Error starting Next.js:', error);
    process.exit(1);
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Gracefully shutting down...');
    nextProcess.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    console.log('\n🛑 Gracefully shutting down...');
    nextProcess.kill('SIGTERM');
  });
}

// Function to stop PM2 process
export function stopPM2() {
  try {
    console.log(`🛑 Stopping PM2 process: ${PROCESS_NAME}`);
    execSync(`npx pm2 stop ${PROCESS_NAME}`, {
      stdio: 'inherit',
      windowsHide: true,
    });
    console.log('✅ PM2 process stopped successfully');
    return true;
  } catch {
    console.log('ℹ️ No PM2 process to stop or already stopped');
    return false;
  }
}

// Function to delete PM2 processes
export function deletePM2() {
  try {
    console.log('🗑️ Deleting all PM2 processes');
    execSync('npx pm2 delete all', {
      stdio: 'inherit',
      windowsHide: true,
    });
    console.log('✅ PM2 processes deleted successfully');
    return true;
  } catch {
    console.log('ℹ️ No PM2 processes to delete');
    return false;
  }
}

// Function to start PM2 process
export function startPM2(environment = 'development') {
  try {
    console.log(`🚀 Starting PM2 process: ${PROCESS_NAME} in ${environment} mode`);

    // Use different script arguments based on environment
    const scriptArgs = environment === 'test' ? '-- test' : '';

    execSync(`npx pm2 start ${__filename} --name ${PROCESS_NAME} ${scriptArgs}`, {
      stdio: 'inherit',
      windowsHide: true,
    });
    console.log('✅ PM2 process started successfully');
    return true;
  } catch (error) {
    console.error('❌ Error starting PM2 process:', error.message);
    return false;
  }
}

// Function to restart PM2 process
export function restartPM2() {
  try {
    console.log(`🔄 Restarting PM2 process: ${PROCESS_NAME}`);
    execSync(`npx pm2 restart ${PROCESS_NAME}`, {
      stdio: 'inherit',
      windowsHide: true,
    });
    console.log('✅ PM2 process restarted successfully');
    return true;
  } catch (error) {
    console.error('❌ Error restarting PM2 process:', error.message);
    return false;
  }
}

// Function to show PM2 logs
export function logsPM2() {
  try {
    console.log(`📋 PM2 Logs for ${PROCESS_NAME}:`);
    execSync(`npx pm2 logs ${PROCESS_NAME} --lines 50 --nostream`, {
      stdio: 'inherit',
      windowsHide: true,
    });
    return true;
  } catch (error) {
    console.error('❌ Error getting PM2 logs:', error.message);
    return false;
  }
}

// Main startup function for development server
async function startDevelopmentServer(environment = 'development') {
  try {
    console.log('🚀 Starting ScaledTest development server...');
    console.log(`📁 Working directory: ${process.cwd()}`);
    console.log(`🌍 Environment: ${environment}`);

    await startDockerCompose();
    await runMigrations();
    startNextDev(environment);
  } catch (error) {
    console.error('❌ Failed to start development environment:', error);
    process.exit(1);
  }
}

// Command-line interface
async function main() {
  const command = process.argv[2];
  const environment = process.argv[3] || 'development';

  switch (command) {
    case 'stop':
      stopPM2();
      break;
    case 'delete':
      deletePM2();
      break;
    case 'restart':
      restartPM2();
      break;
    case 'logs':
      logsPM2();
      break;
    case 'start':
      startPM2(environment);
      break;
    default:
      // Default behavior when run without arguments (for PM2 compatibility)
      await startDevelopmentServer(environment);
      break;
  }
}

// Run main function if this script is executed directly OR by PM2
const currentFileUrl = import.meta.url;
const executedFileUrl = pathToFileURL(process.argv[1]).href;

// Check if this script is being executed directly or by PM2
const isDirectExecution = currentFileUrl === executedFileUrl;
const isPM2Execution = process.argv[1].includes('ProcessContainerFork.js');

if (isDirectExecution || isPM2Execution) {
  main().catch(error => {
    console.error('❌ Script execution failed:', error);
    process.exit(1);
  });
}
