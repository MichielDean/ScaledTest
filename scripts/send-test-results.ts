import fs from 'fs';
import path from 'path';
import axios, { AxiosError, AxiosResponse } from 'axios';
import crypto from 'crypto';
import os from 'os';
import logger from '../src/utils/logger';

// Create a dedicated logger for test scripts
const testLogger = logger.child({ module: 'test-scripts' });

// Import the required environment utilities
import { getRequiredEnvVar, getOptionalEnvVarOrUndefined } from './utils/env';

// Define TypeScript interfaces for better type safety
interface CTRFSummary {
  tests: number;
  passed: number;
  failed: number;
  skipped: number;
  pending?: number;
  errors?: number;
  duration?: number;
}

interface CTRFTool {
  name: string;
  version?: string;
  generatedBy?: string;
}

interface CTRFEnvironment {
  reportName?: string;
  appName?: string;
  appVersion?: string;
  buildName?: string;
  testEnvironment?: string;
  osPlatform?: string;
  osRelease?: string;
  osVersion?: string;
  nodeVersion?: string;
  timestamp?: string;
  extra?: Record<string, unknown>;
}

interface CTRFResults {
  summary: CTRFSummary;
  tool: CTRFTool;
  environment?: CTRFEnvironment;
  suites?: unknown[];
}

interface CTRFReport {
  reportFormat: string;
  specVersion: string;
  reportId?: string;
  timestamp?: string;
  results: CTRFResults;
}

/**
 * Get authentication token for API requests
 */
async function getAuthToken(): Promise<string | null> {
  const keycloakConfigPath = path.join(process.cwd(), 'public', 'keycloak.json');

  if (!fs.existsSync(keycloakConfigPath)) {
    testLogger.warn('Keycloak configuration not found. Attempting to send without authentication.');
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
    testLogger.warn('Failed to get authentication token:', { error });
    testLogger.warn('Attempting to send test results without authentication...');
    return null;
  }
}

/**
 * Enhances CTRF report with additional environment information
 */
function enhanceReport(reportData: CTRFReport): CTRFReport {
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
    reportName: enhanced.results.environment?.reportName || 'Jest Test Results',
    appName: enhanced.results.environment?.appName || 'ScaledTest',
    appVersion: enhanced.results.environment?.appVersion || '1.0.0',
    buildName: enhanced.results.environment?.buildName || 'Local Development',
    osPlatform: process.platform,
    osRelease: os.release(),
    osVersion: os.version ? os.version() : 'unknown',
    testEnvironment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    timestamp: new Date().toISOString(),
    extra: {
      ...(enhanced.results.environment?.extra || {}),
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
 * @param customReportData - Optional custom report data to send instead of reading from file
 */
async function sendTestResults(customReportData: CTRFReport | null = null): Promise<void> {
  let reportData: CTRFReport;
  let ctrfReportPath = '';

  if (customReportData) {
    // Use provided custom data
    reportData = customReportData;
    testLogger.info('Using provided demo data...');
  } else {
    // Read from file as before
    ctrfReportPath = path.join(process.cwd(), 'ctrf-report.json');

    // Check if the CTRF report exists
    if (!fs.existsSync(ctrfReportPath)) {
      testLogger.error('CTRF report not found at:', { path: ctrfReportPath });
      testLogger.error(
        'Make sure tests have been run and the jest-ctrf-json-reporter has generated the report.'
      );
      process.exit(1);
    }

    // Read and enhance the CTRF report
    reportData = JSON.parse(fs.readFileSync(ctrfReportPath, 'utf8'));
  }

  try {
    const enhancedReport = enhanceReport(reportData);

    testLogger.info('Preparing to send test results to API...', {
      reportId: enhancedReport.reportId,
      tests: enhancedReport.results.summary.tests,
      passed: enhancedReport.results.summary.passed,
      failed: enhancedReport.results.summary.failed,
      skipped: enhancedReport.results.summary.skipped,
      pending: enhancedReport.results.summary.pending || 0,
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
      testLogger.info('Using authentication token');
    } else {
      testLogger.info('Sending without authentication');
    }

    // Get the API base URL from environment
    const apiBaseUrl =
      process.env.NEXT_PUBLIC_API_URL || process.env.API_BASE_URL || 'http://localhost:3000';
    const apiUrl = `${apiBaseUrl}/api/test-reports`;

    testLogger.info(`Sending to: ${apiUrl}`);

    const response = await axios.post(apiUrl, enhancedReport, {
      headers,
      timeout: 30000, // 30 second timeout
      validateStatus: status => status < 500, // Don't throw on 4xx errors
    });

    if (response.status === 200 || response.status === 201) {
      testLogger.info('Test results successfully sent to API', {
        response: typeof response.data === 'object' ? response.data : { data: response.data },
      });

      // Optionally clean up the report file
      if (process.env.CLEANUP_CTRF_REPORT === 'true' && ctrfReportPath) {
        fs.unlinkSync(ctrfReportPath);
        testLogger.info('Cleaned up CTRF report file');
      }
    } else {
      testLogger.error(`API returned status ${response.status}`, {
        response: typeof response.data === 'object' ? response.data : { data: response.data },
      });
      process.exit(1);
    }
  } catch (error) {
    const axiosError = error as AxiosError;

    if (axiosError.response) {
      // The request was made and the server responded with a status code
      testLogger.error(`Status: ${axiosError.response.status}`, {
        statusText: axiosError.response.statusText,
        data: axiosError.response.data,
      });
    } else if (axiosError.request) {
      // The request was made but no response was received
      testLogger.error('No response received from API server', {
        apiUrl:
          process.env.NEXT_PUBLIC_API_URL || process.env.API_BASE_URL || 'http://localhost:3000',
      });
    } else {
      // Something happened in setting up the request
      testLogger.error('Request setup error:', { error });
    }

    // Show troubleshooting tips
    testLogger.error('Troubleshooting tips:');
    testLogger.error('1. Make sure your application server is running');
    testLogger.error('2. Verify the API_BASE_URL or NEXT_PUBLIC_API_URL environment variable');
    testLogger.error('3. Check authentication credentials (TEST_API_USERNAME, TEST_API_PASSWORD)');
    testLogger.error('4. Ensure the /api/test-reports endpoint is accessible');

    process.exit(1);
  }
}

// Handle command line execution
if (require.main === module) {
  sendTestResults().catch(error => {
    testLogger.error('Unhandled error:', { error });
    process.exit(1);
  });
}

export { sendTestResults, enhanceReport };
