import { execSync } from 'child_process';
import path from 'path';
import { nextAppProcess } from './setup';
import { testLogger } from '../../src/logging/logger';

/**
 * Shutdown the Next.js app with timeout protection
 */
export async function stopNextApp(): Promise<void> {
  if (nextAppProcess) {
    try {
      // Wrap process cleanup in a timeout to prevent hanging in CI
      await Promise.race([
        (async () => {
          try {
            // First try graceful termination
            if (!nextAppProcess.killed) {
              nextAppProcess.kill('SIGTERM');
              await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // Force kill if still running
            if (!nextAppProcess.killed) {
              if (process.platform === 'win32') {
                // Windows-specific cleanup
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
                          execSync(`taskkill /F /PID ${pid.trim()}`, { timeout: 3000 });
                        } catch (killError) {
                          testLogger.warn({ err: killError }, `Failed to kill PID ${pid.trim()}`);
                        }
                      }
                    }
                  }
                } catch (portError) {
                  testLogger.warn({ err: portError }, 'Could not check port 3000 processes');
                }
              } else {
                // Unix-like systems
                nextAppProcess.kill('SIGKILL');
              }
            }
          } catch (error) {
            testLogger.warn({ err: error }, 'Error during Next.js process cleanup');
          } finally {
            // Clean up listeners
            if (nextAppProcess && typeof nextAppProcess.removeAllListeners === 'function') {
              try {
                nextAppProcess.removeAllListeners();
              } catch (listenerError) {
                testLogger.warn({ err: listenerError }, 'Error removing process listeners');
              }
            }
          }
        })(),
        // Timeout after 10 seconds to prevent hanging in CI
        new Promise(resolve =>
          setTimeout(() => {
            testLogger.warn('Next.js process cleanup timed out after 10 seconds');
            resolve(undefined);
          }, 10000)
        ),
      ]);
    } catch (error) {
      testLogger.warn({ err: error }, 'Next.js app cleanup encountered issues but continuing');
    }
  }
}

/**
 * Shutdown Docker environment with better error handling
 */
export async function stopDockerEnvironment(): Promise<void> {
  const dockerComposePath = path.resolve(process.cwd(), 'docker/docker-compose.yml');

  try {
    // Use timeout to prevent hanging in CI
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        try {
          // Remove --volumes flag to speed up teardown and avoid potential issues
          execSync(`docker compose -f "${dockerComposePath}" down`, {
            stdio: 'inherit',
            timeout: 30000, // 30 second timeout
          });
          resolve();
        } catch (error) {
          reject(error);
        }
      }),
      new Promise<void>(resolve =>
        setTimeout(() => {
          testLogger.warn('Docker teardown timed out after 30 seconds, continuing...');
          resolve();
        }, 30000)
      ),
    ]);
  } catch (error) {
    testLogger.warn({ err: error }, 'Docker environment cleanup encountered issues but continuing');

    // Try alternative cleanup if docker compose fails
    try {
      execSync('docker container prune -f', { stdio: 'inherit', timeout: 10000 });
      execSync('docker network prune -f', { stdio: 'inherit', timeout: 10000 });
    } catch (alternativeError) {
      testLogger.warn({ err: alternativeError }, 'Alternative Docker cleanup also failed');
    }
  }
}

/**
 * Main teardown function for Jest with improved error handling
 */
export async function teardown(): Promise<void> {
  try {
    // Stop the Next.js app (don't let failures stop the teardown)
    try {
      await stopNextApp();
    } catch (error) {
      testLogger.warn({ err: error }, 'Next.js app cleanup failed, continuing with Docker cleanup');
    }

    // Stop Docker environment (don't let failures stop the teardown)
    try {
      await stopDockerEnvironment();
    } catch (error) {
      testLogger.warn({ err: error }, 'Docker environment cleanup failed, continuing');
    }

    // Add a final delay to ensure all resources are released
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (error) {
    // Log error but don't throw to prevent CI failure
    testLogger.warn(
      { err: error },
      'System test environment teardown encountered issues but completed'
    );
  }
}

export default teardown;
