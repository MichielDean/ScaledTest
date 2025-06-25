import { sendTestResults } from './send-test-results.js';
import logger from '../src/logging/logger.js';
import { CtrfSchema, Status, ReportFormat } from '../src/schemas/ctrf/ctrf.js';

// Create a script-specific logger
const scriptLogger = logger.child({ module: 'generate-demo-data' });

// Type definitions for demo scenarios
interface DemoScenario {
  name: string;
  description: string;
  tool: string;
  environment: string;
}

interface DemoScenarios {
  [key: string]: DemoScenario;
}

interface ReportOptions {
  testCount?: number;
  timeOffset?: number;
  performanceProfile?: 'fast' | 'normal' | 'slow' | 'very_slow';
  buildNumber?: number;
}

type TestType = 'unit' | 'integration' | 'e2e' | 'accessibility';
type PerformanceProfile = 'fast' | 'normal' | 'slow' | 'very_slow';

// Configuration for different demo scenarios
const DEMO_SCENARIOS: DemoScenarios = {
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
function generateTestNames(category: TestType, count: number): string[] {
  const testTypes = {
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
      'Mobile Accessibility',
      'WCAG 2.1 Compliance',
    ],
  };

  const names = testTypes[category] || testTypes.unit;
  const result = [];

  for (let i = 0; i < count; i++) {
    const baseName = names[i % names.length];
    const variation = i >= names.length ? ` (Variant ${Math.floor(i / names.length) + 1})` : '';
    result.push(`${baseName}${variation}`);
  }

  return result;
}

/**
 * Generate test duration based on test type and performance characteristics
 */
function generateTestDuration(
  testType: TestType,
  performanceProfile: PerformanceProfile = 'normal'
): number {
  const baseDurations = {
    unit: { min: 10, max: 500 },
    integration: { min: 100, max: 5000 },
    e2e: { min: 1000, max: 30000 },
    accessibility: { min: 500, max: 8000 },
  };

  const multipliers = {
    fast: 0.5,
    normal: 1.0,
    slow: 2.0,
    very_slow: 4.0,
  };

  const base = baseDurations[testType] || baseDurations.unit;
  const multiplier = multipliers[performanceProfile] || 1.0;

  const min = base.min * multiplier;
  const max = base.max * multiplier;

  return Math.floor(Math.random() * (max - min) + min);
}

/**
 * Generate test status based on scenario and time progression
 */
function generateTestStatus(
  scenario: string,
  testIndex: number,
  totalTests: number,
  timeProgression: number = 0
): Status {
  const scenarioConfig = DEMO_SCENARIOS[scenario];

  switch (scenario) {
    case 'improving':
      // Start with more failures, improve over time
      const improvingFailureRate = Math.max(0.05, 0.3 - timeProgression * 0.25);
      const improvingSkipRate = Math.max(0.02, 0.1 - timeProgression * 0.08);
      return generateStatusWithRates(improvingFailureRate, improvingSkipRate);

    case 'declining':
      // Start good, get worse over time
      const decliningFailureRate = Math.min(0.4, 0.05 + timeProgression * 0.35);
      const decliningSkipRate = Math.min(0.15, 0.02 + timeProgression * 0.13);
      return generateStatusWithRates(decliningFailureRate, decliningSkipRate);

    case 'stable':
      // Consistently good performance
      return generateStatusWithRates(0.05, 0.02);

    case 'flaky':
      // High variability - some tests very unreliable
      const isUnstableTest = testIndex % 5 === 0; // Every 5th test is unstable
      if (isUnstableTest) {
        return generateStatusWithRates(0.6, 0.1); // 60% failure rate for flaky tests
      } else {
        return generateStatusWithRates(0.05, 0.02); // Normal tests are fine
      }

    case 'large':
      // Large enterprise suite with mixed performance
      const suiteIndex = Math.floor(testIndex / 20); // Group tests into suites of ~20
      const suitePerformance = [0.02, 0.05, 0.15, 0.08, 0.25, 0.03, 0.1]; // Different suite quality
      const failureRate = suitePerformance[suiteIndex % suitePerformance.length];
      return generateStatusWithRates(failureRate, 0.05);

    default:
      return generateStatusWithRates(0.1, 0.05);
  }
}

