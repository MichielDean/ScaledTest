/**
 * Simplified logger for scripts (JavaScript files)
 * This bridges the gap between JavaScript script files and the main TypeScript logger
 * It follows the same pattern as the main logger but works in .js files
 */

// Import the pino logger directly to avoid TypeScript import issues in JS files
const pino = require('pino');

// Create a base logger instance with appropriate configuration
const scriptLogger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Add application name to all logs
  base: { app: 'scaledtest' },
});

// Pre-configured child loggers for different modules
const testScriptLogger = scriptLogger.child({ module: 'test-scripts' });
const utilsScriptLogger = scriptLogger.child({ module: 'util-scripts' });
const setupScriptLogger = scriptLogger.child({ module: 'setup-scripts' });

/**
 * Helper to log errors with proper context and serialization
 */
function logError(baseLogger, message, error, context = {}) {
  // Extract additional error properties if they exist
  const errorObj = error || {};
  const errorResponse = errorObj.response || {};

  baseLogger.error(
    {
      err: error,
      ...context,
      // Include these if available in the error object
      code: errorObj.code,
      status: errorResponse.status,
      statusText: errorResponse.statusText,
    },
    message
  );
}

module.exports = {
  scriptLogger,
  testScriptLogger,
  utilsScriptLogger,
  setupScriptLogger,
  logError,
};
