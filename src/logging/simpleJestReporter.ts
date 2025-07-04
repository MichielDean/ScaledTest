/**
 * Enhanced CTRF Reporter that composes with jest-ctrf-json-reporter
 * Captures ALL logs via stdout/stderr and adds them to CTRF report extra field
 * Works with ANY logger (Pino, Winston, console.log, etc.)
 */
import type { Config } from '@jest/types';
import type { Test } from '@jest/test-result';
import * as fs from 'fs';
import * as path from 'path';
import type { CtrfSchema } from '../schemas/ctrf/ctrf';
// Import the original CTRF reporter
import GenerateCtrfReport from 'jest-ctrf-json-reporter';

interface LogEntry {
  type: string;
  message: string;
  timestamp: string;
  testFile?: string;
}

class EnhancedCtrfReporter {
  private _globalConfig: Config.GlobalConfig;
  private originalStdoutWrite!: typeof process.stdout.write;
  private originalStderrWrite!: typeof process.stderr.write;
  private capturedLogs: LogEntry[] = [];
  private currentTestFile: string | null = null;
  private ctrfReporter: GenerateCtrfReport;

  constructor(globalConfig: Config.GlobalConfig, options?: unknown) {
    this._globalConfig = globalConfig;
    // Create the original CTRF reporter - it does all the heavy lifting
    // Pass the options through to the CTRF reporter
    this.ctrfReporter = new GenerateCtrfReport(
      globalConfig,
      (options as Record<string, unknown>) || {},
      {}
    );
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

  onTestStart(test?: Test): void {
    // Track current test file for log association
    this.currentTestFile = test?.path || null;
    // Delegate to CTRF reporter (no parameters for their method)
    this.ctrfReporter.onTestStart();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onTestResult(test?: Test, testResult?: any): void {
    // Delegate to CTRF reporter with correct parameters
    if (test && testResult) {
      this.ctrfReporter.onTestResult(test, testResult);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
  onRunComplete(_contexts?: Set<any>, _results?: any): void {
    // First let CTRF reporter complete its work
    this.ctrfReporter.onRunComplete();

    // Then enhance the report with logs
    this.enhanceReportWithLogs();

    // Finally cleanup our log capture
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
      ctrfReport.results.tests.forEach(test => {
        const testLogs = this.capturedLogs.filter(
          log => log.testFile && log.testFile === test.filePath
        );

        if (testLogs.length > 0) {
          if (!test.extra) {
            test.extra = {};
          }
          test.extra.logs = testLogs;
        }
      });

      // Write enhanced CTRF report
      fs.writeFileSync(ctrfPath, JSON.stringify(ctrfReport, null, 2));
    } catch {
      // Silently fail - don't interfere with test output
    }
  }

  // Required Jest reporter methods - delegate to CTRF reporter
  onRunStart(): void {
    this.ctrfReporter.onRunStart();
  }

  getLastError(): Error | undefined {
    return undefined; // Simple implementation
  }
}

export default EnhancedCtrfReporter;
