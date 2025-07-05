/**
 * Enhanced CTRF Reporter that captures logs and enhances the CTRF report
 * Captures ALL logs via stdout/stderr and adds them to CTRF report extra field
 * Works with ANY logger (Pino, Winston, console.log, etc.)
 * Runs independently alongside jest-ctrf-json-reporter
 */
import type { Config } from '@jest/types';
import type { Test, TestResult } from '@jest/test-result';
import * as fs from 'fs';
import * as path from 'path';
import type { CtrfSchema } from '../schemas/ctrf/ctrf';

interface LogEntry {
  type: string;
  message: string;
  timestamp: string;
  testFile?: string;
}

/**
 * Reporter interface for Jest
 */
interface Reporter {
  onRunStart?(): void;
  onTestStart?(test?: Test): void;
  onTestResult?(test: Test, testResult: TestResult): void;
  onRunComplete?(): void;
  getLastError?(): Error | undefined;
}

class EnhancedCtrfReporter implements Reporter {
  private _globalConfig: Config.GlobalConfig;
  private originalStdoutWrite!: typeof process.stdout.write;
  private originalStderrWrite!: typeof process.stderr.write;
  private capturedLogs: LogEntry[] = [];
  private currentTestFile: string | null = null;

  constructor(globalConfig: Config.GlobalConfig) {
    this._globalConfig = globalConfig;
    this.setupLogCapture();
  }

  private setupLogCapture(): void {
    // Store original methods
    this.originalStdoutWrite = process.stdout.write.bind(process.stdout);
    this.originalStderrWrite = process.stderr.write.bind(process.stderr);

    // Filter function to only capture application logs (not Jest's output)
    const isApplicationLog = (logString: string): boolean => {
      // Skip Jest's output formatting
      if (logString.includes('RUNS') || logString.includes('PASS') || logString.includes('FAIL')) {
        return false;
      }
      // Skip empty lines or whitespace-only
      if (!logString.trim()) {
        return false;
      }
      // Skip Jest color codes and formatting
      if (logString.includes('\u001b[') || logString.includes('█')) {
        return false;
      }
      return true;
    };

    // Override stdout.write to capture application logs
    process.stdout.write = ((chunk: unknown, encoding?: unknown, cb?: unknown) => {
      const logString = chunk?.toString() || '';

      if (isApplicationLog(logString)) {
        this.capturedLogs.push({
          type: 'stdout',
          message: logString.trim(),
          timestamp: new Date().toISOString(),
          testFile: this.currentTestFile || undefined,
        });
      }

      // Call original method to maintain normal output
      return this.originalStdoutWrite(
        chunk as Parameters<typeof process.stdout.write>[0],
        encoding as Parameters<typeof process.stdout.write>[1],
        cb as Parameters<typeof process.stdout.write>[2]
      );
    }) as typeof process.stdout.write;

    // Override stderr.write to capture application errors
    process.stderr.write = ((chunk: unknown, encoding?: unknown, cb?: unknown) => {
      const logString = chunk?.toString() || '';

      if (isApplicationLog(logString)) {
        this.capturedLogs.push({
          type: 'stderr',
          message: logString.trim(),
          timestamp: new Date().toISOString(),
          testFile: this.currentTestFile || undefined,
        });
      }

      // Call original method to maintain normal output
      return this.originalStderrWrite(
        chunk as Parameters<typeof process.stderr.write>[0],
        encoding as Parameters<typeof process.stderr.write>[1],
        cb as Parameters<typeof process.stderr.write>[2]
      );
    }) as typeof process.stderr.write;
  }

  onRunStart(): void {
    // Initialize log capture for the test run
  }

  onTestStart(test?: Test): void {
    // Track current test file for log association
    this.currentTestFile = test?.path || null;
  }

  onTestResult(test: Test, testResult: TestResult): void {
    // Test completed - logs are already captured
    // Reference parameters to avoid unused warnings
    void test;
    void testResult;
  }

  onRunComplete(): void {
    // Enhance the CTRF report with captured logs
    this.enhanceReportWithLogs();

    // Cleanup our log capture
    this.cleanup();
  }

  private cleanup(): void {
    // Restore original stdout/stderr
    if (this.originalStdoutWrite) {
      process.stdout.write = this.originalStdoutWrite;
    }
    if (this.originalStderrWrite) {
      process.stderr.write = this.originalStderrWrite;
    }
  }

  private enhanceReportWithLogs(): void {
    const ctrfPath = path.join(process.cwd(), 'ctrf-report.json');

    if (!fs.existsSync(ctrfPath)) {
      return;
    }

    try {
      const ctrfContent = fs.readFileSync(ctrfPath, 'utf8');
      const ctrfReport: CtrfSchema = JSON.parse(ctrfContent);

      // Enhance each test with its associated logs in the extra field
      if (ctrfReport.results?.tests) {
        ctrfReport.results.tests.forEach(
          (test: { filePath?: string; extra?: { logs?: LogEntry[] } }) => {
            // Match logs by testFile field
            const testLogs = this.capturedLogs.filter(
              log => log.testFile && log.testFile === test.filePath
            );

            if (testLogs.length > 0) {
              if (!test.extra) {
                test.extra = {};
              }
              // Remove testFile field from logs before adding to report (since it's redundant)
              test.extra.logs = testLogs.map(log => ({
                type: log.type,
                message: log.message,
                timestamp: log.timestamp,
              }));
            }
          }
        );
      }

      // Write enhanced CTRF report
      fs.writeFileSync(ctrfPath, JSON.stringify(ctrfReport, null, 2));
    } catch {
      // Silently fail - don't interfere with test output
    }
  }

  getLastError(): Error | undefined {
    return undefined;
  }
}

// Export the class as default for Jest to consume
export default EnhancedCtrfReporter;
