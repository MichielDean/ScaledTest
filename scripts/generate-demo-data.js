import { sendTestResults } from './send-test-results.js';

/**
 * Generate demo CTRF test results with interesting data points for visualization
 * This script creates realistic test scenarios that showcase different chart capabilities
 */

// Configuration for different demo scenarios
const DEMO_SCENARIOS = {
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
function generateTestNames(category, count) {
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
function generateTestDuration(testType, performanceProfile = 'normal') {
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
function generateTestStatus(scenario, testIndex, totalTests, timeProgression = 0) {
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

function generateStatusWithRates(failureRate, skipRate) {
  const rand = Math.random();
  if (rand < failureRate) return 'failed';
  if (rand < failureRate + skipRate) return 'skipped';
  return 'passed';
}

/**
 * Generate error messages for failed tests
 */
function generateErrorMessage(testName, testType) {
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
function generateDemoReport(scenario, options = {}) {
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
  const tests = [];
  let passedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < testCount; i++) {
    // Determine test type based on distribution
    let testType = 'unit';
    const rand = Math.random();
    let cumulative = 0;
    for (const [type, percentage] of Object.entries(typeDistribution)) {
      cumulative += percentage;
      if (rand <= cumulative) {
        testType = type;
        break;
      }
    }

    // Generate test data
    const testNames = generateTestNames(
      testType,
      Math.ceil(testCount * typeDistribution[testType])
    );
    const testName = testNames[i % testNames.length];
    const status = generateTestStatus(scenario, i, testCount, timeOffset / 100); // Time progression factor
    const duration = generateTestDuration(testType, performanceProfile);

    // Count statuses
    if (status === 'passed') passedCount++;
    else if (status === 'failed') failedCount++;
    else if (status === 'skipped') skippedCount++;

    const test = {
      name: `${config.name} ${testType.charAt(0).toUpperCase() + testType.slice(1)} Tests ${testName}`,
      duration,
      status,
      rawStatus: status,
      type: testType,
      filePath: `C:\\Tests\\${testType}\\${testName.replace(/\s+/g, '')}.test.js`,
      retries: status === 'failed' && Math.random() < 0.3 ? Math.floor(Math.random() * 3) : 0,
      flaky: status === 'failed' && scenario === 'flaky' && Math.random() < 0.4,
      suite: `${config.name} > ${testType.charAt(0).toUpperCase() + testType.slice(1)} Tests`,
    };

    // Add error message for failed tests
    if (status === 'failed') {
      test.message = generateErrorMessage(testName, testType);
    }

    tests.push(test);
  }

  // Create the CTRF report structure
  const report = {
    results: {
      tool: {
        name: config.tool,
        version: `${Math.floor(Math.random() * 5) + 1}.${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}`,
        generatedBy: 'demo-data-generator',
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
          generatedAt: now.toISOString(),
        },
      },
    },
  };

  return report;
}

/**
 * Main function to generate and send demo data
 */
async function generateAndSendDemoData() {
  console.log('🎭 Demo Data Generator for CTRF Reports');
  console.log('=====================================\n');

  // Parse command line arguments
  const args = process.argv.slice(2);
  const scenario = args[0] || 'random';
  const count = parseInt(args[1]) || 1;

  if (scenario === 'help' || scenario === '--help' || scenario === '-h') {
    showHelp();
    return;
  }

  if (scenario === 'list') {
    listScenarios();
    return;
  }
  console.log(`📊 Generating ${count} report(s) with scenario: ${scenario}\n`);

  try {
    const now = new Date(); // Define now at the start of the function

    if (scenario === 'random') {
      // Generate multiple reports with different scenarios and time offsets
      const scenarios = Object.keys(DEMO_SCENARIOS);

      for (let i = 0; i < count; i++) {
        const randomScenario = scenarios[Math.floor(Math.random() * scenarios.length)];

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
        const performanceProfiles = ['fast', 'normal', 'slow', 'very_slow'];
        const performanceProfile =
          performanceProfiles[Math.floor(Math.random() * performanceProfiles.length)];
        console.log(
          `📤 Generating report ${i + 1}/${count}: ${randomScenario} (${timeOffset}h ago, ${testCount} tests, ${performanceProfile} performance)`
        );

        const reportDate = new Date(now.getTime() - timeOffset * 60 * 60 * 1000);
        console.log(
          `   📅 Report date: ${reportDate.toLocaleDateString()} ${reportDate.toLocaleTimeString()}`
        );

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
        console.log(
          `📤 Generating ${scenario} report ${i + 1}/${count} (${timeOffset}h ago, ${testCount} tests)`
        );

        const reportDate = new Date(now.getTime() - timeOffset * 60 * 60 * 1000);
        console.log(
          `   📅 Report date: ${reportDate.toLocaleDateString()} ${reportDate.toLocaleTimeString()}`
        );

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
      console.error(`❌ Unknown scenario: ${scenario}`);
      console.log('Use "npm run demo-data list" to see available scenarios.');
      process.exit(1);
    }

    console.log('\n✅ Demo data generation completed successfully!');
    console.log('🎯 You can now view the charts with interesting data points.');
    console.log('📊 Visit your dashboard to see the visualizations.');
  } catch (error) {
    console.error('\n❌ Failed to generate demo data:', error.message);
    process.exit(1);
  }
}

/**
 * Show help information
 */
function showHelp() {
  console.log('📚 CTRF Demo Data Generator Help');
  console.log('================================\n');
  console.log('Usage: npm run demo-data [scenario] [count]');
  console.log('       npm run demo-data [command]\n');
  console.log('Arguments:');
  console.log('  scenario  Test scenario to generate (default: random)');
  console.log('  count     Number of reports to generate (default: 1)\n');
  console.log('Commands:');
  console.log('  list      List all available scenarios');
  console.log('  help      Show this help message\n');
  console.log('Examples:');
  console.log('  npm run demo-data                    # Generate 1 random report');
  console.log('  npm run demo-data random 5           # Generate 5 random reports');
  console.log('  npm run demo-data improving 3        # Generate 3 improving scenario reports');
  console.log('  npm run demo-data flaky 1            # Generate 1 flaky test scenario');
}

/**
 * List available scenarios
 */
function listScenarios() {
  console.log('📋 Available Demo Scenarios');
  console.log('===========================\n');
  console.log('random     - Generate random mix of scenarios (good for variety)');

  Object.entries(DEMO_SCENARIOS).forEach(([key, config]) => {
    console.log(`${key.padEnd(10)} - ${config.description}`);
    console.log(`           Tool: ${config.tool}, Environment: ${config.environment}\n`);
  });

  console.log('💡 Pro tip: Use "random" to generate diverse data for comprehensive chart testing.');
}

// Handle command line execution
if (require.main === module) {
  generateAndSendDemoData().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
}

export { generateDemoReport, generateAndSendDemoData, DEMO_SCENARIOS };
