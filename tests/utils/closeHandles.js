// Helper to explicitly close any outstanding handles
// Useful for CI environments where tests may hang

// Define the delay for cleanup (ms)
const TEARDOWN_DELAY_MS = 1000;

/**
 * Jest globalTeardown function
 * This will be called after all tests have finished running
 */
async function closeHandles() {
  // Console logging is needed for debugging test teardown
  console.log('Running global teardown to close any open handles...'); // eslint-disable-line no-console

  try {
    // Force NodeJS to empty the event loop
    // This helps with any lingering promises or timeouts
    if (global.gc) {
      global.gc();
    }

    // Ensure all pending operations are given time to complete
    await new Promise(resolve => setTimeout(resolve, TEARDOWN_DELAY_MS));

    // Give time for any pending operations to finish
    await new Promise(resolve => setTimeout(resolve, TEARDOWN_DELAY_MS));

    console.log('Global teardown completed successfully'); // eslint-disable-line no-console
  } catch (error) {
    console.error('Error closing handles:', error); // eslint-disable-line no-console
  }
}

// Jest expects the teardown file to export a function directly
module.exports = closeHandles;
