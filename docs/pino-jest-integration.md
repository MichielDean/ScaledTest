# Pino Jest Reporter Integration

## Overview

This solution provides elegant integration between Pino structured logging and Jest's console capture mechanism, supplementing the existing CTRF reporter with detailed test logs.

## How It Works

### 1. Logger Configuration (`src/logging/logger.ts`)

The main logger automatically detects the test environment and configures different transports:

- **Test Environment**: Routes logs to `stdout` for Jest console capture
- **Development/Production**: Uses `pino-pretty` for human-readable output

```typescript
const createLogger = () => {
  const isTest = process.env.NODE_ENV === 'test';

  if (isTest) {
    // Routes to stdout for Jest console capture
    return pino({
      transport: {
        target: 'pino/file',
        options: {
          destination: 1, // stdout
        },
      },
      // ... other config
    });
  }
  // ... development config
};
```

### 2. Jest Reporter (`src/logging/jestReporter.js`)

A simple Jest reporter that captures Pino logs from Jest's console output:

```javascript
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

  // Attach to test result for other reporters to use
  if (pinoLogs.length > 0) {
    testResult.pinoLogs = pinoLogs;
  }
}
```

### 3. Jest Configuration (`jest.config.ts`)

The custom reporter is added to the existing reporters array:

```typescript
const REPORTERS_CONFIG: Config['reporters'] = [
  'default',
  [
    'jest-ctrf-json-reporter',
    // ... CTRF config
  ],
  '<rootDir>/src/logging/jestReporter.js', // Our Pino reporter
];
```

## Benefits

1. **KISS Principle**: Simple, elegant solution with minimal code
2. **Zero Configuration**: Works automatically in test environment
3. **Non-Intrusive**: Supplements existing CTRF reporter without changes
4. **Structured Logs**: Captures full Pino structured data for analysis
5. **Environment Aware**: Different behavior in test vs development

## Usage

The integration works automatically. Simply use the existing logger in your tests:

```typescript
import logger, { testLogger } from '../src/logging/logger';

test('example test', () => {
  logger.info({ testId: 'test-1', action: 'start' }, 'Test started');
  testLogger.debug({ step: 1 }, 'Performing test step');
  // Logs are automatically captured and attached to test results
});
```

## Output

During test execution, you'll see Pino logs in the console output, and the custom reporter will attach them to `testResult.pinoLogs` for potential use by other tools or analysis.

## Files Changed

- `src/logging/logger.ts` - Modified to detect test environment
- `src/logging/jestReporter.js` - New custom Jest reporter
- `jest.config.ts` - Added custom reporter to configuration
- `tests/unit/pinoJestIntegration.test.ts` - Test to verify integration

This solution follows the project's coding standards and provides a clean, maintainable approach to capturing structured logs during testing.
