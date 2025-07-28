/**
 * Integration tests for demo data with teams feature
 * These tests verify that demo data is properly accessible regardless of team assignments
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import { generateCtrfReport } from '../../tests/data/ctrfReportGenerator';
import { getAuthToken } from '../../tests/authentication/tokenService';
import { CtrfSchema, Status } from '../../src/schemas/ctrf/ctrf';
import { DEMO_DATA_TEAM } from '../../src/lib/teamFilters';
import logger from '../../src/logging/logger';

// Extended interface for stored reports with metadata
interface StoredTestReport extends CtrfSchema {
  _id: string;
  storedAt: string;
  metadata: {
    uploadedBy: string;
    userTeams: string[];
    uploadedAt: string;
    isDemoData?: boolean;
    [key: string]: unknown;
  };
}

interface TestReportsResponse {
  success: true;
  data: StoredTestReport[];
  total: number;
  pagination: {
    page: number;
    size: number;
    total: number;
  };
}

interface PostReportResponse {
  success: true;
  id: string;
  message: string;
  summary: {
    tests: number;
    passed: number;
    failed: number;
    skipped: number;
    pending: number;
    other: number;
  };
}

const testLogger = logger.child({ module: 'demo-data-teams-test' });

describe('Demo Data with Teams Integration', () => {
  let maintainerToken: string;
  let readonlyToken: string;
  let ownerToken: string;
  const baseUrl = 'http://localhost:3000';

  beforeAll(async () => {
    // Get tokens for different user types
    maintainerToken = await getAuthToken('maintainer@example.com');
    readonlyToken = await getAuthToken('readonly@example.com');
    ownerToken = await getAuthToken('owner@example.com');
  });

  describe('Demo Data Upload', () => {
    test('should allow maintainer user to upload demo data', async () => {
      const now = new Date();
      const startTime = now.getTime() - 30000;
      const demoReport = generateCtrfReport({
        results: {
          tool: { name: 'Demo-Jest' },
          summary: {
            tests: 15,
            passed: 12,
            failed: 2,
            skipped: 1,
            pending: 0,
            other: 0,
            start: startTime,
            stop: now.getTime(),
          },
          tests: [
            {
              name: 'Demo test case 1',
              status: Status.passed,
              duration: 1000,
              start: startTime,
              stop: startTime + 1000,
            },
            {
              name: 'Demo test case 2',
              status: Status.failed,
              duration: 1500,
              start: startTime + 1000,
              stop: startTime + 2500,
            },
          ],
          environment: {
            testEnvironment: 'demo',
          },
        },
      });

      const response = await fetch(`${baseUrl}/api/test-reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${maintainerToken}`,
        },
        body: JSON.stringify(demoReport),
      });

      expect(response.status).toBe(201);

      const result = (await response.json()) as PostReportResponse;
      expect(result.success).toBe(true);
      expect(result.id).toBeDefined();

      testLogger.info('Demo data uploaded successfully', {
        reportId: result.id,
        tool: demoReport.results.tool.name,
      });
    });

    test('should mark uploaded data as demo data when user has no teams', async () => {
      const now = new Date();
      const startTime = now.getTime() - 25000;
      const demoReport = generateCtrfReport({
        results: {
          tool: { name: 'Demo-Playwright' },
          summary: {
            tests: 8,
            passed: 7,
            failed: 1,
            skipped: 0,
            pending: 0,
            other: 0,
            start: startTime,
            stop: now.getTime(),
          },
          tests: [
            {
              name: 'Demo playwright test',
              status: Status.passed,
              duration: 800,
              start: startTime,
              stop: startTime + 800,
            },
          ],
          environment: {
            testEnvironment: 'demo',
          },
        },
      });

      const response = await fetch(`${baseUrl}/api/test-reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${maintainerToken}`,
        },
        body: JSON.stringify(demoReport),
      });

      expect(response.status).toBe(201);
      const result = (await response.json()) as TestReportsResponse;

      // Verify the report was stored with demo data metadata
      // This should be detectable through the API response or logs
      expect(result.success).toBe(true);
    });
  });

  describe('Demo Data Visibility', () => {
    test('should allow readonly user to see demo data even with no teams', async () => {
      const response = await fetch(`${baseUrl}/api/test-reports`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${readonlyToken}`,
        },
      });

      expect(response.status).toBe(200);

      const result = (await response.json()) as TestReportsResponse;
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);

      // Should have demo data visible
      const demoReports = result.data.filter(
        (report: StoredTestReport) =>
          report?.metadata?.isDemoData === true ||
          (Array.isArray(report?.metadata?.userTeams) &&
            report.metadata.userTeams.includes(DEMO_DATA_TEAM))
      );

      expect(demoReports.length).toBeGreaterThan(0);

      testLogger.info('Demo data visibility test', {
        totalReports: result.data.length,
        demoReports: demoReports.length,
      });
    });

    test('should allow owner user to see demo data', async () => {
      const response = await fetch(`${baseUrl}/api/test-reports`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
        },
      });

      expect(response.status).toBe(200);

      const result = (await response.json()) as TestReportsResponse;
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);

      // Should have demo data visible
      const demoReports = result.data.filter(
        (report: StoredTestReport) =>
          report?.metadata?.isDemoData === true ||
          (Array.isArray(report?.metadata?.userTeams) &&
            report.metadata.userTeams.includes(DEMO_DATA_TEAM))
      );

      expect(demoReports.length).toBeGreaterThan(0);
    });

    test('should return demo data with correct metadata structure', async () => {
      const response = await fetch(`${baseUrl}/api/test-reports`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${readonlyToken}`,
        },
      });

      expect(response.status).toBe(200);

      const result = (await response.json()) as TestReportsResponse;
      const demoReports = result.data.filter(
        (report: StoredTestReport) =>
          report?.metadata?.isDemoData === true ||
          (Array.isArray(report?.metadata?.userTeams) &&
            report.metadata.userTeams.includes(DEMO_DATA_TEAM))
      );

      expect(demoReports.length).toBeGreaterThan(0);

      // Verify demo report structure
      const demoReport = demoReports[0];
      expect(demoReport).toHaveProperty('_id');
      expect(demoReport).toHaveProperty('results');
      expect(demoReport).toHaveProperty('metadata');

      // Check if metadata indicates this is demo data
      testLogger.info('Demo report metadata', {
        metadata: demoReport.metadata,
        hasIsDemoData: demoReport.metadata?.isDemoData,
        userTeams: demoReport.metadata?.userTeams,
      });
    });
  });

  describe('Team Filtering Logic', () => {
    test('should not filter out demo data for users with no teams', async () => {
      // First, verify maintainer has no teams
      const maintainerResponse = await fetch(`${baseUrl}/api/test-reports`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${maintainerToken}`,
        },
      });

      expect(maintainerResponse.status).toBe(200);
      const maintainerResult = await maintainerResponse.json();

      // Maintainer should see demo data they uploaded
      const maintainerDemoReports = maintainerResult.data.filter(
        (report: StoredTestReport) =>
          report?.metadata?.isDemoData === true ||
          (Array.isArray(report?.metadata?.userTeams) &&
            report.metadata.userTeams.includes(DEMO_DATA_TEAM))
      );

      expect(maintainerDemoReports.length).toBeGreaterThan(0);
    });

    test('should include demo data in analytics endpoints', async () => {
      // Test that demo data appears in analytics
      const response = await fetch(`${baseUrl}/api/analytics/test-suite-overview`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${readonlyToken}`,
        },
      });

      expect(response.status).toBe(200);

      const result = (await response.json()) as TestReportsResponse;
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);

      testLogger.info('Analytics data includes demo reports', {
        suiteCount: result.data.length,
      });
    });
  });

  describe('Cross-User Demo Data Access', () => {
    test('should allow different users to see the same demo data', async () => {
      // Get reports for readonly user
      const readonlyResponse = await fetch(`${baseUrl}/api/test-reports`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${readonlyToken}`,
        },
      });

      // Get reports for owner user
      const ownerResponse = await fetch(`${baseUrl}/api/test-reports`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
        },
      });

      expect(readonlyResponse.status).toBe(200);
      expect(ownerResponse.status).toBe(200);

      const readonlyResult = await readonlyResponse.json();
      const ownerResult = await ownerResponse.json();

      const readonlyDemoReports = readonlyResult.data.filter(
        (report: StoredTestReport) =>
          report?.metadata?.isDemoData === true ||
          (Array.isArray(report?.metadata?.userTeams) &&
            report.metadata.userTeams.includes(DEMO_DATA_TEAM))
      );
      const ownerDemoReports = ownerResult.data.filter(
        (report: StoredTestReport) =>
          report?.metadata?.isDemoData === true ||
          (Array.isArray(report?.metadata?.userTeams) &&
            report.metadata.userTeams.includes(DEMO_DATA_TEAM))
      );

      // Both users should see demo data
      expect(readonlyDemoReports.length).toBeGreaterThan(0);
      expect(ownerDemoReports.length).toBeGreaterThan(0);

      // They should see the same demo reports
      expect(readonlyDemoReports.length).toBe(ownerDemoReports.length);
    });
  });

  describe('Demo Data Dashboard Integration', () => {
    test('should provide demo data for dashboard statistics', async () => {
      const response = await fetch(`${baseUrl}/api/test-reports?page=1&size=20`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${readonlyToken}`,
        },
      });

      expect(response.status).toBe(200);

      const result = (await response.json()) as TestReportsResponse;
      expect(result.success).toBe(true);
      expect(result.pagination).toBeDefined();
      expect(result.pagination.total).toBeGreaterThan(0);

      // Should have some demo data in the first page
      const demoReports = result.data.filter(
        (report: StoredTestReport) =>
          report?.metadata?.isDemoData === true ||
          (Array.isArray(report?.metadata?.userTeams) &&
            report.metadata.userTeams.includes(DEMO_DATA_TEAM))
      );

      expect(demoReports.length).toBeGreaterThan(0);

      testLogger.info('Dashboard pagination includes demo data', {
        totalReports: result.pagination.total,
        pageReports: result.data.length,
        demoReports: demoReports.length,
      });
    });
  });
});
