# Demo Data Generator for CTRF Reports

This script generates realistic test result data for demonstrating and testing the visualization capabilities of your CTRF dashboard.

## Quick Start

```bash
# Generate 1 random report
npm run demo-data

# Generate 5 random reports with varied scenarios
npm run demo-data random 5

# Generate specific scenario reports
npm run demo-data improving 3
npm run demo-data flaky 2
npm run demo-data large 1
```

## Available Scenarios

### `random` (Recommended)

Generates a mix of different scenarios with varied:

- Test tools (Jest, Playwright, Cypress, Vitest)
- Environments (development, staging, production, ci, enterprise)
- Performance characteristics (fast, normal, slow, very_slow)
- Time distributions (reports from different times)

### `improving`

Shows gradual improvement in test quality over time:

- **Tool**: Jest
- **Environment**: development
- **Pattern**: Starts with ~30% failure rate, improves to ~5%
- **Use case**: Demonstrating test suite maturation

### `declining`

Shows declining test quality (regression scenario):

- **Tool**: Playwright
- **Environment**: staging
- **Pattern**: Starts with ~5% failure rate, degrades to ~40%
- **Use case**: Identifying quality regression trends

### `stable`

Shows consistent high performance:

- **Tool**: Cypress
- **Environment**: production
- **Pattern**: Consistently ~5% failure rate, ~2% skip rate
- **Use case**: Production-ready stable test suites

### `flaky`

Shows inconsistent results with high variability:

- **Tool**: Vitest
- **Environment**: ci
- **Pattern**: Some tests fail 60% of the time, others are stable
- **Use case**: Identifying unreliable tests

### `large`

Shows large-scale enterprise testing:

- **Tool**: Jest
- **Environment**: enterprise
- **Pattern**: Mixed performance across different test suites
- **Use case**: Enterprise-scale test management

## Generated Data Features

### Test Types Distribution

- **Unit Tests**: 50% - Fast, focused tests (10-500ms)
- **Integration Tests**: 30% - Component interaction tests (100-5000ms)
- **E2E Tests**: 15% - Full user journey tests (1-30 seconds)
- **Accessibility Tests**: 5% - WCAG compliance tests (500-8000ms)

### Realistic Test Names

Generated test names reflect real-world scenarios:

- Unit: "User Authentication Service", "Password Validation Logic"
- Integration: "Payment Processing Pipeline", "Email Notification Service"
- E2E: "Complete User Journey", "Cross-browser Compatibility"
- Accessibility: "Screen Reader Compatibility", "WCAG 2.1 Compliance"

### Performance Profiles

- **Fast**: Tests run 50% faster than normal
- **Normal**: Baseline performance
- **Slow**: Tests run 2x slower (performance issues)
- **Very Slow**: Tests run 4x slower (serious performance problems)

### Error Messages

Realistic error messages for failed tests:

- Unit: "AssertionError: Expected true but received false"
- Integration: "ConnectionError: Failed to connect to database"
- E2E: "ElementNotFoundError: Could not locate element"
- Accessibility: "ContrastError: Text contrast ratio below 4.5:1"

## Chart Visualization Benefits

### Test Trends Chart

- **Time Series Data**: Reports spread across different time periods
- **Pass Rate Trends**: Shows improvement/degradation over time
- **Volume Analysis**: Different test counts show scale variations

### Test Duration Analysis

- **Performance Categories**: Distribution across speed categories
- **Performance Regression**: Slow vs normal vs fast test identification
- **Suite Optimization**: Identifies slow test suites

### Test Suite Overview

- **Suite Distribution**: Different test types and their performance
- **Failure Pattern Analysis**: Which suites are problematic
- **Environment Comparison**: Performance across different environments

### Flaky Test Detection

- **Retry Patterns**: Tests that fail and get retried
- **Inconsistency Identification**: Tests with varying results
- **Reliability Metrics**: Pass rate consistency over time

## Advanced Usage

### Custom Time Ranges

```bash
# Generate historical data (reports from 1-7 days ago)
npm run demo-data random 10
```

### Testing Specific Scenarios

```bash
# Test improving trend visualization
npm run demo-data improving 7

# Test flaky test detection
npm run demo-data flaky 5

# Test large-scale enterprise view
npm run demo-data large 3
```

### Development Workflow

1. **Clear existing data** (if needed)
2. **Generate baseline**: `npm run demo-data stable 3`
3. **Add variety**: `npm run demo-data random 10`
4. **Test specific features**: `npm run demo-data flaky 2`
5. **View dashboard** to see visualizations

## Data Points for Testing

The demo data generator creates interesting scenarios for testing:

### 📈 Trend Analysis

- Progressive improvement over time
- Quality regression detection
- Seasonal patterns (if generating over longer periods)

### 📊 Distribution Analysis

- Different test suite sizes (20-100 tests)
- Various failure rates (2%-60%)
- Performance distribution across categories

### 🔍 Anomaly Detection

- Flaky test identification
- Performance regression detection
- Environment-specific issues

### 📋 Enterprise Scenarios

- Multiple test tools comparison
- Cross-environment analysis
- Scale testing (large test suites)

## Integration with Existing Workflow

The demo data script reuses the existing `send-test-results.js` infrastructure:

- Same authentication mechanism
- Same API endpoints
- Same data enhancement logic
- Compatible with existing dashboard

## Troubleshooting

### No Data Appearing

1. Check if the application server is running
2. Verify API authentication (TEST_API_USERNAME, TEST_API_PASSWORD)
3. Ensure OpenSearch is connected and indexing

### Performance Issues

- Reduce the number of reports generated at once
- Use smaller test counts for initial testing
- Generate reports with delays between requests

## Best Practices

1. **Start Small**: Generate 1-2 reports first to verify setup
2. **Use Random**: Random scenario provides the most comprehensive testing
3. **Mix Scenarios**: Combine different scenarios for realistic data
4. **Time Distribution**: Generate reports over different time periods
5. **Clean Slate**: Clear old demo data periodically for fresh testing
