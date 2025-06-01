/**
 * Logger utility using Pino for structured logging.
 * Supports context-based child loggers and object-based structured logging.
 */
import pino from 'pino';
import { randomUUID } from 'crypto';

/**
 * Create a base logger instance with appropriate configuration
 * - Uses different log levels based on environment
 * - Always uses pretty-printing for consistent, readable output
 * - Enables colorized output for better readability
 */
const logger = pino({
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
export const authLogger = logger.child({ module: 'auth' });
export const apiLogger = logger.child({ module: 'api' });
export const dbLogger = logger.child({ module: 'db' });
export const uiLogger = logger.child({ module: 'ui' });
export const testLogger = logger.child({ module: 'test' });

/**
 * Generate a request ID for API request logging
 */
export function getRequestLogger(req: { headers: Record<string, string | string[] | undefined> }) {
  const requestId = req.headers['x-request-id'] || randomUUID();
  return apiLogger.child({ requestId });
}

/**
 * Helper to log errors with proper context and serialization
 */
export function logError(
  baseLogger: pino.Logger,
  message: string,
  error: Error | unknown,
  context: object = {}
) {
  // Extract additional error properties if they exist
  const errorObj = error as Record<string, unknown>;
  const errorResponse = errorObj?.response as Record<string, unknown> | undefined;

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

export default logger;
