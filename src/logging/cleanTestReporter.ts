/**
 * Clean Test Reporter - Keeps terminal output clean by reading logs from files
 * Only shows relevant logs when tests fail, providing context for debugging
 */
import type { Config } from '@jest/types';
import type { Test, TestResult } from '@jest/test-result';
import * as fs from 'fs';
import * as path from 'path';

interface LogEntry {
  level: number;
  time: string;
  msg: string;
  app?: string;
  module?: string;
  source?: string;
  [key: string]: unknown;
}

interface Reporter {
  onRunStart?(): void;
  onTestStart?(test?: Test): void;
  onTestResult?(test: Test, testResult: TestResult): void;
  onRunComplete?(): void;
  getLastError?(): Error | undefined;
}

class CleanTestReporter implements Reporter {
  private _globalConfig: Config.GlobalConfig;
  private appLogs: LogEntry[] = [];
  private testLogs: LogEntry[] = [];
  private testStartTimes: Map<string, number> = new Map();
  private testEndTimes: Map<string, number> = new Map();

  constructor(globalConfig: Config.GlobalConfig) {
    this._globalConfig = globalConfig;
  }

  onRunStart(): void {
    // Clear log files at start of test run
    this.clearLogFiles();
  }

  onTestStart(test?: Test): void {
    if (test?.path) {
      this.testStartTimes.set(test.path, Date.now());
    }
  }

  onTestResult(test: Test, testResult: TestResult): void {
    if (test.path) {
      this.testEndTimes.set(test.path, Date.now());
    }

    // Debug output to verify the reporter is working (only when debug enabled)
    if (process.env.CLEAN_TEST_REPORTER_DEBUG === 'true') {
      process.stderr.write(
        `\n🔍 CleanTestReporter: Test ${test.path} completed with ${testResult.numFailingTests} failing tests\n`
      );
    }

    // Only show logs if the test failed
    if (testResult.numFailingTests > 0) {
      process.stderr.write(`🔍 CleanTestReporter: Showing logs for failed test\n`);
      this.showRelevantLogsForFailedTest(test, testResult);
    }
  }

  onRunComplete(): void {
    // Clean up log files after tests complete
    this.cleanupLogFiles();
  }

  private clearLogFiles(): void {
    const logDir = path.join(process.cwd(), 'logs');

    // Ensure logs directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Clear existing log files
    const appLogPath = path.join(logDir, 'app.log');
    const testLogPath = path.join(logDir, 'test.log');

    if (fs.existsSync(appLogPath)) {
      fs.writeFileSync(appLogPath, '');
    }
    if (fs.existsSync(testLogPath)) {
      fs.writeFileSync(testLogPath, '');
    }
  }

  private readLogFiles(): void {
    const logDir = path.join(process.cwd(), 'logs');
    const appLogPath = path.join(logDir, 'app.log');
    const testLogPath = path.join(logDir, 'test.log');

    // Read application logs
    if (fs.existsSync(appLogPath)) {
      const appLogContent = fs.readFileSync(appLogPath, 'utf8');
      this.appLogs = this.parseLogLines(appLogContent);
    }

    // Read test logs
    if (fs.existsSync(testLogPath)) {
      const testLogContent = fs.readFileSync(testLogPath, 'utf8');
      this.testLogs = this.parseLogLines(testLogContent);
    }
  }

  private parseLogLines(content: string): LogEntry[] {
    if (!content.trim()) {
      return [];
    }

    return content
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line) as LogEntry;
        } catch {
          // If line is not valid JSON, create a simple log entry
          return {
            level: 30,
            time: new Date().toISOString(),
            msg: line,
          };
        }
      });
  }

  private showRelevantLogsForFailedTest(test: Test, testResult: TestResult): void {
    // Read the latest logs
    this.readLogFiles();

    const testPath = test.path;
    const testStartTime = this.testStartTimes.get(testPath);
    const testEndTime = this.testEndTimes.get(testPath);

    if (!testStartTime || !testEndTime) {
      return;
    }

    // Filter logs that occurred during this test's execution
    const relevantAppLogs = this.appLogs.filter(log => {
      const logTime = new Date(log.time).getTime();
      return logTime >= testStartTime && logTime <= testEndTime;
    });

    const relevantTestLogs = this.testLogs.filter(log => {
      const logTime = new Date(log.time).getTime();
      return logTime >= testStartTime && logTime <= testEndTime;
    });

    // Only show logs if there are failures and relevant logs exist
    if (
      testResult.numFailingTests > 0 &&
      (relevantAppLogs.length > 0 || relevantTestLogs.length > 0)
    ) {
      this.displayFailureLogsToConsole(test, relevantAppLogs, relevantTestLogs);
    }
  }

  private displayFailureLogsToConsole(test: Test, appLogs: LogEntry[], testLogs: LogEntry[]): void {
    const testName = path.relative(process.cwd(), test.path);

    // Use process.stderr.write to avoid no-console ESLint rule
    process.stderr.write(`\n📋 Relevant logs for failed test: ${testName}\n`);
    process.stderr.write(`${'─'.repeat(80)}\n`);

    if (appLogs.length > 0) {
      process.stderr.write('🚀 Application Logs:\n');
      appLogs.forEach(log => {
        const level = this.getLevelName(log.level);
        const time = new Date(log.time).toISOString().slice(11, 23); // HH:mm:ss.sss
        const logModule = log.module ? `[${log.module}]` : '';
        process.stderr.write(`  ${time} ${level} ${logModule} ${log.msg}\n`);

        // Show additional context for errors
        if (log.level >= 50 && log.err) {
          process.stderr.write(`    Error: ${log.err}\n`);
        }
      });
      process.stderr.write('\n');
    }

    if (testLogs.length > 0) {
      process.stderr.write('🧪 Test Infrastructure Logs:\n');
      testLogs.forEach(log => {
        const level = this.getLevelName(log.level);
        const time = new Date(log.time).toISOString().slice(11, 23); // HH:mm:ss.sss
        const logModule = log.module ? `[${log.module}]` : '';
        process.stderr.write(`  ${time} ${level} ${logModule} ${log.msg}\n`);

        // Show additional context for errors
        if (log.level >= 50 && log.err) {
          process.stderr.write(`    Error: ${log.err}\n`);
        }
      });
      process.stderr.write('\n');
    }

    process.stderr.write(`${'─'.repeat(80)}\n`);
  }
  private getLevelName(level: number): string {
    switch (level) {
      case 10:
        return 'TRACE';
      case 20:
        return 'DEBUG';
      case 30:
        return 'INFO ';
      case 40:
        return 'WARN ';
      case 50:
        return 'ERROR';
      case 60:
        return 'FATAL';
      default:
        return 'UNKN ';
    }
  }

  private cleanupLogFiles(): void {
    // Optional: Remove log files after test completion
    // Commented out to preserve logs for post-test inspection
    /*
    const logDir = path.join(process.cwd(), 'logs');
    const appLogPath = path.join(logDir, 'app.log');
    const testLogPath = path.join(logDir, 'test.log');
    
    if (fs.existsSync(appLogPath)) {
      fs.unlinkSync(appLogPath);
    }
    if (fs.existsSync(testLogPath)) {
      fs.unlinkSync(testLogPath);
    }
    */
  }

  getLastError(): Error | undefined {
    return undefined;
  }
}

export default CleanTestReporter;
