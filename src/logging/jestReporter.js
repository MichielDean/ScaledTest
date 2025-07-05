/**
 * Simple Jest Reporter for capturing Pino logs
 * Supplements CTRF reporter with test logs for each test method
 * Follows KISS principle - elegant simplicity
 *
 * This file is compiled from jestReporter.ts for Jest compatibility
 * Jest requires JavaScript files for custom reporters
 *
 * @typedef {import('@jest/types').Config.GlobalConfig} GlobalConfig
 * @typedef {import('@jest/test-result').TestContext} TestContext
 * @typedef {import('@jest/test-result').TestResult} TestResult
 */

class PinoJestReporter {
  /**
   * @param {GlobalConfig} globalConfig
   */
  constructor(globalConfig) {
    this._globalConfig = globalConfig;
  }

  /**
   * @param {TestContext} _test
   * @param {TestResult} testResult
   */
  onTestResult(_test, testResult) {
    if (!testResult?.console?.length) return;

    // Filter for Pino logs (JSON format with level/time)
    const pinoLogs = testResult.console.filter(log => {
      try {
        const parsed = JSON.parse(log.message);
        return parsed.level && parsed.time && parsed.app === 'scaledtest';
      } catch {
        return false;
      }
    });

    // Attach Pino logs to test result for potential use by other reporters
    if (pinoLogs.length > 0) {
      testResult.pinoLogs = pinoLogs;
    }
  }

  // Minimal required methods for Jest reporter interface
  onRunStart() {}
  onTestStart() {}
  onRunComplete() {}
  getLastError() {
    return undefined;
  }
}

export default PinoJestReporter;
