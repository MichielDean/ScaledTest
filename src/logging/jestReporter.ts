/**
 * Generic Jest Reporter for capturing ALL console logs and supplementing    // Intercept console methods
    const consoleMethods = ['log', 'error', 'warn', 'info', 'debug'] as const;
    consoleMethods.forEach((method) => {
      (console as Record<string, (...args: unknown[]) => void>)[method] = (...args: unknown[]) => {
        // Call original console method first to ensure output
        this.originalConsole[method](...args);
 * Works with any logging solution (Pino, Winston, console.log, etc.)
 * Extends CTRF reporter functionality without rewriting it
 */
import type { Config } from '@jest/types';
import type { TestContext, TestResult } from '@jest/test-result';
import * as fs from 'fs';
import * as path from 'path';

interface LogEntry {
  type: string;
  message: string;
  origin: string;
  timestamp: string;
}

interface CTRFTest {
  name: string;
  duration: number;
  status: string;
  rawStatus: string;
  type: string;
  filePath: string;
  retries: number;
  flaky: boolean;
  suite: string;
  logs?: LogEntry[];
}

interface CTRFReport {
  results: {
    tool: { name: string };
    summary: {
      tests: number;
      passed: number;
      failed: number;
      pending: number;
      skipped: number;
      other: number;
      start: number;
      stop: number;
    };
    tests: CTRFTest[];
    environment: {
      appName: string;
      appVersion: string;
    };
  };
}

class GenericLogCaptureReporter {
  private _globalConfig: Config.GlobalConfig;
  private allLogs: LogEntry[] = [];
  private testLogs: Map<string, LogEntry[]> = new Map();
  private currentTestPath: string | null = null;
  private currentTestName: string | null = null;
  private originalConsole: Record<string, (...args: unknown[]) => void> = {};
  private isIntercepting = false;

  constructor(globalConfig: Config.GlobalConfig) {
    this._globalConfig = globalConfig;
    this.setupConsoleInterception();
  }

  private setupConsoleInterception(): void {
    if (this.isIntercepting) return;

    // Store original console methods
    this.originalConsole = {
      // eslint-disable-next-line no-console
      log: console.log.bind(console),
      // eslint-disable-next-line no-console
      error: console.error.bind(console),
      // eslint-disable-next-line no-console
      warn: console.warn.bind(console),
      // eslint-disable-next-line no-console
      info: console.info.bind(console),
      // eslint-disable-next-line no-console
      debug: console.debug.bind(console),
    };

    // Intercept console methods
    ['log', 'error', 'warn', 'info', 'debug'].forEach(method => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (console as any)[method] = (...args: any[]) => {
        // Call original console method first to ensure output
        this.originalConsole[method](...args);

        // Skip our own debug messages to avoid recursion
        const message = args
          .map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
          .join(' ');

        if (!message.includes('📋') && !message.includes('GenericLogCaptureReporter')) {
          // Capture the log
          const logEntry: LogEntry = {
            type: method,
            message: message,
            origin: this.getStackTrace(),
            timestamp: new Date().toISOString(),
          };

          this.allLogs.push(logEntry);

          // Find the test file from stack trace if we don't have current test path
          let testPath = this.currentTestPath;
          if (!testPath) {
            testPath = this.extractTestPathFromStack(logEntry.origin);
          }

          // Associate with test file
          if (testPath && testPath !== 'unknown') {
            if (!this.testLogs.has(testPath)) {
              this.testLogs.set(testPath, []);
            }
            this.testLogs.get(testPath)!.push(logEntry);
          }
        }
      };
    });

