/**
 * Test logger configuration for cleaner test output
 * Routes test infrastructure logs to files to keep terminal clean
 * Jest's built-in failure reporting will show relevant logs on test failures
 */
import pino, { Logger } from 'pino';
import { randomUUID } from 'crypto';

/**
 * Create the main test logger instance
 * Routes test logs to a separate file to keep terminal clean
 */
function createTestLogger(): Logger {
  // Write test logs to a file during test runs to keep terminal clean
  const transport = {
    target: 'pino/file',
    options: {
      destination: './logs/test.log',
      mkdir: true,
    },
  };

  return pino({
    transport,
    level: 'debug',
    timestamp: pino.stdTimeFunctions.isoTime,
    base: { app: 'scaledtest', source: 'test' },
  });
}

// Singleton pattern to ensure only one logger instance across all Jest projects
let loggerInstance: Logger | null = null;

function getLoggerInstance(): Logger {
  if (!loggerInstance) {
    loggerInstance = createTestLogger();
  }
  return loggerInstance;
}

// Cache for child loggers
let _authTestLogger: Logger | undefined;
let _apiTestLogger: Logger | undefined;
let _dbTestLogger: Logger | undefined;
let _uiTestLogger: Logger | undefined;

// Export the main test logger instance
export const testLogger = getLoggerInstance();

// Pre-configured child loggers for different modules
export const authTestLogger = () => {
  if (!_authTestLogger) {
    _authTestLogger = testLogger.child({ module: 'auth' });
  }
  return _authTestLogger;
};

export const apiTestLogger = () => {
  if (!_apiTestLogger) {
    _apiTestLogger = testLogger.child({ module: 'api' });
  }
  return _apiTestLogger;
};

export const dbTestLogger = () => {
  if (!_dbTestLogger) {
    _dbTestLogger = testLogger.child({ module: 'db' });
  }
  return _dbTestLogger;
};

export const uiTestLogger = () => {
  if (!_uiTestLogger) {
    _uiTestLogger = testLogger.child({ module: 'ui' });
  }
  return _uiTestLogger;
};

/**
 * Closes the test logger transport and resets the singleton
 */
export async function closeTestLogger(): Promise<void> {
  try {
    if (loggerInstance) {
      const pinoInstance = loggerInstance as unknown as Record<string | symbol, unknown>;
      const transport = pinoInstance[Symbol.for('pino.transport')] as
        | { end?: () => Promise<void> }
        | undefined;
      if (transport && typeof transport.end === 'function') {
        await transport.end();
      }
    }
  } catch (error) {
    // Silently handle any errors during cleanup - use stderr to avoid no-console rule
    process.stderr.write(`Error closing test logger: ${error}\n`);
  } finally {
    // Reset the singleton and cached child loggers
    loggerInstance = null;
    _authTestLogger = undefined;
    _apiTestLogger = undefined;
    _dbTestLogger = undefined;
    _uiTestLogger = undefined;
  }
}

/**
 * Generate a request ID for API request logging
 */
export function getRequestLogger(req: { headers: Record<string, string | string[] | undefined> }) {
  const requestId = req.headers['x-request-id'] || randomUUID();
  return apiTestLogger().child({ requestId });
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

export default testLogger;
