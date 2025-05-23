import { execSync } from 'child_process';
import path from 'path';
import { nextAppProcess } from './setup';
import { testLogger } from '../../src/utils/logger';

/**
 * Shutdown the Next.js app
 */
export async function stopNextApp(): Promise<void> {
  if (nextAppProcess) {
    testLogger.info('Stopping Next.js application');

    // On Windows, we need to use a different approach to kill the process
    if (process.platform === 'win32') {
      try {
        // Find the PID by the port and kill it
        const findCommand = `Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object -ExpandProperty OwningProcess`;
        const pid = execSync(`powershell -Command "${findCommand}"`, { encoding: 'utf8' }).trim();

        if (pid) {
          console.log(`Killing Next.js process with PID ${pid}`);
          execSync(`taskkill /F /PID ${pid}`);
        }
      } catch (error) {
        console.error('Error stopping Next.js app:', error);
      }
    } else {
      // On non-Windows platforms
      nextAppProcess.kill('SIGTERM');
    }

    // Ensure the process is marked as null after killing
    console.log('Next.js application stopped');
  }
}

/**
 * Shutdown Docker environment
 */
export async function stopDockerEnvironment(): Promise<void> {
  console.log('Stopping Docker environment...');
  const dockerComposePath = path.resolve(process.cwd(), 'docker/docker-compose.yml');

  try {
    execSync(`docker-compose -f "${dockerComposePath}" down`, { stdio: 'inherit' });
    console.log('Docker environment stopped successfully');
  } catch (error) {
    console.error('Error stopping Docker environment:', error);
    throw error;
  }
}

/**
 * Main teardown function for Jest
 */
export async function teardown(): Promise<void> {
  console.log('Starting system test environment teardown...');

  try {
    // Stop the Next.js app
    await stopNextApp();

    // Stop Docker environment
    await stopDockerEnvironment();

    console.log('System test environment teardown completed successfully');
  } catch (error) {
    console.error('System test environment teardown failed:', error);
    throw error;
  }
}

export default teardown;
