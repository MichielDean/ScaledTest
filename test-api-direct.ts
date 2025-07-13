#!/usr/bin/env node

/**
 * Test the actual API endpoint to see what it returns
 */

// Set up environment
(async () => {
  process.env.OPENSEARCH_HOST = 'http://localhost:9200';
  process.env.OPENSEARCH_USERNAME = 'admin';
  process.env.OPENSEARCH_PASSWORD = 'admin';
  process.env.OPENSEARCH_SSL_VERIFY = 'false';

  const { getAuthToken } = await import('./tests/authentication/tokenService.js');

  try {
    // Get a token for testing
    const token = await getAuthToken('readonly@example.com', 'password');
    console.log('Got token for readonly user');

    // Call the API
    const response = await fetch('http://localhost:3002/api/test-reports?size=5', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      console.error('API call failed:', response.status, response.statusText);
      const text = await response.text();
      console.error('Response:', text);
      process.exit(1);
    }

    const result = await response.json();
    console.log('\n=== API Response ===');
    console.log('Success:', result.success);
    console.log('Total:', result.total);
    console.log('Data length:', result.data.length);

    result.data.forEach((report: any, index: number) => {
      console.log(`\n--- Report ${index + 1} ---`);
      console.log('ID:', report._id);
      console.log('Metadata:', JSON.stringify(report.metadata, null, 2));
      console.log('Tool:', report.results?.tool?.name);
      console.log('Environment:', report.results?.environment?.testEnvironment);
    });

    // Filter demo data like the test does
    const demoReports = result.data.filter(
      (report: any) =>
        report?.metadata?.isDemoData === true ||
        (Array.isArray(report?.metadata?.userTeams) &&
          report.metadata.userTeams.includes('demo-data'))
    );

    console.log('\n=== Demo Data Analysis ===');
    console.log('Demo reports found:', demoReports.length);
    demoReports.forEach((report: any, index: number) => {
      console.log(`Demo Report ${index + 1}:`, report._id, report.metadata);
    });
  } catch (error) {
    const err = error as Error;
    console.error('Error:', err.message);
    console.error('Stack:', err.stack);
  }

  process.exit(0);
})();