function generateStatusWithRates(failureRate: number, skipRate: number): Status {
  const rand = Math.random();
  if (rand < failureRate) return Status.failed;
  if (rand < failureRate + skipRate) return Status.skipped;
  return Status.passed;
}

/**
 * Generate error messages for failed tests
 */
function generateErrorMessage(testName: string, testType: TestType): string {
  const errorTemplates = {
    unit: [
      'AssertionError: Expected true but received false',
      "TypeError: Cannot read property 'value' of undefined",
      'ReferenceError: variable is not defined',
      'ValidationError: Invalid input format',
      'TimeoutError: Operation timed out after 5000ms',
    ],
    integration: [
      'ConnectionError: Failed to connect to database',
      'HTTPError: 500 Internal Server Error',
      'AuthenticationError: Invalid credentials',
      'DataIntegrityError: Constraint violation',
      'ServiceUnavailableError: External API unreachable',
    ],
    e2e: [
      'ElementNotFoundError: Could not locate element',
      'TimeoutError: Page load timeout exceeded',
      'NetworkError: Failed to load resource',
      'ScriptError: JavaScript execution failed',
      'AssertionError: Element text mismatch',
    ],
    accessibility: [
      'AccessibilityError: Missing alt text on image',
      'ContrastError: Text contrast ratio below 4.5:1',
      'KeyboardError: Element not focusable via keyboard',
      'ARIAError: Missing required ARIA label',
      'StructureError: Invalid heading hierarchy',
    ],
  };

  const errors = errorTemplates[testType] || errorTemplates.unit;
  return errors[Math.floor(Math.random() * errors.length)];
}

/**
 * Generate a complete CTRF report for a specific scenario
 */
function generateDemoReport(scenario: string, options: ReportOptions = {}): CtrfSchema {
  const config = DEMO_SCENARIOS[scenario];
  const {
    testCount = 50,
    timeOffset = 0, // Hours ago
    performanceProfile = 'normal',
    buildNumber = Math.floor(Math.random() * 1000) + 1,
  } = options;
  const now = new Date();
  const testStartTime = Math.floor(now.getTime() - timeOffset * 60 * 60 * 1000 - testCount * 100); // Offset + test duration
  const testEndTime = Math.floor(
    testStartTime + testCount * 100 + Math.floor(Math.random() * 10000)
  ); // Add some variance

  // Determine test type distribution
  const testTypes = ['unit', 'integration', 'e2e', 'accessibility'];
  const typeDistribution = {
    unit: 0.5, // 50% unit tests
    integration: 0.3, // 30% integration tests
    e2e: 0.15, // 15% e2e tests
    accessibility: 0.05, // 5% accessibility tests
  };

  // Generate tests
  const tests: CtrfSchema['results']['tests'] = [];
  let passedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < testCount; i++) {
    // Determine test type based on distribution
    let testType: TestType = 'unit';
    const rand = Math.random();
    let cumulative = 0;
    for (const [type, percentage] of Object.entries(typeDistribution)) {
      cumulative += percentage;
      if (rand <= cumulative) {
        testType = type as TestType;
        break;
      }
    }

    // Generate test data
    const testNames = generateTestNames(
      testType,
      Math.ceil(testCount * typeDistribution[testType]!)
    );
    const testName = testNames[i % testNames.length]!;
    const status = generateTestStatus(scenario, i, testCount, timeOffset / 100); // Time progression factor
    const duration = generateTestDuration(testType, performanceProfile);
    const testStart = testStartTime + i * 100;
    const testStop = testStart + duration;

    // Count statuses
    if (status === Status.passed) passedCount++;
    else if (status === Status.failed) failedCount++;
    else if (status === Status.skipped) skippedCount++;

    const test: CtrfSchema['results']['tests'][0] = {
      name: `${config.name} ${testType.charAt(0).toUpperCase() + testType.slice(1)} Tests ${testName}`,
      duration,
      status,
      start: testStart,
      stop: testStop,
      rawStatus: status,
      type: testType,
      filePath: `C:\\Tests\\${testType}\\${testName.replace(/\s+/g, '')}.test.js`,
      retries: status === Status.failed && Math.random() < 0.3 ? Math.floor(Math.random() * 3) : 0,
      flaky: status === Status.failed && scenario === 'flaky' && Math.random() < 0.4,
      suite: `${config.name} > ${testType.charAt(0).toUpperCase() + testType.slice(1)} Tests`,
    };

    // Add error message for failed tests
    if (status === Status.failed) {
      test.message = generateErrorMessage(testName, testType);
    }

    tests.push(test);
  }

  // Create the CTRF report structure
  const report: CtrfSchema = {
    reportFormat: ReportFormat.CTRF,
    specVersion: '1.0.0',
    reportId: `demo-${scenario}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    results: {
      tool: {
        name: config.tool,
        version: `${Math.floor(Math.random() * 5) + 1}.${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}`,
        extra: {
          generatedBy: 'demo-data-generator',
        },
      },
      summary: {
        tests: testCount,
        passed: passedCount,
        failed: failedCount,
        pending: 0,
        skipped: skippedCount,
        other: 0,
        start: testStartTime,
        stop: testEndTime,
      },
      tests,
      environment: {
        testEnvironment: config.environment,
        appName: 'ScaledTest',
        appVersion: '1.0.0',
        buildName: `Demo Build #${buildNumber}`,
        buildNumber: buildNumber.toString(),
        extra: {
          demoScenario: scenario,
          description: config.description,
          generatedAt: new Date().toISOString(),
        },
      },
    },
  };

  return report;
}

