// Helper to explicitly close any outstanding handles
// Useful for CI environments where tests may hang

/**
 * Jest globalTeardown function
 * This will be called after all tests have finished running
 */
async function closeHandles() {
  console.log('Running global teardown to close any open handles...');

  try {
    // Force NodeJS to empty the event loop
    // This helps with any lingering promises or timeouts
    if (global.gc) {
      global.gc();
    }

    // Try to clear any lingering timers
    const activeHandles = process._getActiveHandles();
    activeHandles.forEach(handle => {
      if (handle instanceof Timeout) {
        try {
          clearTimeout(handle);
        } catch (e) {
          // Ignore errors when clearing timers
        }
      }
    });

    // Give time for any pending operations to finish
    await new Promise(resolve => setTimeout(resolve, TEARDOWN_DELAY_MS));

    console.log('Global teardown completed successfully');
  } catch (error) {
    console.error('Error closing handles:', error);
  }
}

// Jest expects the teardown file to export a function directly
module.exports = closeHandles;
