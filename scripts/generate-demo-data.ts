import { sendTestResults } from './send-test-results';
import logger from '../src/logging/logger';
import { ReportFormat } from '../src/schemas/ctrf/ctrf';
import crypto from 'crypto';

// Create a dedicated logger for demo data generation
const demoLogger = logger.child({ module: 'demo-generation' });

/**
 * Generate demo CTRF test results with interesting data points for visualization
 * This script creates realistic test scenarios that showcase different chart capabilities
 */

// TypeScript interfaces for demo data
interface DemoScenarioConfig {
  name: string;
  description: string;
  tool: string;
  environment: string;
}

interface TestNameCollection {
  [key: string]: string[];
}

interface SummaryTrend {
  min: number;
  max: number;
  startBias?: number;
}

interface DemoReport {
  reportFormat: ReportFormat;
  specVersion: string;
  reportId: string;
  timestamp: string;
  results: {
    summary: {
      tests: number;
      passed: number;
      failed: number;
      skipped: number;
      pending?: number;
      duration: number;
    };
    tool: {
      name: string;
      version: string;
      generatedBy: string;
    };
    environment: {
      reportName: string;
      appName: string;
      appVersion: string;
      buildName: string;
      testEnvironment: string;
      timestamp: string;
      branch?: string;
      commit?: string;
      extra: {
        generatedBy: string;
        scenarioType: string;
      };
    };
    suites: any[];
  };
}

// Configuration for different demo scenarios
const DEMO_SCENARIOS: Record<string, DemoScenarioConfig> = {
  // Scenario 1: Progressive improvement over time
  improving: {
    name: 'Improving Test Suite',
    description: 'Shows gradual improvement in test quality over time',
    tool: 'Jest',
    environment: 'development',
  },

  // Scenario 2: Declining quality (regression)
  declining: {
    name: 'Regressing Test Suite',
    description: 'Shows declining test quality with increasing failures',
    tool: 'Playwright',
    environment: 'staging',
  },

  // Scenario 3: Stable high-performing suite
  stable: {
    name: 'Stable Test Suite',
    description: 'Shows consistent high performance',
    tool: 'Cypress',
    environment: 'production',
  },

  // Scenario 4: Volatile/flaky tests
  flaky: {
    name: 'Flaky Test Suite',
    description: 'Shows inconsistent results with high variability',
    tool: 'Vitest',
    environment: 'ci',
  },

  // Scenario 5: Large scale test suite
  large: {
    name: 'Enterprise Test Suite',
    description: 'Shows large-scale testing with many different suites',
    tool: 'Jest',
    environment: 'enterprise',
  },
};

/**
 * Generate realistic test names for different categories
 */
