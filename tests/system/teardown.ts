import { execSync } from 'child_process';
import path from 'path';
import { nextAppProcess } from './setup';
import { testLogger } from '../../src/logging/logger';
import { cleanupPort } from '../../src/lib/portCleanup';

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
              // Cross-platform process cleanup using TypeScript utility
              try {
                testLogger.debug('Attempting to clean up port 3000 processes...');
                await cleanupPort(3000, {
                  maxRetries: 1,
                  retryDelay: 500,
                });
              } catch (portError) {
                testLogger.warn({ err: portError }, 'Port cleanup during teardown had issues');
              }

              // Final attempt to kill the process directly
              if (!nextAppProcess.killed) {
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

  testLogger.info('Starting Docker environment teardown...');

  try {
    // Use timeout to prevent hanging in CI - reduced from 30s to 15s
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        try {
          // Try kill first for faster cleanup
          execSync(`docker compose -f "${dockerComposePath}" kill`, {
            stdio: 'ignore',
            timeout: 5000, // 5 second timeout for kill
          });

          // Then remove with shorter timeout
          execSync(`docker compose -f "${dockerComposePath}" down --remove-orphans`, {
            stdio: 'inherit',
            timeout: 10000, // 10 second timeout for down
          });
          resolve();
        } catch (error) {
          reject(error);
        }
      }),
      new Promise<void>(
        resolve =>
          setTimeout(() => {
            testLogger.warn('Docker teardown timed out after 15 seconds, continuing...');
            resolve();
          }, 15000) // Reduced from 30s to 15s
      ),
    ]);

    testLogger.info('Docker environment teardown completed successfully');
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