    this.isIntercepting = true;
  }

  private extractTestPathFromStack(stackTrace: string): string {
    // Try to extract test file path from stack trace
    const testPathMatch = stackTrace.match(/\(([^)]+\.test\.[jt]s):\d+:\d+\)/);
    if (testPathMatch) {
      return testPathMatch[1];
    }

    // Alternative pattern for different stack formats
    const alternativeMatch = stackTrace.match(/at .+ \((.+\.test\.[jt]s):\d+:\d+\)/);
    if (alternativeMatch) {
      return alternativeMatch[1];
    }

    return 'unknown';
  }

  private getStackTrace(): string {
    const stack = new Error().stack;
    if (!stack) return 'unknown';

    const lines = stack.split('\n');
    // Find the first line that's not from this reporter or Jest internals
    for (let i = 3; i < lines.length; i++) {
      const line = lines[i];
      if (
        !line.includes('jestReporter') &&
        !line.includes('GenericLogCaptureReporter') &&
        !line.includes('node_modules/jest') &&
        !line.includes('node_modules/@jest')
      ) {
        return line.trim();
      }
    }
    return lines[3]?.trim() || 'unknown';
  }

  onRunStart(): void {
    this.originalConsole.log('📋 Starting test run - generic log capture enabled');
  }
  onTestFileStart(test: TestContext): void {
    // Use config.testPath or other available property
    const testConfig = (test as Record<string, unknown>).config as
      | Record<string, unknown>
      | undefined;
    const testPath =
      (testConfig?.testPath as string) ||
      ((test as Record<string, unknown>).testPath as string) ||
      'unknown';
    this.currentTestPath = testPath;
    this.originalConsole.log(`📋 Started test file: ${testPath}`);
  }

  onTestCaseStart(test: TestContext, testCaseStartInfo: Record<string, unknown>): void {
    if (testCaseStartInfo?.fullName) {
      this.currentTestName = testCaseStartInfo.fullName as string;
    }
  }

  onTestFileResult(test: TestContext, testResult: TestResult): void {
    const testConfig = (test as Record<string, unknown>).config as
      | Record<string, unknown>
      | undefined;
    const testPath = testResult.testFilePath || (testConfig?.testPath as string) || 'unknown';
    const testLogCount = this.testLogs.get(testPath)?.length || 0;

    this.originalConsole.log(`📋 Test file ${testPath} completed - captured ${testLogCount} logs`);
  }

  onRunComplete(): void {
    this.originalConsole.log(`📋 Test run complete. Total logs captured: ${this.allLogs.length}`);
    this.originalConsole.log(`📋 Logs captured for ${this.testLogs.size} test files`);

    // Wait a bit for CTRF to write its file, then supplement it
    setTimeout(() => {
      this.supplementCTRFReport();
    }, 1000);
  }

  private supplementCTRFReport(): void {
    const ctrfPath = path.join(process.cwd(), 'ctrf-report.json');

    try {
      if (fs.existsSync(ctrfPath)) {
        const ctrfData = JSON.parse(fs.readFileSync(ctrfPath, 'utf8')) as CTRFReport;

        this.originalConsole.log(
          `📋 Found CTRF report with ${ctrfData.results.tests.length} tests`
        );

        // Add logs to each test based on file path matching
        ctrfData.results.tests.forEach(test => {
          // Find logs for this test file
          const normalizedTestPath = path.normalize(test.filePath);
          let matchedLogs: LogEntry[] = [];

          // Try exact match first
          if (this.testLogs.has(normalizedTestPath)) {
            matchedLogs = this.testLogs.get(normalizedTestPath)!;
          } else {
            // Try to find by matching file name
            for (const [logPath, logs] of this.testLogs.entries()) {
              const normalizedLogPath = path.normalize(logPath);
              if (
                normalizedLogPath === normalizedTestPath ||
                normalizedLogPath.endsWith(path.basename(normalizedTestPath))
              ) {
                matchedLogs = logs;
                break;
              }
            }
          }

          if (matchedLogs.length > 0) {
            test.logs = matchedLogs;
            this.originalConsole.log(`📋 Added ${matchedLogs.length} logs to test: ${test.name}`);
          }
        });

        // Write the enhanced CTRF report
        fs.writeFileSync(ctrfPath, JSON.stringify(ctrfData, null, 2));
        this.originalConsole.log(
          `📋 Enhanced CTRF report with logs from ${this.testLogs.size} test files`
        );

        // Also save a debug version
        const debugPath = path.join(process.cwd(), 'ctrf-debug.json');
        const debugData = {
          capturedLogs: Object.fromEntries(this.testLogs),
          allLogs: this.allLogs,
          testPaths: Array.from(this.testLogs.keys()),
        };
        fs.writeFileSync(debugPath, JSON.stringify(debugData, null, 2));
        this.originalConsole.log(`📋 Debug log data saved to ${debugPath}`);
      } else {
        this.originalConsole.log(`📋 CTRF report not found at ${ctrfPath}, will retry...`);
        // Try again after a delay
        setTimeout(() => {
          this.supplementCTRFReport();
        }, 2000);
      }
    } catch (error) {
      this.originalConsole.error('📋 Failed to supplement CTRF report:', error);
    }
  }

  getLastError(): Error | undefined {
    return undefined;
  }
}

export default GenericLogCaptureReporter;
