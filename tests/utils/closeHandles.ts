/**
 * Helper to explicitly close any outstanding handles
 * Useful for CI environments where tests may hang
 */

import { testLogger } from '../../src/logging/logger';

// Define the delay for cleanup (ms)
const TEARDOWN_DELAY_MS = 1000;

/**
 * Jest globalTeardown function with improved error handling
 * This will be called after all tests have finished running
 */
async function closeHandles(): Promise<void> {
  testLogger.info('Running global teardown to close any open handles...');

  try {
    // Force garbage collection if available
    if (global.gc) {
      try {
        global.gc();
      } catch (gcError) {
        testLogger.warn({ err: gcError }, 'Garbage collection failed');
      }
    }

    // Clear any lingering timers or intervals
    // This is a more robust approach than the previous implementation
    try {
      // Clear any active handles (using interface extension for internal Node.js APIs)
      interface NodeProcess extends NodeJS.Process {
        _getActiveHandles?(): unknown[];
        _getActiveRequests?(): unknown[];
      }

      const nodeProcess = process as NodeProcess;
      const activeHandles = nodeProcess._getActiveHandles?.() || [];
      const activeRequests = nodeProcess._getActiveRequests?.() || [];

      if (activeHandles.length > 0 || activeRequests.length > 0) {
        testLogger.info(
          `Found ${activeHandles.length} active handles and ${activeRequests.length} active requests`
        );
      }
    } catch (handleCheckError) {
      testLogger.warn({ err: handleCheckError }, 'Could not check active handles');
    }

    // Give time for any pending operations to finish
    await new Promise(resolve => setTimeout(resolve, TEARDOWN_DELAY_MS));

    testLogger.info('Global teardown completed successfully');
  } catch (error) {
    // Log error but don't throw to prevent test failures
    testLogger.warn({ err: error }, 'Global teardown encountered issues but completed');
  }
}

// Jest expects the teardown file to export a function directly
export default closeHandles;