function generateTestNames(category: string, count: number): string[] {
  const testTypes: TestNameCollection = {
    unit: [
      'User Authentication Service',
      'Password Validation Logic',
      'Email Format Validation',
      'User Role Assignment',
      'Database Connection Pool',
      'Cache Management System',
      'API Rate Limiting',
      'Data Encryption Utilities',
      'Session Management',
      'Token Refresh Logic',
    ],
    integration: [
      'User Registration Flow',
      'Payment Processing Pipeline',
      'Email Notification Service',
      'File Upload and Processing',
      'Third-party API Integration',
      'Database Migration Scripts',
      'Search Functionality',
      'Report Generation Service',
      'Data Synchronization',
      'Webhook Processing',
    ],
    e2e: [
      'Complete User Journey',
      'Checkout Process',
      'Admin Dashboard Navigation',
      'Mobile App Login Flow',
      'Cross-browser Compatibility',
      'Performance Under Load',
      'Security Vulnerability Scan',
      'Accessibility Compliance',
      'Multi-language Support',
      'Offline Functionality',
    ],
    accessibility: [
      'Screen Reader Compatibility',
      'Keyboard Navigation',
      'Color Contrast Validation',
      'Focus Management',
      'ARIA Labels Verification',
      'Tab Order Testing',
      'High Contrast Mode',
      'Voice Control Support',
      'Interactive Elements Accessibility',
      'Temporal Animations Compliance',
    ],
    performance: [
      'Page Load Time',
      'Time to Interactive',
      'Resource Loading Performance',
      'Memory Usage',
      'CPU Utilization',
      'Database Query Performance',
      'API Response Time',
      'Client-side Rendering Performance',
      'Animation Frame Rate',
      'Network Payload Size',
    ],
    security: [
      'SQL Injection Protection',
      'Cross-site Scripting (XSS)',
      'Cross-site Request Forgery (CSRF)',
      'Authentication Bypass',
      'Session Fixation',
      'Input Sanitization',
      'File Upload Security',
      'API Authorization',
      'Password Storage',
      'Rate Limiting Effectiveness',
    ],
  };

  // Fallback to unit tests if category doesn't exist
  const tests = testTypes[category] || testTypes.unit;
  const results: string[] = [];

  // Generate requested number of tests, repeating if necessary
  for (let i = 0; i < count; i++) {
    const testName = tests[i % tests.length];
    // Add a specific test number for repeated items
    const testIndex = Math.floor(i / tests.length) + 1;
    results.push(testIndex > 1 ? `${testName} #${testIndex}` : testName);
  }

  return results;
}

/**
 * Generate dynamic test results with appropriate trends based on scenario
 */
function generateScenarioTrends(
  scenario: string,
  totalTests: number
): {
  passed: SummaryTrend;
  failed: SummaryTrend;
  skipped: SummaryTrend;
  duration: SummaryTrend;
} {
  // Base trends
  const baseTrends = {
    // Default pattern (stable)
    passed: { min: 85, max: 95 },
    failed: { min: 3, max: 12 },
    skipped: { min: 0, max: 5 },
    duration: { min: 15, max: 40 }, // In seconds
  };

  // Scenario-specific adjustments
  switch (scenario) {
    case 'improving':
      return {
        passed: { min: 60, max: 98, startBias: -0.7 }, // Start low, end high
        failed: { min: 1, max: 35, startBias: 0.7 }, // Start high, end low
        skipped: { min: 0, max: 8, startBias: 0 },
        duration: { min: 20, max: 40, startBias: 0.3 }, // Slight improvement in duration
      };

    case 'declining':
      return {
        passed: { min: 50, max: 95, startBias: 0.7 }, // Start high, end low
        failed: { min: 3, max: 40, startBias: -0.7 }, // Start low, end high
        skipped: { min: 1, max: 10, startBias: -0.4 }, // Increasing skips
        duration: { min: 25, max: 60, startBias: -0.5 }, // Getting slower
      };

    case 'stable':
      return {
        passed: { min: 92, max: 100 }, // Consistently high
        failed: { min: 0, max: 6 }, // Few failures
        skipped: { min: 0, max: 3 }, // Few skips
        duration: { min: 18, max: 25 }, // Consistent duration
      };

    case 'flaky':
      return {
        passed: { min: 60, max: 95 }, // Highly variable
        failed: { min: 4, max: 35 }, // Highly variable failures
        skipped: { min: 0, max: 15 }, // Sometimes many skips
        duration: { min: 20, max: 70 }, // Inconsistent duration
      };

    case 'large':
      // For large test suites, we'll scale up the numbers
      const scale = 5; // 5x more tests than normal
      return {
        passed: { min: 80, max: 90 },
        failed: { min: 5, max: 15 },
        skipped: { min: 2, max: 10 },
        duration: { min: 60, max: 120 }, // Much longer duration for large suites
      };

    default:
      return baseTrends;
  }
}

/**
 * Apply a trend bias to the random number generation
 * startBias: -1 (start low, end high), 0 (neutral), 1 (start high, end low)
 */
