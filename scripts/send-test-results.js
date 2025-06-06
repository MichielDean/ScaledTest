const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { env } = require('./utils/env.js');

/**
 * Get authentication token for API requests
 */
async function getAuthToken() {
  const keycloakConfigPath = path.join(process.cwd(), 'public', 'keycloak.json');

  if (!fs.existsSync(keycloakConfigPath)) {
    console.warn(
      '⚠️  Keycloak configuration not found. Attempting to send without authentication.'
    );
    return null;
  }

  try {
    const keycloakConfig = JSON.parse(fs.readFileSync(keycloakConfigPath, 'utf8'));
    const tokenUrl = `${keycloakConfig['auth-server-url']}/realms/${keycloakConfig.realm}/protocol/openid-connect/token`;

    // Use test credentials or environment variables
    const username = process.env.TEST_API_USERNAME || 'maintainer@example.com';
    const password = process.env.TEST_API_PASSWORD || 'password';

    const response = await axios.post(
      tokenUrl,
      new URLSearchParams({
        grant_type: 'password',
        client_id: keycloakConfig.resource,
        username,
        password,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 10000,
      }
    );

    return response.data.access_token;
  } catch (error) {
    console.warn('⚠️  Failed to get authentication token:', error.message);
    console.warn('Attempting to send test results without authentication...');
    return null;
  }
}

/**
 * Enhances CTRF report with additional environment information
 */
function enhanceReport(reportData) {
  const enhanced = { ...reportData };

  // Ensure required CTRF root fields are present
  enhanced.reportFormat = enhanced.reportFormat || 'CTRF';
  enhanced.specVersion = enhanced.specVersion || '1.0.0';

  // Add environment information if not present
  if (!enhanced.results.environment) {
    enhanced.results.environment = {};
  }

  // Add additional metadata
  enhanced.results.environment = {
    ...enhanced.results.environment,
    reportName: enhanced.results.environment.reportName || 'Jest Test Results',
    appName: enhanced.results.environment.appName || 'ScaledTest',
    appVersion: enhanced.results.environment.appVersion || '1.0.0',
    buildName: enhanced.results.environment.buildName || 'Local Development',
    osPlatform: process.platform,
    osRelease: require('os').release(),
    osVersion: require('os').version(),
    testEnvironment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    timestamp: new Date().toISOString(),
    extra: {
      ...enhanced.results.environment.extra,
      sentViaScript: true,
      scriptVersion: '1.0.0',
    },
  };

  // Add a unique report ID if not present
  if (!enhanced.reportId) {
    enhanced.reportId = require('crypto').randomUUID();
  }

  // Add timestamp if not present
  if (!enhanced.timestamp) {
    enhanced.timestamp = new Date().toISOString();
  }

  // Add generatedBy if not present in results.tool
  if (!enhanced.results.tool.generatedBy) {
    enhanced.results.tool.generatedBy = 'jest-ctrf-json-reporter';
  }

  return enhanced;
}

/**
 * Sends CTRF test results to the application's API
 */
async function sendTestResults() {
  const ctrfReportPath = path.join(process.cwd(), 'ctrf-report.json');

  // Check if the CTRF report exists
  if (!fs.existsSync(ctrfReportPath)) {
    console.error('❌ CTRF report not found at:', ctrfReportPath);
    console.error(
      'Make sure tests have been run and the jest-ctrf-json-reporter has generated the report.'
    );
    process.exit(1);
  }

  try {
    // Read and enhance the CTRF report
    const reportData = JSON.parse(fs.readFileSync(ctrfReportPath, 'utf8'));
    const enhancedReport = enhanceReport(reportData);

    console.log('📊 Preparing to send test results to API...');
    console.log(`Report ID: ${enhancedReport.reportId}`);
    console.log(`Report contains ${enhancedReport.results.summary.tests} tests`);
    console.log(`✅ Passed: ${enhancedReport.results.summary.passed}`);
    console.log(`❌ Failed: ${enhancedReport.results.summary.failed}`);
    console.log(`⏭️ Skipped: ${enhancedReport.results.summary.skipped}`);

    if (enhancedReport.results.summary.pending > 0) {
      console.log(`⏳ Pending: ${enhancedReport.results.summary.pending}`);
    }

    // Get authentication token
    const authToken = await getAuthToken();

    // Prepare request headers
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'ScaledTest-CTRF-Reporter/1.0.0',
    };

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
      console.log('🔐 Using authentication token');
    } else {
      console.log('🔓 Sending without authentication');
    }

    // Get the API base URL from environment
    const apiBaseUrl =
      process.env.NEXT_PUBLIC_API_URL || process.env.API_BASE_URL || 'http://localhost:3000';
    const apiUrl = `${apiBaseUrl}/api/test-reports`;

    console.log(`🚀 Sending to: ${apiUrl}`);

    // Send the report to the API
    const response = await axios.post(apiUrl, enhancedReport, {
      headers,
      timeout: 30000, // 30 second timeout
      validateStatus: status => status < 500, // Don't throw on 4xx errors
    });

    if (response.status === 200 || response.status === 201) {
      console.log('✅ Test results successfully sent to API');
      if (response.data) {
        console.log(
          '📋 API Response:',
          typeof response.data === 'object' ? JSON.stringify(response.data, null, 2) : response.data
        );
      }

      // Optionally clean up the report file
      if (process.env.CLEANUP_CTRF_REPORT === 'true') {
        fs.unlinkSync(ctrfReportPath);
        console.log('🧹 Cleaned up CTRF report file');
      }
    } else {
      console.error(`❌ API returned status ${response.status}`);
      if (response.data) {
        console.error(
          '📋 Response data:',
          typeof response.data === 'object' ? JSON.stringify(response.data, null, 2) : response.data
        );
      }
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Failed to send test results to API:');

    if (error.response) {
      // The request was made and the server responded with a status code
      console.error(`Status: ${error.response.status} ${error.response.statusText}`);
      if (error.response.data) {
        console.error(
          'Response data:',
          typeof error.response.data === 'object'
            ? JSON.stringify(error.response.data, null, 2)
            : error.response.data
        );
      }
    } else if (error.request) {
      // The request was made but no response was received
      console.error('❌ No response received from API server');
      console.error('🔍 Check if the API server is running and accessible');
      console.error(
        '🌐 API URL:',
        process.env.NEXT_PUBLIC_API_URL || process.env.API_BASE_URL || 'http://localhost:3000'
      );
    } else {
      // Something happened in setting up the request
      console.error('Request setup error:', error.message);
    }

    // Show troubleshooting tips
    console.error('\n🔧 Troubleshooting tips:');
    console.error('1. Make sure your application server is running');
    console.error('2. Verify the API_BASE_URL or NEXT_PUBLIC_API_URL environment variable');
    console.error('3. Check authentication credentials (TEST_API_USERNAME, TEST_API_PASSWORD)');
    console.error('4. Ensure the /api/test-reports endpoint is accessible');

    process.exit(1);
  }
}

// Handle command line execution
if (require.main === module) {
  sendTestResults().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = { sendTestResults };
