/**
 * Logger utility using Pino for structured logging.
 * Supports context-based child loggers and object-based structured logging.
 */
import pino, { Logger } from 'pino';
import { randomUUID } from 'crypto';

let _testLogger: Logger | null = null;

export const testLogger: Logger = (() => {
  if (!_testLogger) {
    // Check if we're in a browser environment
    const isBrowser = typeof window !== 'undefined';

    if (isBrowser) {
      // Browser-safe pino configuration for UI tests
      _testLogger = pino({
        level: 'debug',
        browser: {
          asObject: true,
        },
        timestamp: pino.stdTimeFunctions.isoTime,
        base: { app: 'scaledtest', source: 'test' },
      });
    } else {
      // Node.js configuration with destination for unit/integration tests
      _testLogger = pino(
        {
          level: 'debug',
          transport: {
            target: 'pino-pretty',
            options: {
              singleLine: true,
              levelFirst: true,
              ignore: 'pid,hostname',
              translateTime: 'SYS:standard',
              colorize: true,
            },
          },
          timestamp: pino.stdTimeFunctions.isoTime,
          base: { app: 'scaledtest', source: 'test' },
        },
        pino.destination({ dest: 1, sync: true, encoding: 'utf8' })
      );
    }
  }
  return _testLogger;
})();

const logger = pino({
  level: 'debug',
  timestamp: pino.stdTimeFunctions.isoTime,
  base: { app: 'scaledtest' },
  browser: typeof window !== 'undefined' ? { asObject: true } : undefined,
});

export { logger };
export default logger;

export const authLogger = logger.child({ module: 'auth' });
export const apiLogger = logger.child({ module: 'api' });
export const dbLogger = logger.child({ module: 'db' });
export const uiLogger = logger.child({ module: 'ui' });

export function logError(
  baseLogger: Logger,
  message: string,
  error: Error | unknown,
  context: object = {}
) {
  const errorObj = error as Record<string, unknown>;
  const errorResponse = errorObj?.response as Record<string, unknown> | undefined;
  baseLogger.error(
    {
      err: error,
      ...context,
      code: errorObj?.code,
      status: errorResponse?.status,
      statusText: errorResponse?.statusText,
    },
    message
  );
}

export function getRequestLogger(req: {
  headers: Record<string, string | string[] | undefined>;
}): Logger {
  const requestId = req.headers['x-request-id'] || randomUUID();
  return apiLogger.child({ requestId });
}
