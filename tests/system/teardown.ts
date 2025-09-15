import { execSync } from 'child_process';
import path from 'path';

/**
 * Aggressive system teardown - minimal logging, maximum efficiency
 */

/**
 * Kill Next.js app using PM2
 */
async function killNextApp(): Promise<void> {
  try {
    // Stop PM2 processes
    execSync('npm run pm2:stop', {
      stdio: 'ignore',
      timeout: 10000,
    });
  } catch {
    // Silent failure - try direct PM2 command
    try {
      execSync('npx pm2 stop scaledtest-dev', {
        stdio: 'ignore',
        timeout: 5000,
      });
    } catch {
      // Silent failure
    }
  }
}

/**
 * Force close database connections
 */
async function forceCloseDatabases(): Promise<void> {
  try {
    const { shutdownTimescaleDB } = await import('../../src/lib/timescaledb');
    await shutdownTimescaleDB();
  } catch {
    // Silent failure
  }
}

/**
 * Force shutdown Docker environment with volume cleanup
 */
async function forceKillDocker(): Promise<void> {
  const dockerComposePath = path.resolve(process.cwd(), 'docker/docker-compose.yml');

  try {
    // Stop and remove containers, networks, and volumes
    execSync(
      `docker compose -f "${dockerComposePath}" down --remove-orphans --volumes --timeout 5`,
      {
        stdio: 'ignore',
        timeout: 15000, // Increased timeout for volume cleanup
      }
    );
  } catch {
    // Silent failure - try alternative cleanup
    try {
      // Force remove any remaining volumes
      execSync('docker volume prune --force', {
        stdio: 'ignore',
        timeout: 10000,
      });
    } catch {
      // Silent failure
    }
  }
}

/**
 * Aggressive teardown function - kill everything quickly and quietly
 */
export async function teardown(): Promise<void> {
  // Parallel aggressive shutdown - don't wait for each step
  await Promise.allSettled([forceCloseDatabases(), killNextApp()]);

  // Brief pause for cleanup
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Final Docker cleanup
  await forceKillDocker();
}

export default teardown;