function getTrendedValue(
  min: number,
  max: number,
  index: number,
  total: number,
  startBias: number = 0
): number {
  if (startBias === 0 || total <= 1) {
    // No trend, just random between min and max
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Calculate a position factor (0 to 1) that respects the bias direction
  const position = index / (total - 1); // 0 to 1
  const trendFactor = startBias < 0 ? position : 1 - position;

  // Calculate how much of the range to use based on trend strength
  const biasStrength = Math.abs(startBias);
  const rangePortion = (max - min) * biasStrength;
  const adjustedMin = min + rangePortion * (1 - trendFactor);
  const adjustedMax = max - rangePortion * trendFactor;

  // Generate a random value within the adjusted range
  return Math.floor(Math.random() * (adjustedMax - adjustedMin + 1)) + adjustedMin;
}

/**
 * Generate a single test case with appropriate result
 */
function generateTestCase(
  name: string,
  suiteIndex: number,
  testIndex: number,
  passRate: number = 0.85
): any {
  // Determine if the test passed based on the pass rate
  const passed = Math.random() < passRate;
  const skipped = !passed && Math.random() < 0.3; // Some failing tests are skipped

  const duration = Math.random() * (passed ? 1.5 : 3.0) + 0.2; // Failed tests take longer

  // Generate a unique ID for the test
  const testId = `test-${suiteIndex}-${testIndex}-${crypto.randomUUID().slice(0, 8)}`;

  // Base test case
  const testCase: any = {
    id: testId,
    title: name,
    status: skipped ? 'skipped' : passed ? 'passed' : 'failed',
    duration: duration,
  };

  // Add failure info for failed tests
  if (!passed && !skipped) {
    testCase.failure = {
      message: generateFailureMessage(name),
      type: generateFailureType(),
      details: generateStackTrace(name),
    };
  }

  return testCase;
}

/**
 * Generate a realistic failure message
 */
function generateFailureMessage(testName: string): string {
  const errorMessages = [
    `Expected ${testName} to return valid data but got null`,
    `Timeout error: ${testName} did not complete within 5000ms`,
    `AssertionError: Expected true but received false`,
    `TypeError: Cannot read property 'value' of undefined`,
    `Network error: Failed to fetch data from API`,
    `ValidationError: Invalid input format provided`,
    `SecurityError: Unauthorized access attempt detected`,
    `Expected [object Object] to equal [object Object]`,
    `Database connection error: ECONNREFUSED`,
    `SyntaxError: Unexpected token in JSON at position 42`,
    `ReferenceError: someVar is not defined`,
    `Element not found in the DOM: .selector-${Math.floor(Math.random() * 100)}`,
  ];

  return errorMessages[Math.floor(Math.random() * errorMessages.length)];
}

/**
 * Generate a realistic error type
 */
function generateFailureType(): string {
  const errorTypes = [
    'AssertionError',
    'TypeError',
    'ReferenceError',
    'SyntaxError',
    'RangeError',
    'NetworkError',
    'ValidationError',
    'TimeoutError',
    'DatabaseError',
    'AuthenticationError',
  ];

  return errorTypes[Math.floor(Math.random() * errorTypes.length)];
}

/**
 * Generate a realistic stack trace
 */
function generateStackTrace(testName: string): string {
  const filePath = testName.toLowerCase().replace(/\s+/g, '-');
  const line = Math.floor(Math.random() * 500) + 1;
  const column = Math.floor(Math.random() * 80) + 1;

  return `Error: ${generateFailureMessage(testName)}
    at Object.<anonymous> (src/tests/${filePath}.test.js:${line}:${column})
    at processTicksAndRejections (node:internal/process/task_queues:95:5)
    at async Promise.all (index 0)
    at async TestScheduler.scheduleTests (node_modules/jest-runner/build/TestScheduler.js:317:26)
    at async runJest (node_modules/jest-runner/build/index.js:170:21)`;
}

/**
 * Generate a full CTRF report for a given scenario
 */
function generateDemoReport(
  scenario: string = 'random',
  reportIndex: number = 0,
  totalReports: number = 1
): DemoReport {
  // Choose a random scenario if 'random' is specified
  const actualScenario =
    scenario === 'random'
      ? Object.keys(DEMO_SCENARIOS)[Math.floor(Math.random() * Object.keys(DEMO_SCENARIOS).length)]
      : scenario;

  // Get scenario configuration
  const config = DEMO_SCENARIOS[actualScenario] || DEMO_SCENARIOS.stable;

  // Timestamp generation with appropriate spacing
  const now = new Date();

  // For multiple reports, space them out over the past days
  if (totalReports > 1) {
    const dayOffset = 1 + reportIndex;
    now.setDate(now.getDate() - dayOffset);
  }

  // Add a random hour and minute offset for variability when generating multiple reports
  const hourOffset = Math.floor(Math.random() * 8);
  const minuteOffset = Math.floor(Math.random() * 60);

  now.setHours(now.getHours() - hourOffset);
  now.setMinutes(now.getMinutes() - minuteOffset);

  // Generate trends based on the scenario
  const totalTests =
    actualScenario === 'large'
      ? Math.floor(Math.random() * 500) + 500
      : Math.floor(Math.random() * 100) + 30;
  const trends = generateScenarioTrends(actualScenario, totalReports);

  // Calculate test summary numbers using the trend data
  const passedPercentage = getTrendedValue(
    trends.passed.min,
    trends.passed.max,
    reportIndex,
    totalReports,
    trends.passed.startBias || 0
  );

  const skippedPercentage = getTrendedValue(
    trends.skipped.min,
    trends.skipped.max,
    reportIndex,
    totalReports,
    trends.skipped.startBias || 0
  );

  const passed = Math.floor((passedPercentage / 100) * totalTests);
  const skipped = Math.floor((skippedPercentage / 100) * totalTests);
  const failed = totalTests - passed - skipped;

  // Generate duration in seconds
  const duration = getTrendedValue(
    trends.duration.min,
    trends.duration.max,
    reportIndex,
    totalReports,
    trends.duration.startBias || 0
  );

  // Generate test suites
  const suites = generateTestSuites(actualScenario, passed, failed, skipped, totalTests);

  // Format build name based on scenario
  const buildNumber = 1000 + reportIndex;
  const buildName =
    actualScenario === 'improving'
      ? `Feature Development #${buildNumber}`
      : actualScenario === 'declining'
        ? `Maintenance Release #${buildNumber}`
        : actualScenario === 'stable'
          ? `Production Release #${buildNumber}`
          : actualScenario === 'flaky'
            ? `Nightly Build #${buildNumber}`
            : `Enterprise Suite #${buildNumber}`;

  // Choose a tool version that makes sense
  const toolVersion =
    config.tool === 'Jest'
      ? '29.5.0'
      : config.tool === 'Playwright'
        ? '1.34.3'
        : config.tool === 'Cypress'
          ? '12.14.0'
          : '0.32.2'; // Vitest

  // Create report ID using a timestamp and random suffix
  const reportId = `demo-${actualScenario}-${now.getTime()}-${Math.random().toString(36).substring(2, 7)}`;

  // Create the full report object
  return {
    reportFormat: ReportFormat.CTRF,
    specVersion: '1.0.0',
    reportId,
    timestamp: now.toISOString(),
    results: {
      summary: {
        tests: totalTests,
        passed,
        failed,
        skipped,
        duration,
      },
      tool: {
        name: config.tool,
        version: toolVersion,
        generatedBy: `CTRF Demo Generator for ${config.tool}`,
      },
      environment: {
        reportName: config.name,
        appName: 'ScaledTest',
        appVersion: '1.0.0',
        buildName,
        testEnvironment: config.environment,
        timestamp: now.toISOString(),
        branch: actualScenario === 'stable' ? 'main' : `feature/${actualScenario}-testing`,
        commit: crypto.randomBytes(7).toString('hex'),
        extra: {
          generatedBy: 'demo-data-generator',
          scenarioType: actualScenario,
        },
      },
      suites,
    },
  };
}

/**
 * Generate realistic test suites with appropriate distribution
 */
function generateTestSuites(
  scenario: string,
  passed: number,
  failed: number,
  skipped: number,
  totalTests: number
): any[] {
  const suites = [];
  const totalRemaining = { passed, failed, skipped };

  // Define suite categories and approximate distribution
  const suiteCategories = [
    'unit',
    'integration',
    'e2e',
    'accessibility',
    'performance',
    'security',
  ];

  const largeScale = scenario === 'large';

  // Define how many suites to create based on scenario
  const numSuites = largeScale ? 15 : 8;

  // Create suites
  for (let i = 0; i < numSuites; i++) {
    // Select category - weight toward unit and integration for first suites
    let category;
    if (i < 2) {
      category = 'unit';
    } else if (i < 4) {
      category = 'integration';
    } else {
      category = suiteCategories[Math.floor(Math.random() * suiteCategories.length)];
    }

    // Calculate how many tests should be in this suite
    let suiteTestCount;
    if (i === numSuites - 1) {
      // Last suite gets all remaining tests
      suiteTestCount = totalRemaining.passed + totalRemaining.failed + totalRemaining.skipped;
    } else {
      // Distribute remaining tests among suites, with more weight to earlier suites
      const remainingTests = totalRemaining.passed + totalRemaining.failed + totalRemaining.skipped;
      const weightedPortion = (numSuites - i) / ((numSuites * (numSuites + 1)) / 2);
      suiteTestCount = Math.floor(remainingTests * weightedPortion);

      // Ensure we have at least some tests
      suiteTestCount = Math.max(suiteTestCount, largeScale ? 10 : 3);

      // Don't exceed remaining tests
      suiteTestCount = Math.min(suiteTestCount, remainingTests);
    }

    // Generate test cases for the suite
    const testCases = [];
    const suitePassRate = category === 'unit' ? 0.9 : category === 'integration' ? 0.8 : 0.7;
    const testNames = generateTestNames(category, suiteTestCount);

    let suitePassed = 0;
    let suiteFailed = 0;
    let suiteSkipped = 0;

    for (let j = 0; j < suiteTestCount; j++) {
      // Determine statistically if this test should pass, fail or be skipped
      // to match our target distribution
      let forcedStatus = null;

      if (
        suitePassed >= Math.min(totalRemaining.passed, Math.floor(suiteTestCount * suitePassRate))
      ) {
        forcedStatus = 'fail';
      } else if (
        totalRemaining.failed === 0 ||
        (totalRemaining.skipped === 0 && j === suiteTestCount - 1)
      ) {
        forcedStatus = 'pass';
      } else if (
        suiteFailed >=
        Math.min(totalRemaining.failed, Math.floor(suiteTestCount * (1 - suitePassRate)))
      ) {
        if (suiteSkipped < totalRemaining.skipped) {
          forcedStatus = 'skip';
        } else {
          forcedStatus = 'pass';
        }
      }

      const effectivePassRate =
        forcedStatus === 'pass' ? 1 : forcedStatus === 'fail' ? 0 : suitePassRate;
      const test = generateTestCase(testNames[j], i, j, effectivePassRate);
      testCases.push(test);

      if (test.status === 'passed') {
        suitePassed++;
        totalRemaining.passed--;
      } else if (test.status === 'skipped') {
        suiteSkipped++;
        totalRemaining.skipped--;
      } else {
        suiteFailed++;
        totalRemaining.failed--;
      }
    }

    // Create suite object
    suites.push({
      id: `suite-${i}-${category}`,
      title: `${category.charAt(0).toUpperCase()}${category.slice(1)} Tests`,
      description: `Test suite for ${category} functionality`,
      tests: testCases,
      summary: {
        tests: testCases.length,
        passed: suitePassed,
        failed: suiteFailed,
        skipped: suiteSkipped,
      },
    });
  }

  return suites;
}

/**
 * Generate reports and send them to the API
 */
async function generateAndSendDemoData(): Promise<void> {
  const args = process.argv.slice(2);

  // Handle help and list commands
  if (args[0] === 'help' || args.includes('--help')) {
    showHelp();
    return;
  }

  if (args[0] === 'list') {
    listScenarios();
    return;
  }

  // Parse scenario and count arguments
  const scenario = args[0] || 'random';
  const count = parseInt(args[1], 10) || 1;

  if (!(scenario === 'random' || Object.keys(DEMO_SCENARIOS).includes(scenario))) {
    demoLogger.error(`Unknown scenario: ${scenario}`);
    demoLogger.info('Use "node generate-demo-data.js list" to see available scenarios');
    process.exit(1);
  }

  demoLogger.info(`Generating ${count} reports for scenario: ${scenario}`);

  // Generate and send each report
  for (let i = 0; i < count; i++) {
    try {
      const report = generateDemoReport(scenario, i, count);
      demoLogger.info(`Generated report #${i + 1} of ${count}: ${report.reportId}`);
      demoLogger.info(
        `Tests: ${report.results.summary.tests}, Passed: ${report.results.summary.passed}, Failed: ${report.results.summary.failed}`
      );

      // Send the report
      await sendTestResults(report);
      demoLogger.info(`Report #${i + 1} sent successfully`);

      // Add a small delay between reports
      if (i < count - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      demoLogger.error(`Error generating/sending report #${i + 1}:`, { error });
      process.exit(1);
    }
  }

  demoLogger.info(`✨ Successfully generated and sent ${count} demo reports!`);
}

/**
 * Show help information
 */
function showHelp(): void {
  demoLogger.info('CTRF Demo Data Generator Help');
  demoLogger.info('================================\n');
  demoLogger.info('Usage: npm run demo-data [scenario] [count]');
  demoLogger.info('       npm run demo-data [command]\n');
  demoLogger.info('Arguments:');
  demoLogger.info('  scenario  Test scenario to generate (default: random)');
  demoLogger.info('  count     Number of reports to generate (default: 1)\n');
  demoLogger.info('Commands:');
  demoLogger.info('  list      List all available scenarios');
  demoLogger.info('  help      Show this help message\n');
  demoLogger.info('Examples:');
  demoLogger.info('  npm run demo-data                    # Generate 1 random report');
  demoLogger.info('  npm run demo-data random 5           # Generate 5 random reports');
  demoLogger.info('  npm run demo-data improving 3        # Generate 3 improving scenario reports');
  demoLogger.info('  npm run demo-data flaky 1            # Generate 1 flaky test scenario');
}

/**
 * List available scenarios
 */
function listScenarios(): void {
  demoLogger.info('Available Demo Scenarios');
  demoLogger.info('===========================\n');
  demoLogger.info('random     - Generate random mix of scenarios (good for variety)');

  Object.entries(DEMO_SCENARIOS).forEach(([key, config]) => {
    demoLogger.info(`${key.padEnd(10)} - ${config.description}`);
    demoLogger.info(`           Tool: ${config.tool}, Environment: ${config.environment}\n`);
  });

  demoLogger.info(
    'Pro tip: Use "random" to generate diverse data for comprehensive chart testing.'
  );
}

// Handle command line execution (ES module-compatible)
// Compare the script's URL to the executed script path when running via `node`.
const executedScriptPath = process.argv && process.argv.length > 1 ? process.argv[1] : undefined;
const thisModulePath =
  typeof import.meta !== 'undefined' ? new URL(import.meta.url).pathname : undefined;
if (executedScriptPath && thisModulePath && executedScriptPath.endsWith(thisModulePath)) {
  generateAndSendDemoData().catch(error => {
    demoLogger.error('Unhandled error:', { error });
    process.exit(1);
  });
}

export { generateDemoReport, generateAndSendDemoData, DEMO_SCENARIOS };
