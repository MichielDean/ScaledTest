/**
 * Test Log Collector for capturing Pino logs during Jest test execution
 * This collector stores logs in memory and associates them with test contexts
 */

interface LogEntry {
  timestamp: string;
  level: number;
  message: string;
  data: Record<string, unknown>;
  testContext?: string;
}

class TestLogCollector {
  private static instance: TestLogCollector;
  private logs: LogEntry[] = [];
  private currentTestContext: string | null = null;

  static getInstance(): TestLogCollector {
    if (!TestLogCollector.instance) {
      TestLogCollector.instance = new TestLogCollector();
    }
    return TestLogCollector.instance;
  }

  setCurrentTestContext(context: string): void {
    this.currentTestContext = context;
  }

  clearCurrentTestContext(): void {
    this.currentTestContext = null;
  }

  addLog(entry: LogEntry): void {
    // Associate log with current test context if available
    if (this.currentTestContext) {
      entry.testContext = this.currentTestContext;
    }
    this.logs.push(entry);
  }

  getLogsForTest(testPath: string): LogEntry[] {
    return this.logs.filter(log => log.testContext && log.testContext.includes(testPath));
  }

  getAllLogs(): LogEntry[] {
    return [...this.logs];
  }

  clear(): void {
    this.logs = [];
  }

  // Method for Pino to write logs
  write(logObject: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: (logObject.time as string) || new Date().toISOString(),
      level: (logObject.level as number) || 30,
      message: (logObject.msg as string) || '',
      data: { ...logObject },
      testContext: this.currentTestContext || undefined,
    };
    this.addLog(entry);
  }
}

export default TestLogCollector;
export type { LogEntry };
