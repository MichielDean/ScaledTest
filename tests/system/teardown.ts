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

    try {
      // On Windows, we need to use a different approach to kill the process
      if (process.platform === 'win32') {
        // First try to gracefully terminate the process
        if (!nextAppProcess.killed) {
          nextAppProcess.kill('SIGTERM');

          // Wait a bit for graceful termination
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // If the process is still running, force kill by port
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
                testLogger.info(`Force killing process with PID ${pid.trim()}`);
                try {
                  execSync(`taskkill /F /PID ${pid.trim()}`, { timeout: 5000 });
                } catch (killError) {
                  testLogger.warn({ err: killError }, `Failed to kill PID ${pid.trim()}`);
                }
              }
            }
          }
        } catch (portError) {
          testLogger.warn(
            { err: portError },
            'No processes found on port 3000 or error checking port'
          );
        }
      } else {
        // On non-Windows platforms
        if (!nextAppProcess.killed) {
          nextAppProcess.kill('SIGTERM');

          // Wait a bit for graceful termination
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Force kill if still running
          if (!nextAppProcess.killed) {
            nextAppProcess.kill('SIGKILL');
          }
        }
      }
    } catch (error) {
      testLogger.error({ err: error }, 'Error stopping Next.js app');
    } finally {
      // Always set to null to avoid reuse
      if (nextAppProcess) {
        nextAppProcess.removeAllListeners();
      }
      // Don't set to null here as it's imported from setup.ts
    }

    // Add a small delay to ensure port is released
    await new Promise(resolve => setTimeout(resolve, 1000));
    testLogger.info('Next.js application stopped');
  } else {
    testLogger.info('No Next.js process to stop');
  }

  // Note: We can't directly modify the imported nextAppProcess variable here,
  // but the cleanup logic above should handle process termination
}

/**
 * Shutdown Docker environment
 */
export async function stopDockerEnvironment(): Promise<void> {
  testLogger.info('Stopping Docker environment...');
  const dockerComposePath = path.resolve(process.cwd(), 'docker/docker-compose.yml');

  try {
    execSync(`docker compose -f "${dockerComposePath}" down --volumes`, { stdio: 'inherit' });
    testLogger.info('Docker environment stopped successfully');
  } catch (error) {
    testLogger.error({ err: error }, 'Error stopping Docker environment');
    throw error;
  }
}

/**
 * Main teardown function for Jest
 */
export async function teardown(): Promise<void> {
  testLogger.info('Starting system test environment teardown...');

  try {
    // Stop the Next.js app
    await stopNextApp();

    // Stop Docker environment
    await stopDockerEnvironment();

    // Force process cleanup to ensure no hanging connections
    // This is particularly important in CI environments
    try {
      // Clear any remaining timers by ensuring no unnecessary timers are created
      const timeout = setTimeout(() => {}, 0);
      clearTimeout(timeout);
    } catch (err) {
      // Ignore any errors in cleanup
      testLogger.error({ err }, 'Error during timer cleanup');
    }

    // Add a small delay to ensure all resources are fully released
    await new Promise(resolve => setTimeout(resolve, 2000));

    testLogger.info('System test environment teardown completed successfully');
  } catch (error) {
    testLogger.error({ err: error }, 'System test environment teardown failed');
    throw error;
  }
}

export default teardown;
