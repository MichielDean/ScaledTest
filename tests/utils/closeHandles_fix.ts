/**
 * Helper to explicitly close any outstanding handles
 * Useful for CI environments where tests may hang
 */
import { testLogger } from '../../src/utils/logger';

// Define the delay for cleanup (ms)
const TEARDOWN_DELAY_MS = 1000;

/**
 * Jest globalTeardown function
 * This will be called after all tests have finished running
 */
async function closeHandles(): Promise<void> {
  testLogger.info('Running global teardown to close any open handles...');

  try {
    // Force NodeJS to empty the event loop
    // This helps with any lingering promises or timeouts
    if (typeof gc !== 'undefined') {
      gc();
    }

    // Ensure all pending operations are given time to complete
    await new Promise(resolve => setTimeout(resolve, TEARDOWN_DELAY_MS));

    // Give time for any pending operations to finish
    await new Promise(resolve => setTimeout(resolve, TEARDOWN_DELAY_MS));

    testLogger.info('Global teardown completed successfully');
  } catch (error) {
    testLogger.error({ error }, 'Error closing handles');
  }
}

// Jest expects the teardown file to export a function directly
export default closeHandles;
