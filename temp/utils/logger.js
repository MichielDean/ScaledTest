'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.testLogger =
  exports.uiLogger =
  exports.dbLogger =
  exports.apiLogger =
  exports.authLogger =
    void 0;
exports.getRequestLogger = getRequestLogger;
exports.logError = logError;
/**
 * Logger utility using Pino for structured logging.
 * Supports context-based child loggers and object-based structured logging.
 */
const pino_1 = require('pino');
const crypto_1 = require('crypto');
/**
 * Create a base logger instance with appropriate configuration
 * - Uses different log levels based on environment
 * - Always uses pretty-printing for consistent, readable output
 * - Enables colorized output for better readability
 */
const logger = (0, pino_1.default)({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
  timestamp: pino_1.default.stdTimeFunctions.isoTime,
  // Add application name to all logs
  base: { app: 'scaledtest' },
});
// Pre-configured child loggers for different modules
exports.authLogger = logger.child({ module: 'auth' });
exports.apiLogger = logger.child({ module: 'api' });
exports.dbLogger = logger.child({ module: 'db' });
exports.uiLogger = logger.child({ module: 'ui' });
exports.testLogger = logger.child({ module: 'test' });
/**
 * Generate a request ID for API request logging
 */
function getRequestLogger(req) {
  const requestId = req.headers['x-request-id'] || (0, crypto_1.randomUUID)();
  return exports.apiLogger.child({ requestId });
}
/**
 * Helper to log errors with proper context and serialization
 */
function logError(baseLogger, message, error, context = {}) {
  // Extract additional error properties if they exist
  const errorObj = error;
  const errorResponse = errorObj?.response;
  baseLogger.error(
    {
      err: error,
      ...context,
      // Include these if available in the error object
      code: errorObj?.code,
      status: errorResponse?.status,
      statusText: errorResponse?.statusText,
    },
    message
  );
}
/**
 * Usage examples:
 *
 * // Basic logging with standard logger
 * logger.info('Simple log message');
 *
 * // Structured logging with context
 * logger.info({ userId: '123', action: 'login' }, 'User logged in');
 *
 * // Logging errors with helper
 * try {
 *   // some code that might fail
 * } catch (error) {
 *   logError(authLogger, 'Operation failed', error, { userId: '123' });
 * }
 *
 * // API request logging
 * const reqLogger = getRequestLogger(req);
 * reqLogger.info({ userId: req.user?.id }, 'API request received');
 */
exports.default = logger;
