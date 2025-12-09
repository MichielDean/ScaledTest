/**
 * Simple test logger for Playwright tests
 * Provides structured logging for test execution
 */

interface LogData {
  [key: string]: unknown;
}

class TestLogger {
  info(message: string, data?: LogData): void {
    console.log(`[INFO] ${message}`, data ? JSON.stringify(data) : "");
  }

  error(message: string, data?: LogData): void {
    console.error(`[ERROR] ${message}`, data ? JSON.stringify(data) : "");
  }

  warn(message: string, data?: LogData): void {
    console.warn(`[WARN] ${message}`, data ? JSON.stringify(data) : "");
  }

  debug(message: string, data?: LogData): void {
    if (process.env.DEBUG) {
      console.log(`[DEBUG] ${message}`, data ? JSON.stringify(data) : "");
    }
  }
}

export const testLogger = new TestLogger();
