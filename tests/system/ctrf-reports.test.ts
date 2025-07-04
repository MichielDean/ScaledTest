import supertest from 'supertest';
import {
  generateCtrfReport,
  generateMinimalCtrfReport,
  generateInvalidCtrfReport,
  generateLargeCtrfReport,
} from '../data/ctrfReportGenerator';
import { getAuthHeader } from '../authentication/tokenService';
import { Status } from '../../src/schemas/ctrf/ctrf';
import { StoredReport } from '../../src/types/database';

describe('CTRF Reports API System Tests', () => {
  let authHeaders: Record<string, string>;
  const TEST_PORT = process.env.TEST_PORT || '3000';
  const API_URL = `http://localhost:${TEST_PORT}`;
  const api = supertest(API_URL);

  beforeAll(async () => {
    try {
      // Testing CTRF API against specified URL
      authHeaders = await getAuthHeader();
      // Successfully authenticated with Keycloak for CTRF tests
    } catch (error) {
      console.error('Failed to authenticate in beforeAll:', error);
      throw error;
    }
  }, 30000);

  describe('CTRF Report Storage', () => {
    it('should store a complete CTRF report successfully', async () => {
      const ctrfReport = generateCtrfReport();

      const response = await api
        .post('/api/test-reports')
        .set(authHeaders)
        .send(ctrfReport)
        .expect(201);

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
        .set(authHeaders)
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
        .set(authHeaders)
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
        .set(authHeaders)
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
        .set(authHeaders)
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
          .set(authHeaders)
          .send(report)
          .expect(201);
        storedReportIds.push(response.body.id);
      }
    });

    it('should retrieve all reports without filters', async () => {
      const response = await api.get('/api/test-reports').set(authHeaders).expect(200);

      expect(response.body).toMatchObject({
        success: true,
        reports: expect.any(Array),
        total: expect.any(Number),
      });

      expect(response.body.reports.length).toBeGreaterThanOrEqual(2);
      expect(response.body.total).toBeGreaterThanOrEqual(2);

      const report = response.body.reports[0];
      expect(report).toHaveProperty('_id');
      expect(report).toHaveProperty('storedAt');
      expect(report).toHaveProperty('reportFormat', 'CTRF');
      expect(report).toHaveProperty('results');
    });

    it('should filter reports by test status', async () => {
      const response = await api
        .get('/api/test-reports?status=failed')
        .set(authHeaders)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        reports: expect.any(Array),
        total: expect.any(Number),
      });

      expect(response.body.reports.length).toBeGreaterThan(0);
    });

    it('should filter reports by tool name', async () => {
      const response = await api.get('/api/test-reports?tool=Jest').set(authHeaders).expect(200);

      expect(response.body).toMatchObject({
        success: true,
        reports: expect.any(Array),
        total: expect.any(Number),
      });

      if (response.body.reports.length > 0) {
        expect(response.body.reports[0].results.tool.name).toBe('Jest');
      }
    });

    it('should filter reports by environment', async () => {
      const response = await api
        .get('/api/test-reports?environment=CI')
        .set(authHeaders)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        reports: expect.any(Array),
        total: expect.any(Number),
      });

      if (response.body.reports.length > 0) {
        expect(response.body.reports[0].results.environment?.testEnvironment).toBe('CI');
      }
    });

    it('should handle pagination', async () => {
      const page1Response = await api
        .get('/api/test-reports?page=1&size=1')
        .set(authHeaders)
        .expect(200);

      expect(page1Response.body.reports).toHaveLength(1);

      if (page1Response.body.total > 1) {
        const page2Response = await api
          .get('/api/test-reports?page=2&size=1')
          .set(authHeaders)
          .expect(200);

        expect(page2Response.body.reports).toHaveLength(1);
        expect(page2Response.body.reports[0]._id).not.toBe(page1Response.body.reports[0]._id);
      }
    });

    it('should respect maximum page size limit', async () => {
      const response = await api.get('/api/test-reports?size=200').set(authHeaders).expect(200);

      expect(response.body.reports.length).toBeLessThanOrEqual(100);
    });

    it('should combine multiple filters', async () => {
      const response = await api
        .get('/api/test-reports?tool=Jest&environment=CI')
        .set(authHeaders)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        reports: expect.any(Array),
        total: expect.any(Number),
      });

      if (response.body.reports.length > 0) {
        const report = response.body.reports[0];
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
        .set(authHeaders)
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
      const incompleteReport = {
        reportFormat: 'CTRF',
        specVersion: '1.0.0',
      };

      const response = await api
        .post('/api/test-reports')
        .set(authHeaders)
        .send(incompleteReport)
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: 'CTRF report validation failed',
      });
    });

    it('should reject unsupported HTTP methods', async () => {
      const response = await api.delete('/api/test-reports').set(authHeaders).expect(405);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Method not allowed. Supported methods: GET, POST',
      });
    });

    it('should require authentication', async () => {
      const ctrfReport = generateCtrfReport();

      await api.post('/api/test-reports').send(ctrfReport).expect(401);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large CTRF reports', async () => {
      const largeReport = generateLargeCtrfReport(50);

      const startTime = Date.now();
      const response = await api
        .post('/api/test-reports')
        .set(authHeaders)
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

      const promises = reports.map(report =>
        api.post('/api/test-reports').set(authHeaders).send(report)
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
          environment: {
            appName: 'TestApp',
            buildNumber: 'build-123',
            extra: { customEnv: 'production' },
          },
        },
        extra: {
          customReportField: 'reportValue',
        },
      });

      const storeResponse = await api
        .post('/api/test-reports')
        .set(authHeaders)
        .send(originalReport)
        .expect(201);

      const reportId = storeResponse.body.id;

      const retrieveResponse = await api.get('/api/test-reports').set(authHeaders).expect(200);

      const storedReport = retrieveResponse.body.reports.find(
        (r: StoredReport) => r.reportId === reportId
      );

      expect(storedReport).toBeDefined();
      expect(storedReport.reportFormat).toBe(originalReport.reportFormat);
      expect(storedReport.specVersion).toBe(originalReport.specVersion);
      expect(storedReport.generatedBy).toBe(originalReport.generatedBy);
      expect(storedReport.results.tool).toEqual(originalReport.results.tool);
      expect(storedReport.results.summary).toEqual(originalReport.results.summary);
      expect(storedReport.results.tests).toEqual(originalReport.results.tests);
      expect(storedReport.results.environment).toEqual(originalReport.results.environment);
      expect(storedReport.extra).toEqual(originalReport.extra);
      expect(storedReport).toHaveProperty('storedAt');
    });
  });
});
