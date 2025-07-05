/**
 * TypeScript definitions for the Pino Jest Reporter
 */
import type { Config } from '@jest/types';
import type { TestContext, TestResult } from '@jest/test-result';

declare class PinoJestReporter {
  private _globalConfig: Config.GlobalConfig;

  constructor(globalConfig: Config.GlobalConfig);

  onTestResult(test?: TestContext, testResult?: TestResult): void;
  onRunStart(): void;
  onTestStart(): void;
  onRunComplete(): void;
  getLastError(): Error | undefined;
}

export = PinoJestReporter;
