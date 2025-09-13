/**
 * Global teardown - minimal logging cleanup only
 */

import { closeTestLogger } from '../../src/logging/testLogger';

/**
 * Minimal global teardown - just close logger to prevent hanging handles
 */
async function handleCleanup(): Promise<void> {
  try {
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    // Close test logger transport
    closeTestLogger();

    // Brief pause for cleanup
    await new Promise(resolve => setTimeout(resolve, 500));
  } catch {
    // Silent failure - don't interfere with test results
  }
}

export default handleCleanup;
