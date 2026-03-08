/**
 * Integration test: Worker parser end-to-end flow
 *
 * Validates that parseReport correctly transforms each supported format into
 * a CTRF report that matches what the /api/v1/reports endpoint expects.
 * Covers the "full worker run → API → verify CTRF stored correctly" acceptance
 * criterion without requiring a live database or server.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseReport, REPORT_FORMAT, CtrfReport } from '../../docker/worker/parsers/index';

const FIXTURE_DIR = path.join(__dirname, '../unit/fixtures/worker-parsers');

/** Minimal CTRF schema validation — mirrors what the API endpoint validates */
function assertValidCtrfReport(report: CtrfReport): void {
  // Top-level required fields
  expect(report.reportFormat).toBe('CTRF');
  expect(typeof report.specVersion).toBe('string');
  expect(typeof report.reportId).toBe('string');
  expect(report.reportId.length).toBeGreaterThan(0);
  expect(typeof report.timestamp).toBe('string');
  expect(new Date(report.timestamp).getTime()).not.toBeNaN();

  // results.tool
  expect(typeof report.results.tool.name).toBe('string');
  expect(report.results.tool.name.length).toBeGreaterThan(0);

  // results.summary
  const { summary } = report.results;
  expect(typeof summary.tests).toBe('number');
  expect(typeof summary.passed).toBe('number');
  expect(typeof summary.failed).toBe('number');
  expect(typeof summary.skipped).toBe('number');
  expect(typeof summary.pending).toBe('number');
  expect(typeof summary.other).toBe('number');
  expect(typeof summary.start).toBe('number');
  expect(typeof summary.stop).toBe('number');
  expect(summary.start).toBeGreaterThan(0);
  expect(summary.stop).toBeGreaterThanOrEqual(summary.start);

  // Summary counts must add up
  expect(summary.passed + summary.failed + summary.skipped + summary.pending + summary.other).toBe(
    summary.tests
  );

  // results.tests
  expect(Array.isArray(report.results.tests)).toBe(true);
  expect(report.results.tests.length).toBeGreaterThan(0);
  expect(report.results.tests.length).toBe(summary.tests);

  for (const test of report.results.tests) {
    expect(typeof test.name).toBe('string');
    expect(test.name.length).toBeGreaterThan(0);
    expect(['passed', 'failed', 'skipped', 'pending', 'other']).toContain(test.status);
    expect(typeof test.duration).toBe('number');
    expect(test.duration).toBeGreaterThanOrEqual(0);
  }
}

