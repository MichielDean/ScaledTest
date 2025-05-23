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
    const timerIds = setTimeout(() => {}, 0);
    for (let i = 1; i < timerIds; i++) {
      try {
        clearTimeout(i);
      } catch (e) {
        // Ignore errors when clearing timers
      }
    }

    // Give time for any pending operations to finish
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log('Global teardown completed successfully');
  } catch (error) {
    console.error('Error closing handles:', error);
  }
}

// Jest expects the teardown file to export a function directly
module.exports = closeHandles;
// This is a test line
