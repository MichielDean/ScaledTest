import {
  generateCtrfReport,
  generateMinimalCtrfReport,
  generateInvalidCtrfReport,
  generateLargeCtrfReport,
} from '../data/ctrfReportGenerator';
import { TestUsers } from '../ui/models/TestUsers';
import { testLogger } from '../../src/logging/logger';
import { Status } from '../../src/schemas/ctrf/ctrf';
import { StoredReport } from '../../src/types/database';
import supertest from 'supertest';

describe('CTRF Reports API System Tests', () => {
  let api: ReturnType<typeof supertest.agent>;
  const TEST_PORT = process.env.TEST_PORT || '3000';
  const API_URL = `http://localhost:${TEST_PORT}`;

  beforeAll(async () => {
    try {
      // Create authenticated supertest agent and sign in using shared TestUsers
      api = supertest.agent(API_URL);
      const authRes = await api.post('/api/auth/sign-in/email').send({
        email: TestUsers.ADMIN.email,
        password: TestUsers.ADMIN.password,
      });

      testLogger.debug(
        { status: authRes.status, body: authRes.body },
        'Sign-in response for CTRF tests'
      );

      if (authRes.status !== 200) {
        testLogger.error(
          { status: authRes.status, body: authRes.body },
          'Failed to authenticate test admin'
        );
        throw new Error(`Failed to authenticate test admin: ${authRes.status}`);
      }

      testLogger.debug('Successfully created authenticated agent for CTRF tests');
    } catch (error) {
      testLogger.error({ error }, 'Failed to create authenticated agent in beforeAll:');
      throw error;
    }
  }, 30000);

  describe('CTRF Report Storage', () => {
    it('should store a complete CTRF report successfully', async () => {
      // Re-authenticate just before the test to ensure fresh session
      const reAuthResponse = await api.post('/api/auth/sign-in/email').send({
        email: TestUsers.ADMIN.email,
        password: TestUsers.ADMIN.password,
      });

      testLogger.info(
        {
          status: reAuthResponse.status,
          body: reAuthResponse.body,
          cookies: reAuthResponse.headers['set-cookie'],
        },
        'Re-authentication response:'
      );

      expect(reAuthResponse.status).toBe(200);

      // Now verify that our authenticated agent actually works
      const sessionResponse = await api.get('/api/auth/get-session');
      testLogger.info(
        {
          status: sessionResponse.status,
          body: sessionResponse.body,
          headers: sessionResponse.headers,
          user: sessionResponse.body?.user?.email || 'No user',
          session: sessionResponse.body?.session?.id || 'No session',
        },
        'Session check response:'
      );

      if (sessionResponse.status !== 200 || !sessionResponse.body) {
        testLogger.error(
          {
            status: sessionResponse.status,
            body: sessionResponse.body,
          },
          'Session check failed - no valid session:'
        );
        throw new Error(
          `Authentication session not valid: status ${sessionResponse.status}, body: ${JSON.stringify(sessionResponse.body)}`
        );
      }

      const ctrfReport = generateCtrfReport();

      const response = await api.post('/api/test-reports').send(ctrfReport).expect(201);

      expect(response.body).toMatchObject({
        success: true,
        id: expect.any(String),
        message: expect.stringContaining('successfully'),
        summary: {
          tests: ctrfReport.results.summary.tests,
          passed: ctrfReport.results.summary.passed,
          failed: ctrfReport.results.summary.failed,
          skipped: ctrfReport.results.summary.skipped,
          pending: ctrfReport.results.summary.pending,
          other: ctrfReport.results.summary.other,
        },
      });

      expect(response.body.id).toBe(ctrfReport.reportId);
    });

    it('should store a minimal CTRF report', async () => {
      const minimalReport = generateMinimalCtrfReport();

      const response = await api
        .post('/api/test-reports')

        .send(minimalReport)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        id: expect.any(String),
        message: expect.stringContaining('successfully'),
        summary: {
          tests: 1,
          passed: 1,
          failed: 0,
          skipped: 0,
          pending: 0,
          other: 0,
        },
      });
    });

    it('should auto-generate missing reportId and timestamp', async () => {
      const reportWithoutMeta = generateCtrfReport();
      delete reportWithoutMeta.reportId;
      delete reportWithoutMeta.timestamp;

      const response = await api
        .post('/api/test-reports')

        .send(reportWithoutMeta)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        id: expect.any(String),
        message: expect.stringContaining('successfully'),
      });

      expect(response.body.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('should handle reports with various test statuses', async () => {
      const multiStatusReport = generateCtrfReport({
        results: {
          tool: { name: 'MultiStatus Test' },
          summary: {
            tests: 5,
            passed: 1,
            failed: 2,
            skipped: 1,
            pending: 1,
            other: 0,
            start: Date.now() - 5000,
            stop: Date.now(),
          },
          tests: [
            {
              name: 'Passing test',
              status: Status.passed,
              duration: 100,
            },
            {
              name: 'Failing test 1',
              status: Status.failed,
              duration: 200,
              message: 'Assertion failed',
              trace: 'Error at line 10',
            },
            {
              name: 'Failing test 2',
              status: Status.failed,
              duration: 150,
              message: 'Network timeout',
            },
            {
              name: 'Skipped test',
              status: Status.skipped,
              duration: 0,
              message: 'Test environment not ready',
            },
            {
              name: 'Pending test',
              status: Status.pending,
              duration: 0,
              message: 'Feature not implemented',
            },
          ],
        },
      });

      const response = await api
        .post('/api/test-reports')

        .send(multiStatusReport)
        .expect(201);

      expect(response.body.summary).toEqual({
        tests: 5,
        passed: 1,
        failed: 2,
        skipped: 1,
        pending: 1,
        other: 0,
      });
    });

    it('should handle reports with rich test metadata', async () => {
      const richReport = generateCtrfReport({
        results: {
          tool: {
            name: 'Playwright',
            version: '1.40.0',
            extra: {
              browser: 'chromium',
              headless: true,
            },
          },
          summary: {
            tests: 2,
            passed: 1,
            failed: 1,
            skipped: 0,
            pending: 0,
            other: 0,
            start: Date.now() - 3000,
            stop: Date.now(),
          },
          tests: [
            {
              name: 'Login flow',
              status: Status.passed,
              duration: 1500,
              suite: 'Authentication',
              tags: ['e2e', 'critical'],
              browser: 'chromium',
              screenshot: 'screenshots/login-success.png',
              attachments: [
                {
                  name: 'screenshot',
                  contentType: 'image/png',
                  path: 'screenshots/login-success.png',
                },
                {
                  name: 'trace',
                  contentType: 'application/zip',
                  path: 'traces/login-trace.zip',
                },
              ],
              steps: [
                { name: 'Navigate to login', status: Status.passed },
                { name: 'Enter credentials', status: Status.passed },
                { name: 'Click login button', status: Status.passed },
              ],
            },
            {
              name: 'Profile update',
              status: Status.failed,
              duration: 2000,
              suite: 'User Management',
              tags: ['e2e', 'regression'],
              browser: 'chromium',
              message: 'Profile update failed',
              trace: 'TimeoutError: Locator.click: Timeout 30000ms exceeded',
              retries: 2,
              flaky: true,
              screenshot: 'screenshots/profile-failure.png',
            },
          ],
          environment: {
            appName: 'ScaledTest',
            appVersion: '2.1.0',
            testEnvironment: 'staging',
            branchName: 'feature/user-profiles',
            buildNumber: 'build-456',
            buildUrl: 'https://github.com/example/scaledtest/actions/runs/456',
            repositoryName: 'ScaledTest',
            repositoryUrl: 'https://github.com/example/scaledtest',
            commit: 'def456abc789',
            osPlatform: 'linux',
            osRelease: '22.04',
          },
        },
        extra: {
          ciProvider: 'GitHub Actions',
          pullRequest: '789',
          testPlan: 'nightly-regression',
        },
      });

      const response = await api
        .post('/api/test-reports')

        .send(richReport)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        id: expect.any(String),
        message: expect.stringContaining('successfully'),
      });
    });
  });

  describe('CTRF Report Retrieval', () => {
    const storedReportIds: string[] = [];

    beforeAll(async () => {
      const reports = [
        generateCtrfReport({
          results: {
            tool: { name: 'Jest' },
            summary: {
              tests: 5,
              passed: 4,
              failed: 1,
              skipped: 0,
              pending: 0,
              other: 0,
              start: Date.now() - 5000,
              stop: Date.now() - 1000,
            },
            tests: [
              { name: 'Test 1', status: Status.passed, duration: 100 },
              { name: 'Test 2', status: Status.passed, duration: 150 },
              { name: 'Test 3', status: Status.failed, duration: 200, message: 'Failed' },
              { name: 'Test 4', status: Status.passed, duration: 120 },
              { name: 'Test 5', status: Status.passed, duration: 80 },
            ],
            environment: { testEnvironment: 'CI' },
          },
        }),
        generateCtrfReport({
          results: {
            tool: { name: 'Playwright' },
            summary: {
              tests: 3,
              passed: 2,
              failed: 0,
              skipped: 1,
              pending: 0,
              other: 0,
              start: Date.now() - 3000,
              stop: Date.now() - 500,
            },
            tests: [
              { name: 'E2E Test 1', status: Status.passed, duration: 1000 },
              { name: 'E2E Test 2', status: Status.passed, duration: 1200 },
              { name: 'E2E Test 3', status: Status.skipped, duration: 0 },
            ],
            environment: { testEnvironment: 'staging' },
          },
        }),
      ];

      for (const report of reports) {
        const response = await api
          .post('/api/test-reports')

          .send(report)
          .expect(201);
        storedReportIds.push(response.body.id);
      }
    });

    it('should retrieve all reports without filters', async () => {
      const response = await api.get('/api/test-reports').expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
        total: expect.any(Number),
      });

      expect(response.body.data.length).toBeGreaterThanOrEqual(2);
      expect(response.body.total).toBeGreaterThanOrEqual(2);

      const report = response.body.data[0];
      expect(report).toHaveProperty('_id');
      expect(report).toHaveProperty('storedAt');
      expect(report).toHaveProperty('reportFormat', 'CTRF');
      expect(report).toHaveProperty('results');
    });

    it('should filter reports by test status', async () => {
      const response = await api
        .get('/api/test-reports?status=failed')

        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
        total: expect.any(Number),
      });

      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should filter reports by tool name', async () => {
      const response = await api.get('/api/test-reports?tool=Jest').expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
        total: expect.any(Number),
      });

      if (response.body.data.length > 0) {
        expect(response.body.data[0].results.tool.name).toBe('Jest');
      }
    });

    it('should filter reports by environment', async () => {
      const response = await api
        .get('/api/test-reports?environment=CI')

        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
        total: expect.any(Number),
      });

      if (response.body.data.length > 0) {
        expect(response.body.data[0].results.environment?.testEnvironment).toBe('CI');
      }
    });

    it('should handle pagination', async () => {
      // Create two test reports with clearly different tool names and timestamps
      const now = new Date();
      const earlier = new Date(now.getTime() - 5000); // 5 seconds earlier

      const report1 = generateCtrfReport({}, earlier);
      const report2 = generateCtrfReport({}, now);

      // Override the tool names to make them clearly different
      report1.results.tool.name = 'PaginationTest1';
      report2.results.tool.name = 'PaginationTest2';

      // Ensure reports have different IDs, timestamps, and tool names
      expect(report1.reportId).not.toBe(report2.reportId);
      expect(report1.timestamp).not.toBe(report2.timestamp);
      expect(report1.results.tool.name).not.toBe(report2.results.tool.name);

      await api.post('/api/test-reports').send(report1).expect(201);
      await api.post('/api/test-reports').send(report2).expect(201);

      const page1Response = await api
        .get('/api/test-reports?page=1&size=1')

        .expect(200);

      expect(page1Response.body.data).toHaveLength(1);
      expect(page1Response.body.total).toBeGreaterThanOrEqual(2);

      const page2Response = await api
        .get('/api/test-reports?page=2&size=1')

        .expect(200);

      expect(page2Response.body.data).toHaveLength(1);

      // Check that we get different reports by comparing tool names and timestamps
      expect(page2Response.body.data[0].results.tool.name).not.toBe(
        page1Response.body.data[0].results.tool.name
      );
      expect(page2Response.body.data[0].timestamp).not.toBe(page1Response.body.data[0].timestamp);
    });
    it('should respect maximum page size limit', async () => {
      const response = await api.get('/api/test-reports?size=200').expect(200);

      expect(response.body.data.length).toBeLessThanOrEqual(100);
    });

    it('should combine multiple filters', async () => {
      const response = await api
        .get('/api/test-reports?tool=Jest&environment=CI')

        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
        total: expect.any(Number),
      });

      if (response.body.data.length > 0) {
        const report = response.body.data[0];
        expect(report.results.tool.name).toBe('Jest');
        expect(report.results.environment?.testEnvironment).toBe('CI');
      }
    });
  });

  describe('Error Handling', () => {
    it('should reject invalid CTRF reports', async () => {
      const invalidReport = generateInvalidCtrfReport();

      const response = await api
        .post('/api/test-reports')

        .send(invalidReport)
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: 'CTRF report validation failed',
        details: expect.any(Array),
      });

      expect(response.body.details.length).toBeGreaterThan(0);
    });

    it('should reject requests with missing required fields', async () => {
      // Case 1: Only reportFormat provided (missing specVersion and results)
      const missingAll = { reportFormat: 'CTRF' };
      const response1 = await api.post('/api/test-reports').send(missingAll).expect(400);

      expect(response1.body).toMatchObject({
        success: false,
        error: 'CTRF report validation failed',
        details: expect.any(Array),
      });
      // Should include errors for both specVersion and results
      type ZodErrorDetail = { path?: (string | number)[] };
      const errorFields1 = response1.body.details?.map((d: ZodErrorDetail) => d.path?.[0]);
      expect(errorFields1).toEqual(expect.arrayContaining(['specVersion', 'results']));

      // Case 2: reportFormat and specVersion provided (missing results)
      const missingResults = { reportFormat: 'CTRF', specVersion: '1.0.0' };
      const response2 = await api.post('/api/test-reports').send(missingResults).expect(400);

      expect(response2.body).toMatchObject({
        success: false,
        error: 'CTRF report validation failed',
        details: expect.any(Array),
      });
      // Should include error for missing results
      const errorFields2 = response2.body.details?.map((d: ZodErrorDetail) => d.path?.[0]);
      expect(errorFields2).toEqual(expect.arrayContaining(['results']));
    });

    it('should reject unsupported HTTP methods', async () => {
      const response = await api.delete('/api/test-reports').expect(405);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Method DELETE not allowed',
      });
    });

    it('should require authentication', async () => {
      const ctrfReport = generateCtrfReport();

      // Use a non-authenticated agent
      const unauthenticatedAgent = supertest(API_URL);
      await unauthenticatedAgent.post('/api/test-reports').send(ctrfReport).expect(401);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large CTRF reports', async () => {
      const largeReport = generateLargeCtrfReport(50);

      const startTime = Date.now();
      const response = await api
        .post('/api/test-reports')

        .send(largeReport)
        .expect(201);
      const endTime = Date.now();

      expect(response.body).toMatchObject({
        success: true,
        id: expect.any(String),
        summary: {
          tests: 50,
        },
      });

      expect(endTime - startTime).toBeLessThan(5000);
    }, 10000);

    it('should handle concurrent report submissions', async () => {
      const reports = Array.from({ length: 5 }, () => generateCtrfReport());
      // Deep clone each report before sending to avoid mutation/race issues
      const promises = reports.map(report =>
        api.post('/api/test-reports').send(JSON.parse(JSON.stringify(report)))
      );
      const responses = await Promise.all(promises);

      responses.forEach(response => {
        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({
          success: true,
          id: expect.any(String),
        });
      });

      const reportIds = responses.map(r => r.body.id);
      const uniqueIds = new Set(reportIds);
      expect(uniqueIds.size).toBe(reportIds.length);
    }, 15000);
  });

  describe('Data Integrity', () => {
    it('should preserve all report data through storage and retrieval', async () => {
      // Create a test report with only specific environment fields
      const testEnvironment = {
        appName: 'TestApp',
        buildNumber: 'build-123',
        extra: { customEnv: 'production' },
      };

      const originalReport = generateCtrfReport({
        generatedBy: 'Data Integrity Test',
        results: {
          tool: {
            name: 'Integrity Checker',
            version: '1.0.0',
            extra: { config: 'custom.json' },
          },
          summary: {
            tests: 2,
            passed: 1,
            failed: 1,
            skipped: 0,
            pending: 0,
            other: 0,
            start: 1234567890000,
            stop: 1234567892000,
          },
          tests: [
            {
              name: 'Integrity test 1',
              status: Status.passed,
              duration: 1000,
              suite: 'Integrity Suite',
              tags: ['integrity', 'test'],
              extra: { customField: 'customValue' },
            },
            {
              name: 'Integrity test 2',
              status: Status.failed,
              duration: 1000,
              message: 'Test failure message',
              trace: 'Error stack trace here',
            },
          ],
          environment: testEnvironment,
        },
        extra: {
          customReportField: 'reportValue',
        },
      });

      // Debug: log the report being sent
      // eslint-disable-next-line no-console
      console.log('DEBUG: originalReport', JSON.stringify(originalReport, null, 2));

      let storeResponse;
      try {
        storeResponse = await api
          .post('/api/test-reports')
          .send(JSON.parse(JSON.stringify(originalReport)))
          .expect(201);
      } catch (err) {
        // eslint-disable-next-line no-console
        if (typeof err === 'object' && err && 'response' in err && err.response) {
          // @ts-expect-error: dynamic error shape from supertest
          console.error('DEBUG: Store response error', err.response.status, err.response.body);
        } else {
          console.error('DEBUG: Store response error', err);
        }
        throw err;
      }

      const reportId = storeResponse.body.id;

      const retrieveResponse = await api.get('/api/test-reports').expect(200);

      const storedReport = retrieveResponse.body.data.find(
        (r: StoredReport) => r.reportId === reportId
      );

      expect(storedReport).toBeDefined();
      expect(storedReport.reportFormat).toBe(originalReport.reportFormat);
      expect(storedReport.specVersion).toBe(originalReport.specVersion);
      expect(storedReport.generatedBy).toBe(originalReport.generatedBy);
      expect(storedReport.results.tool).toEqual(originalReport.results.tool);
      expect(storedReport.results.summary).toEqual(originalReport.results.summary);
      expect(storedReport.results.tests).toEqual(originalReport.results.tests);

      // The API may normalize environment objects by adding null fields for missing optional properties
      // This is consistent with the CTRF specification which allows these fields to be present with null values
      if (originalReport.results.environment) {
        expect(storedReport.results.environment).toMatchObject(originalReport.results.environment);

        // Verify that required environment fields are preserved exactly
        expect(storedReport.results.environment?.appName).toBe(
          originalReport.results.environment.appName
        );
        expect(storedReport.results.environment?.buildNumber).toBe(
          originalReport.results.environment.buildNumber
        );
        expect(storedReport.results.environment?.extra).toEqual(
          originalReport.results.environment.extra
        );
      }

      expect(storedReport.extra).toEqual(originalReport.extra);
      expect(storedReport).toHaveProperty('storedAt');
    });
  });
});
