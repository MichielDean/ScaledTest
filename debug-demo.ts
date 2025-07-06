import logger from './src/logging/logger.js';

const debugLogger = logger.child({ module: 'debug-demo' });

debugLogger.info('Starting debug demo script');

try {
  // Check if the generateAndSendDemoData function exists
  const { generateAndSendDemoData } = await import('./scripts/generate-demo-data.js');

  debugLogger.info('Successfully imported generateAndSendDemoData function');

  // Try to run it
  await generateAndSendDemoData();

  debugLogger.info('Demo data generation completed');
} catch (error) {
  debugLogger.error('Error in demo data generation', {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    details: error,
  });

  // If it's an axios error, log the response details
  if (error && typeof error === 'object' && 'response' in error) {
    const axiosError = error as any;
    debugLogger.error('HTTP Response Details', {
      status: axiosError.response?.status,
      statusText: axiosError.response?.statusText,
      data: axiosError.response?.data,
      headers: axiosError.response?.headers,
    });
  }
}