/**
 * Main function to generate and send demo data
 */
async function generateAndSendDemoData(): Promise<void> {
  scriptLogger.info('Starting demo data generator for CTRF reports');

  // Parse command line arguments
  const args = process.argv.slice(2);
  const scenario = args[0] || 'random';
  const count = parseInt(args[1]!) || 1;

  if (scenario === 'help' || scenario === '--help' || scenario === '-h') {
    showHelp();
    return;
  }

  if (scenario === 'list') {
    listScenarios();
    return;
  }

  scriptLogger.info(`Generating ${count} report(s) with scenario: ${scenario}`);

  try {
    const now = new Date(); // Define now at the start of the function

    if (scenario === 'random') {
      // Generate multiple reports with different scenarios and time offsets
      const scenarios = Object.keys(DEMO_SCENARIOS);

      for (let i = 0; i < count; i++) {
        const randomScenario = scenarios[Math.floor(Math.random() * scenarios.length)]!;

        // Create more realistic time distribution patterns
        let timeOffset;
        if (count <= 5) {
          // For small counts, spread over last 7 days with some clustering
          timeOffset = Math.floor(Math.random() * 168); // Up to 7 days ago
        } else if (count <= 10) {
          // For medium counts, spread over last 2 weeks
          timeOffset = Math.floor(Math.random() * 336); // Up to 14 days ago
        } else {
          // For large counts, spread over last month
          timeOffset = Math.floor(Math.random() * 720); // Up to 30 days ago
        }

        // Add some clustering - 30% chance of being close to another recent report
        if (Math.random() < 0.3 && i > 0) {
          timeOffset = Math.floor(Math.random() * 48); // Last 2 days
        }

        const testCount = Math.floor(Math.random() * 80) + 20; // 20-100 tests
        const performanceProfiles: PerformanceProfile[] = ['fast', 'normal', 'slow', 'very_slow'];
        const performanceProfile =
          performanceProfiles[Math.floor(Math.random() * performanceProfiles.length)]!;

        scriptLogger.info(`Generating report ${i + 1}/${count}: ${randomScenario}`, {
          timeOffset,
          testCount,
          performanceProfile,
          reportNumber: i + 1,
          totalReports: count,
        });

        const reportDate = new Date(now.getTime() - timeOffset * 60 * 60 * 1000);
        scriptLogger.debug('Report date details', {
          reportDate: reportDate.toISOString(),
          timeOffset,
        });

        const report = generateDemoReport(randomScenario, {
          testCount,
          timeOffset,
          performanceProfile,
          buildNumber: 1000 + i,
        });

        await sendTestResults(report);

        // Add delay between requests to avoid overwhelming the server
        if (i < count - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } else if (DEMO_SCENARIOS[scenario]) {
      // Generate specific scenario with more realistic time spacing
      for (let i = 0; i < count; i++) {
        // Create more varied time distribution for specific scenarios
        let timeOffset;

        if (scenario === 'improving' || scenario === 'declining') {
          // For trend scenarios, space them out to show progression
          const baseOffset = i * 24; // Base 24-hour spacing
          const randomVariation = Math.floor(Math.random() * 12) - 6; // ±6 hours variation
          timeOffset = baseOffset + randomVariation;
        } else {
          // For other scenarios, more random distribution
          const maxDays = Math.min(7, count * 2); // Scale time range with count
          timeOffset = Math.floor(Math.random() * (maxDays * 24));
        }

        const testCount = Math.floor(Math.random() * 50) + 30; // 30-80 tests

        scriptLogger.info(`Generating ${scenario} report ${i + 1}/${count}`, {
          timeOffset,
          testCount,
          reportNumber: i + 1,
          totalReports: count,
        });

        const reportDate = new Date(now.getTime() - timeOffset * 60 * 60 * 1000);
        scriptLogger.debug('Report date details', {
          reportDate: reportDate.toISOString(),
          timeOffset,
        });

        const report = generateDemoReport(scenario, {
          testCount,
          timeOffset,
          buildNumber: 2000 + i,
        });

        await sendTestResults(report);

        if (i < count - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } else {
      scriptLogger.error('Unknown scenario provided', { scenario });
      scriptLogger.info('Use "npm run demo-data list" to see available scenarios');
      process.exit(1);
    }

    scriptLogger.info('Demo data generation completed successfully');
    scriptLogger.info('You can now view the charts with interesting data points');
    scriptLogger.info('Visit your dashboard to see the visualizations');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    scriptLogger.error('Failed to generate demo data', { error: errorMessage });
    process.exit(1);
  }
}

/**
 * Show help information
 */
function showHelp(): void {
  scriptLogger.info('CTRF Demo Data Generator Help');
  scriptLogger.info('================================');
  scriptLogger.info('Usage: npm run demo-data [scenario] [count]');
  scriptLogger.info('       npm run demo-data [command]');
  scriptLogger.info('Arguments:');
  scriptLogger.info('  scenario  Test scenario to generate (default: random)');
  scriptLogger.info('  count     Number of reports to generate (default: 1)');
  scriptLogger.info('Commands:');
  scriptLogger.info('  list      List all available scenarios');
  scriptLogger.info('  help      Show this help message');
  scriptLogger.info('Examples:');
  scriptLogger.info('  npm run demo-data                    # Generate 1 random report');
  scriptLogger.info('  npm run demo-data random 5           # Generate 5 random reports');
  scriptLogger.info(
    '  npm run demo-data improving 3        # Generate 3 improving scenario reports'
  );
  scriptLogger.info('  npm run demo-data flaky 1            # Generate 1 flaky test scenario');
}

/**
 * List available scenarios
 */
function listScenarios(): void {
  scriptLogger.info('Available Demo Scenarios');
  scriptLogger.info('===========================');
  scriptLogger.info('random     - Generate random mix of scenarios (good for variety)');

  Object.entries(DEMO_SCENARIOS).forEach(([key, config]) => {
    scriptLogger.info(`${key.padEnd(10)} - ${config.description}`);
    scriptLogger.info(`           Tool: ${config.tool}, Environment: ${config.environment}`);
  });

  scriptLogger.info(
    'Pro tip: Use "random" to generate diverse data for comprehensive chart testing.'
  );
}

// Handle command line execution
if (import.meta.url === `file://${process.argv[1]}`) {
  generateAndSendDemoData().catch(error => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    scriptLogger.error('Unhandled error in demo data generation', { error: errorMessage });
    process.exit(1);
  });
}

export { generateDemoReport, generateAndSendDemoData, DEMO_SCENARIOS };