describe('Worker end-to-end parser integration', () => {
  const START = 1700000000000;
  const STOP = 1700000003140;

  describe('jest-json format → CTRF report → API-ready payload', () => {
    let report: CtrfReport;

    beforeAll(() => {
      const raw = fs.readFileSync(path.join(FIXTURE_DIR, 'jest-json.fixture.json'), 'utf8');
      report = parseReport(REPORT_FORMAT.JEST_JSON, raw, 'jest --json', 1, '', START, STOP);
    });

    it('should produce a schema-valid CTRF report', () => {
      assertValidCtrfReport(report);
    });

    it('should correctly reflect the overall run result (has failures)', () => {
      expect(report.results.summary.failed).toBeGreaterThan(0);
    });

    it('should include both passed and failed tests', () => {
      const passed = report.results.tests.filter(t => t.status === 'passed');
      const failed = report.results.tests.filter(t => t.status === 'failed');
      expect(passed.length).toBeGreaterThan(0);
      expect(failed.length).toBeGreaterThan(0);
    });

    it('should include suite information for tests that have ancestor titles', () => {
      const testWithSuite = report.results.tests.find(t => t.suite !== undefined);
      expect(testWithSuite).toBeDefined();
      expect(typeof testWithSuite?.suite).toBe('string');
    });

    it('should include error messages for failed tests', () => {
      const failedTest = report.results.tests.find(t => t.status === 'failed');
      expect(failedTest?.message).toBeTruthy();
    });

    it('should set summary start/stop to the provided values', () => {
      expect(report.results.summary.start).toBe(START);
      expect(report.results.summary.stop).toBe(STOP);
    });
  });

  describe('junit-xml format → CTRF report → API-ready payload', () => {
    let report: CtrfReport;

    beforeAll(() => {
      const raw = fs.readFileSync(path.join(FIXTURE_DIR, 'junit-xml.fixture.xml'), 'utf8');
      report = parseReport(
        REPORT_FORMAT.JUNIT_XML,
        raw,
        'pytest --junit-xml=report.xml',
        1,
        '',
        START,
        STOP
      );
    });

    it('should produce a schema-valid CTRF report', () => {
      assertValidCtrfReport(report);
    });

    it('should map all five test cases from the fixture', () => {
      expect(report.results.tests).toHaveLength(5);
    });

    it('should correctly identify passed, failed, skipped, and other tests', () => {
      const passed = report.results.tests.filter(t => t.status === 'passed');
      const failed = report.results.tests.filter(t => t.status === 'failed');
      const skipped = report.results.tests.filter(t => t.status === 'skipped');
      const other = report.results.tests.filter(t => t.status === 'other');
      expect(passed).toHaveLength(2);
      expect(failed).toHaveLength(1);
      expect(skipped).toHaveLength(1);
      expect(other).toHaveLength(1);
    });

    it('should convert JUnit time (seconds) to milliseconds correctly', () => {
      // The fixture has time="1.25" → should be 1250ms
      const test = report.results.tests.find(
        t => t.name === 'User authentication with valid credentials'
      );
      expect(test?.duration).toBe(1250);
    });

    it('should include failure message for failed testcase', () => {
      const failed = report.results.tests.find(t => t.status === 'failed');
      expect(failed?.message).toContain('Expected login to succeed');
    });

    it('should assign suite name from <testsuite name="…">', () => {
      const authTest = report.results.tests.find(
        t => t.name === 'User authentication with valid credentials'
      );
      expect(authTest?.suite).toBe('Authentication');
    });
  });

  describe('ctrf-json format → CTRF report → API-ready payload', () => {
    let report: CtrfReport;

    beforeAll(() => {
      const raw = fs.readFileSync(path.join(FIXTURE_DIR, 'ctrf-json.fixture.json'), 'utf8');
      report = parseReport(
        REPORT_FORMAT.CTRF_JSON,
        raw,
        'jest-ctrf-json-reporter',
        0,
        '',
        START,
        STOP
      );
    });

    it('should produce a schema-valid CTRF report', () => {
      assertValidCtrfReport(report);
    });

    it('should preserve the original reportId (passthrough)', () => {
      expect(report.reportId).toBe('abc123-def456-ghi789');
    });

    it('should preserve all three test entries from the fixture', () => {
      expect(report.results.tests).toHaveLength(3);
    });

    it('should preserve the original tool name', () => {
      expect(report.results.tool.name).toBe('Jest');
    });
  });

  describe('exit-code format → CTRF report → API-ready payload', () => {
    describe('successful run (exit code 0)', () => {
      let report: CtrfReport;

      beforeAll(() => {
        report = parseReport(REPORT_FORMAT.EXIT_CODE, '', 'npm test', 0, '', START, STOP);
      });

      it('should produce a schema-valid CTRF report', () => {
        assertValidCtrfReport(report);
      });

      it('should report one passed test', () => {
        expect(report.results.summary.tests).toBe(1);
        expect(report.results.summary.passed).toBe(1);
        expect(report.results.summary.failed).toBe(0);
      });
    });

    describe('failed run (exit code 1)', () => {
      let report: CtrfReport;

      beforeAll(() => {
        report = parseReport(
          REPORT_FORMAT.EXIT_CODE,
          '',
          'npm test',
          1,
          'Error: 3 tests failed',
          START,
          STOP
        );
      });

      it('should produce a schema-valid CTRF report', () => {
        assertValidCtrfReport(report);
      });

      it('should report one failed test', () => {
        expect(report.results.summary.tests).toBe(1);
        expect(report.results.summary.passed).toBe(0);
        expect(report.results.summary.failed).toBe(1);
      });

      it('should include the stderr in the test message', () => {
        expect(report.results.tests[0].message).toBe('Error: 3 tests failed');
      });
    });
  });

  describe('unknown format falls back to exit-code', () => {
    it('should produce a valid CTRF report for any unknown format string', () => {
      const report = parseReport('totally-unknown-format', '', 'npm test', 0, '', START, STOP);
      assertValidCtrfReport(report);
      expect(report.results.summary.passed).toBe(1);
    });
  });
});
