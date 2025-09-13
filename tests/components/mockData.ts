import { TestTrendsData } from '../../src/types/dashboard';

/**
 * Generate mock test trends data for testing
 */
export const generateMockTestTrendsData = (days: number = 7): TestTrendsData[] => {
  const data: TestTrendsData[] = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);

    // Generate realistic test data with some variation
    const total = 50 + Math.floor(Math.random() * 50); // 50-100 tests
    const passed = Math.floor(total * (0.7 + Math.random() * 0.25)); // 70-95% pass rate
    const failed = Math.floor((total - passed) * (0.6 + Math.random() * 0.4)); // 60-100% of remaining
    const skipped = total - passed - failed;
    const passRate = Math.round((passed / total) * 100);

    data.push({
      date:
        date.toISOString().split('T')[0] +
        ' ' +
        String(Math.floor(Math.random() * 24)).padStart(2, '0') +
        ':00', // YYYY-MM-DD HH:MM format for hourly data
      total,
      passed,
      failed,
      skipped,
      passRate,
      failRate: Math.round((failed / total) * 100),
      skipRate: Math.round((skipped / total) * 100),
    });
  }

  return data;
};

/**
 * Generate empty test trends data
 */
export const generateEmptyTestTrendsData = (): TestTrendsData[] => {
  return [];
};

/**
 * Generate single data point for testing edge cases
 */
export const generateSingleDataPoint = (): TestTrendsData[] => {
  return [
    {
      date: '2024-01-15 14:00',
      total: 75,
      passed: 65,
      failed: 8,
      skipped: 2,
      passRate: 87,
      failRate: 11,
      skipRate: 3,
    },
  ];
};

/**
 * Generate test trends data with zero values
 */
export const generateZeroValueData = (): TestTrendsData[] => {
  return [
    {
      date: '2024-01-15 09:00',
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      passRate: 0,
      failRate: 0,
      skipRate: 0,
    },
    {
      date: '2024-01-16 10:00',
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      passRate: 0,
      failRate: 0,
      skipRate: 0,
    },
  ];
};

/**
 * Generate test trends data with perfect pass rate
 */
export const generatePerfectPassRateData = (): TestTrendsData[] => {
  return [
    {
      date: '2024-01-15 11:00',
      total: 50,
      passed: 50,
      failed: 0,
      skipped: 0,
      passRate: 100,
      failRate: 0,
      skipRate: 0,
    },
    {
      date: '2024-01-16 13:30',
      total: 60,
      passed: 60,
      failed: 0,
      skipped: 0,
      passRate: 100,
      failRate: 0,
      skipRate: 0,
    },
  ];
};

/**
 * Generate test trends data with varying patterns for different scenarios
 */
export const generateVariedTestTrendsData = (): TestTrendsData[] => {
  return [
    {
      date: '2024-01-10 09:00',
      total: 45,
      passed: 35,
      failed: 8,
      skipped: 2,
      passRate: 78,
      failRate: 18,
      skipRate: 4,
    },
    {
      date: '2024-01-10 15:30',
      total: 52,
      passed: 47,
      failed: 3,
      skipped: 2,
      passRate: 90,
      failRate: 6,
      skipRate: 4,
    },
    {
      date: '2024-01-11 10:15',
      total: 48,
      passed: 40,
      failed: 6,
      skipped: 2,
      passRate: 83,
      failRate: 13,
      skipRate: 4,
    },
    {
      date: '2024-01-11 16:45',
      total: 55,
      passed: 50,
      failed: 4,
      skipped: 1,
      passRate: 91,
      failRate: 7,
      skipRate: 2,
    },
    {
      date: '2024-01-12 11:20',
      total: 50,
      passed: 45,
      failed: 3,
      skipped: 2,
      passRate: 90,
      failRate: 6,
      skipRate: 4,
    },
  ];
};

/**
 * Mock successful API response
 */
export const mockSuccessfulApiResponse = <T>(data: T[]) => ({
  success: true,
  data,
  meta: {
    source: 'TimescaleDB',
    database: 'scaledtest',
    daysRequested: data.length > 0 ? data.length : 30,
    timestamp: new Date().toISOString(),
    databaseHealth: {
      connected: true,
      tableExists: true,
      recordsCount: 150,
      status: 'healthy',
    },
  },
});

/**
 * Mock API error response
 */
export const mockApiErrorResponse = (error: string = 'Database connection failed') => ({
  success: false,
  error,
});

/**
 * Mock loading response (for fetch mock)
 */
export const mockLoadingResponse = () =>
  new Promise(resolve => {
    setTimeout(() => resolve({ ok: true, json: () => mockSuccessfulApiResponse([]) }), 100);
  });

/**
 * Mock network error (for fetch mock)
 */
export const mockNetworkError = () => Promise.reject(new Error('Network error: Failed to fetch'));
