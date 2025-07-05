/**
 * Test logger configuration that routes Pino logs to Jest console capture
 * This ensures Pino logs appear in testResult.console for the Jest reporter
 */
import pino from 'pino';
import { randomUUID } from 'crypto';

/**
 * Custom Jest transport that writes to console for Jest capture
 */
const jestTransport: pino.TransportSingleOptions = {
  target: 'pino/file',
  options: {
    destination: 1, // stdout - Jest will capture this
  },
};

/**
 * Create test logger with Jest-compatible transport
 */
const createTestLogger = () => {
  const isTest = process.env.NODE_ENV === 'test';

  return pino({
    level: 'debug',
    transport: isTest
      ? jestTransport
      : {
          target: 'pino-pretty',
          options: {
            colorize: true,
          },
        },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: { app: 'scaledtest' },
  });
};

// Create logger instance
const logger = createTestLogger();

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

export default logger;
