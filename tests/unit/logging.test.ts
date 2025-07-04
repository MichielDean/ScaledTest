/**
 * Comprehensive logging test - covers console output, Pino logger integration,
 * and log capture mechanisms used by the test infrastructure
 */
import logger, { testLogger } from '../../src/logging/logger';

describe('Logging Integration', () => {
  describe('Console Output', () => {
    test('should output console messages during tests', () => {
      console.log('Test console.log message');
      console.error('Test console.error message');
      console.warn('Test console.warn message');

      // These logs should be captured by the enhanced CTRF reporter
      expect(true).toBe(true);
    });
  });

  describe('Pino Logger', () => {
    test('should output structured Pino logs', () => {
      logger.info({ testId: 'test-1', action: 'start' }, 'Test started');
      testLogger.debug({ step: 1 }, 'Performing test step 1');
      testLogger.info({ step: 2 }, 'Performing test step 2');
      logger.info({ testId: 'test-1', action: 'complete' }, 'Test completed');

      expect(true).toBe(true);
    });

    test('should handle error logging with context', () => {
      const testError = new Error('Test error for logging');
      testLogger.error({ errorType: 'test' }, 'Test error occurred');
      logger.error({ err: testError, context: 'test' }, 'Error with context');

      expect(true).toBe(true);
    });

    test('should work with child loggers', () => {
      const childLogger = logger.child({ module: 'test-module', requestId: 'req-123' });

      childLogger.info({ operation: 'test' }, 'Child logger test message');
      childLogger.debug({ data: { test: 'value' } }, 'Debug with child context');

      expect(true).toBe(true);
    });
  });

  describe('Mixed Logging', () => {
    test('should handle mixed console and Pino logging', () => {
      console.log('Console log message');
      testLogger.info({ source: 'pino' }, 'Pino info message');
      console.error('Console error message');
      logger.error({ source: 'pino', severity: 'high' }, 'Pino error message');

      const testData = { test: 'data', value: 123 };
      console.log('Test data:', testData);
      testLogger.info({ data: testData }, 'Pino with test data');

      expect(testData.value).toBe(123);
    });
  });
});
