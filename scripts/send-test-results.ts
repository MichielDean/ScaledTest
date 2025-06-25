import fs from 'fs';
import path from 'path';
import axios, { AxiosResponse, AxiosError } from 'axios';
import os from 'os';
import crypto from 'crypto';
import logger, { logError } from '../src/logging/logger.js';
import { CtrfSchema } from '../src/schemas/ctrf/ctrf.js';
import { keycloakConfig } from '../src/config/keycloak.js';

// Create a script-specific logger
const scriptLogger = logger.child({ module: 'send-test-results' });

// Type definitions
interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

/**
 * Get authentication token for API requests
 */
async function getAuthToken(): Promise<string | null> {
  try {
    const tokenUrl = `${keycloakConfig.url}/realms/${keycloakConfig.realm}/protocol/openid-connect/token`;

    // Use test credentials or environment variables
    const username = process.env.TEST_API_USERNAME || 'maintainer@example.com';
    const password = process.env.TEST_API_PASSWORD || 'password';

    const response: AxiosResponse<TokenResponse> = await axios.post(
      tokenUrl,
      new URLSearchParams({
        grant_type: 'password',
        client_id: keycloakConfig.clientId,
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
    logError(scriptLogger, 'Failed to get authentication token', error);
    scriptLogger.warn('Attempting to send test results without authentication...');
    return null;
  }
}

/**
 * Enhances CTRF report with additional environment information
 */
function enhanceReport(reportData: CtrfSchema): CtrfSchema {
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
    osRelease: os.release(),
    osVersion: os.version(),
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
    enhanced.reportId = crypto.randomUUID();
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
async function sendTestResults(customReportData: CtrfSchema | null = null): Promise<void> {
  let reportData: CtrfSchema;
  let ctrfReportPath: string | null = null;

  if (customReportData) {
    // Use provided custom data
    reportData = customReportData;
    scriptLogger.info('Using provided demo data for test results');
  } else {
    // Read from file as before
    ctrfReportPath = path.join(process.cwd(), 'ctrf-report.json');

    // Check if the CTRF report exists
    if (!fs.existsSync(ctrfReportPath)) {
      scriptLogger.error('CTRF report not found', {
        reportPath: ctrfReportPath,
        suggestion:
          'Make sure tests have been run and the jest-ctrf-json-reporter has generated the report.',
      });
      process.exit(1);
    }

    // Read and enhance the CTRF report
    reportData = JSON.parse(fs.readFileSync(ctrfReportPath, 'utf8')) as CtrfSchema;
  }

  try {
    const enhancedReport = enhanceReport(reportData);

    scriptLogger.info('Preparing to send test results to API', {
      reportId: enhancedReport.reportId,
      testCount: enhancedReport.results.summary.tests,
      passed: enhancedReport.results.summary.passed,
      failed: enhancedReport.results.summary.failed,
      skipped: enhancedReport.results.summary.skipped,
      pending: enhancedReport.results.summary.pending,
    });

    // Get authentication token
    const authToken = await getAuthToken();

    // Prepare request headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'ScaledTest-CTRF-Reporter/1.0.0',
    };

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
      scriptLogger.info('Using authentication token for API request');
    } else {
      scriptLogger.info('Sending request without authentication');
    }

    // Get the API base URL from environment
    const apiBaseUrl =
      process.env.NEXT_PUBLIC_API_URL || process.env.API_BASE_URL || 'http://localhost:3000';
    const apiUrl = `${apiBaseUrl}/api/test-reports`;

    scriptLogger.info('Sending test results to API', { apiUrl });

    const response = await axios.post(apiUrl, enhancedReport, {
      headers,
      timeout: 30000, // 30 second timeout
      validateStatus: status => status < 500, // Don't throw on 4xx errors
    });

    if (response.status === 200 || response.status === 201) {
      scriptLogger.info('Test results successfully sent to API', {
        status: response.status,
        responseData: response.data,
      });

      // Optionally clean up the report file
      if (process.env.CLEANUP_CTRF_REPORT === 'true' && ctrfReportPath) {
        fs.unlinkSync(ctrfReportPath);
        scriptLogger.info('Cleaned up CTRF report file', { reportPath: ctrfReportPath });
      }
    } else {
      scriptLogger.error('API returned error status', {
        status: response.status,
        responseData: response.data,
      });
      process.exit(1);
    }
  } catch (error) {
    logError(scriptLogger, 'Failed to send test results to API', error);

    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as AxiosError;
      if (axiosError.response) {
        scriptLogger.error('API response error details', {
          status: axiosError.response.status,
          statusText: axiosError.response.statusText,
          data: axiosError.response.data,
        });
      }
    }

    if (error && typeof error === 'object' && 'request' in error && !('response' in error)) {
      const apiBaseUrl =
        process.env.NEXT_PUBLIC_API_URL || process.env.API_BASE_URL || 'http://localhost:3000';
      scriptLogger.error('No response received from API server', {
        apiUrl: apiBaseUrl,
        suggestion: 'Check if the API server is running and accessible',
      });
    }

    // Show troubleshooting tips
    scriptLogger.error('Troubleshooting suggestions', {
      tips: [
        'Make sure your application server is running',
        'Verify the API_BASE_URL or NEXT_PUBLIC_API_URL environment variable',
        'Check authentication credentials (TEST_API_USERNAME, TEST_API_PASSWORD)',
        'Ensure the /api/test-reports endpoint is accessible',
      ],
    });

    process.exit(1);
  }
}

// Handle command line execution
if (import.meta.url === `file://${process.argv[1]}`) {
  sendTestResults().catch((error: unknown) => {
    logError(scriptLogger, 'Unhandled error in send-test-results script', error);
    process.exit(1);
  });
}

export { sendTestResults, enhanceReport };
