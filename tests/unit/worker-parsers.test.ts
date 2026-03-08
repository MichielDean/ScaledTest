import * as fs from 'fs';
import * as path from 'path';
import {
  parseJestJson,
  parseJunitXml,
  parseCtrfJson,
  buildExitCodeReport,
  parseReport,
  REPORT_FORMAT,
} from '../../docker/worker/parsers/index';

const FIXTURE_DIR = path.join(__dirname, 'fixtures/worker-parsers');

describe('Worker parsers', () => {
  describe('parseJestJson', () => {
    let jestJsonFixture: string;

    beforeAll(() => {
      jestJsonFixture = fs.readFileSync(path.join(FIXTURE_DIR, 'jest-json.fixture.json'), 'utf8');
    });

    it('should return a CTRF report with reportFormat CTRF', () => {
      const report = parseJestJson(jestJsonFixture, 1700000000000, 1700000003140);
      expect(report.reportFormat).toBe('CTRF');
      expect(report.specVersion).toBe('1.0.0');
    });

    it('should set generatedBy to scaledtest-worker', () => {
      const report = parseJestJson(jestJsonFixture, 1700000000000, 1700000003140);
      expect(report.generatedBy).toBe('scaledtest-worker');
    });

    it('should parse all test cases from testResults', () => {
      const report = parseJestJson(jestJsonFixture, 1700000000000, 1700000003140);
      expect(report.results.tests).toHaveLength(4);
    });

    it('should map passed tests to status passed', () => {
      const report = parseJestJson(jestJsonFixture, 1700000000000, 1700000003140);
      const passed = report.results.tests.filter(t => t.status === 'passed');
      expect(passed).toHaveLength(2);
    });

    it('should map failed tests to status failed', () => {
      const report = parseJestJson(jestJsonFixture, 1700000000000, 1700000003140);
      const failed = report.results.tests.filter(t => t.status === 'failed');
      expect(failed).toHaveLength(1);
    });

    it('should map pending tests to status pending', () => {
      const report = parseJestJson(jestJsonFixture, 1700000000000, 1700000003140);
      const pending = report.results.tests.filter(t => t.status === 'pending');
      expect(pending).toHaveLength(1);
    });

    it('should populate test name from title', () => {
      const report = parseJestJson(jestJsonFixture, 1700000000000, 1700000003140);
      const test = report.results.tests.find(
        t => t.name === 'User authentication with valid credentials'
      );
      expect(test).toBeDefined();
    });

    it('should populate duration from the assertion result', () => {
      const report = parseJestJson(jestJsonFixture, 1700000000000, 1700000003140);
      const test = report.results.tests.find(
        t => t.name === 'User authentication with valid credentials'
      );
      expect(test?.duration).toBe(1250);
    });

    it('should populate message from failureMessages for failed tests', () => {
      const report = parseJestJson(jestJsonFixture, 1700000000000, 1700000003140);
      const failed = report.results.tests.find(t => t.status === 'failed');
      expect(failed?.message).toContain('Expected login to succeed');
    });

    it('should populate suite from ancestorTitles', () => {
      const report = parseJestJson(jestJsonFixture, 1700000000000, 1700000003140);
      const test = report.results.tests.find(
        t => t.name === 'User authentication with valid credentials'
      );
      expect(test?.suite).toBe('Authentication');
    });

    it('should produce correct summary counts', () => {
      const report = parseJestJson(jestJsonFixture, 1700000000000, 1700000003140);
      const { summary } = report.results;
      expect(summary.tests).toBe(4);
      expect(summary.passed).toBe(2);
      expect(summary.failed).toBe(1);
      expect(summary.pending).toBe(1);
    });

    it('should set tool name from testResults', () => {
      const report = parseJestJson(jestJsonFixture, 1700000000000, 1700000003140);
      expect(report.results.tool.name).toBe('Jest');
    });

    it('should throw on invalid JSON', () => {
      expect(() => parseJestJson('not-valid-json', 0, 1000)).toThrow();
    });

    it('should throw on JSON missing testResults array', () => {
      expect(() => parseJestJson('{}', 0, 1000)).toThrow();
    });
  });

  describe('parseJunitXml', () => {
    let junitXmlFixture: string;

    beforeAll(() => {
      junitXmlFixture = fs.readFileSync(path.join(FIXTURE_DIR, 'junit-xml.fixture.xml'), 'utf8');
    });

    it('should return a CTRF report with reportFormat CTRF', () => {
      const report = parseJunitXml(junitXmlFixture, 1700000000000, 1700000003140);
      expect(report.reportFormat).toBe('CTRF');
      expect(report.specVersion).toBe('1.0.0');
    });

    it('should set generatedBy to scaledtest-worker', () => {
      const report = parseJunitXml(junitXmlFixture, 1700000000000, 1700000003140);
      expect(report.generatedBy).toBe('scaledtest-worker');
    });

    it('should parse all testcase elements', () => {
      const report = parseJunitXml(junitXmlFixture, 1700000000000, 1700000003140);
      expect(report.results.tests).toHaveLength(5);
    });

    it('should map passing testcases to status passed', () => {
      const report = parseJunitXml(junitXmlFixture, 1700000000000, 1700000003140);
      const passed = report.results.tests.filter(t => t.status === 'passed');
      expect(passed).toHaveLength(2);
    });

    it('should map testcases with <failure> to status failed', () => {
      const report = parseJunitXml(junitXmlFixture, 1700000000000, 1700000003140);
      const failed = report.results.tests.filter(t => t.status === 'failed');
      expect(failed).toHaveLength(1);
    });

    it('should map testcases with <error> to status other (distinguishes from assertion failures)', () => {
      const report = parseJunitXml(junitXmlFixture, 1700000000000, 1700000003140);
      const other = report.results.tests.filter(t => t.status === 'other');
      expect(other).toHaveLength(1);
      expect(other[0].name).toBe('Token refresh on database unavailable');
      expect(other[0].message).toContain('Database connection refused');
    });

    it('should map testcases with <skipped> to status skipped', () => {
      const report = parseJunitXml(junitXmlFixture, 1700000000000, 1700000003140);
      const skipped = report.results.tests.filter(t => t.status === 'skipped');
      expect(skipped).toHaveLength(1);
    });

    it('should populate test name from name attribute', () => {
      const report = parseJunitXml(junitXmlFixture, 1700000000000, 1700000003140);
      const test = report.results.tests.find(
        t => t.name === 'User authentication with valid credentials'
      );
      expect(test).toBeDefined();
    });

    it('should populate duration in milliseconds from time attribute (seconds in XML)', () => {
      const report = parseJunitXml(junitXmlFixture, 1700000000000, 1700000003140);
      const test = report.results.tests.find(
        t => t.name === 'User authentication with valid credentials'
      );
      // time="1.25" seconds → 1250 ms
      expect(test?.duration).toBe(1250);
    });

    it('should populate message from failure message attribute', () => {
      const report = parseJunitXml(junitXmlFixture, 1700000000000, 1700000003140);
      const failed = report.results.tests.find(t => t.status === 'failed');
      expect(failed?.message).toContain('Expected login to succeed');
    });

    it('should populate suite from testsuite name attribute', () => {
      const report = parseJunitXml(junitXmlFixture, 1700000000000, 1700000003140);
      const test = report.results.tests.find(
        t => t.name === 'User authentication with valid credentials'
      );
      expect(test?.suite).toBe('Authentication');
    });

    it('should produce correct summary counts', () => {
      const report = parseJunitXml(junitXmlFixture, 1700000000000, 1700000003140);
      const { summary } = report.results;
      expect(summary.tests).toBe(5);
      expect(summary.passed).toBe(2);
      expect(summary.failed).toBe(1);
      expect(summary.skipped).toBe(1);
      expect(summary.other).toBe(1);
    });

    it('should throw on empty XML string', () => {
      expect(() => parseJunitXml('', 0, 1000)).toThrow();
    });

    it('should throw on XML with no testsuite elements', () => {
      expect(() => parseJunitXml('<root></root>', 0, 1000)).toThrow();
    });
  });

  describe('parseCtrfJson', () => {
    let ctrfJsonFixture: string;

    beforeAll(() => {
      ctrfJsonFixture = fs.readFileSync(path.join(FIXTURE_DIR, 'ctrf-json.fixture.json'), 'utf8');
    });

    it('should return the parsed CTRF report as-is (passthrough)', () => {
      const report = parseCtrfJson(ctrfJsonFixture);
      expect(report.reportFormat).toBe('CTRF');
      expect(report.results.tests).toHaveLength(3);
    });

    it('should preserve reportId from original report', () => {
      const report = parseCtrfJson(ctrfJsonFixture);
      expect(report.reportId).toBe('abc123-def456-ghi789');
    });

    it('should preserve tool name from original report', () => {
      const report = parseCtrfJson(ctrfJsonFixture);
      expect(report.results.tool.name).toBe('Jest');
    });

    it('should preserve test statuses as provided', () => {
      const report = parseCtrfJson(ctrfJsonFixture);
      const passed = report.results.tests.filter(t => t.status === 'passed');
      const failed = report.results.tests.filter(t => t.status === 'failed');
      expect(passed).toHaveLength(2);
      expect(failed).toHaveLength(1);
    });

    it('should throw on invalid JSON', () => {
      expect(() => parseCtrfJson('not-valid-json')).toThrow();
    });

    it('should throw on JSON missing reportFormat', () => {
      expect(() =>
        parseCtrfJson('{"results":{"tool":{"name":"x"},"summary":{},"tests":[]}}')
      ).toThrow();
    });

    it('should throw on JSON with incorrect reportFormat', () => {
      const bad = JSON.stringify({
        reportFormat: 'INVALID',
        specVersion: '1.0.0',
        results: { tool: { name: 'x' }, summary: {}, tests: [] },
      });
      expect(() => parseCtrfJson(bad)).toThrow();
    });

    it('should throw when results is missing', () => {
      const bad = JSON.stringify({ reportFormat: 'CTRF', specVersion: '1.0.0' });
      expect(() => parseCtrfJson(bad)).toThrow('parseCtrfJson: results must be an object');
    });

    it('should throw when results.tests is not an array', () => {
      const bad = JSON.stringify({
        reportFormat: 'CTRF',
        specVersion: '1.0.0',
        results: { tool: { name: 'x' }, summary: {}, tests: null },
      });
      expect(() => parseCtrfJson(bad)).toThrow('parseCtrfJson: results.tests must be an array');
    });

    it('should throw when results.summary is missing', () => {
      const bad = JSON.stringify({
        reportFormat: 'CTRF',
        specVersion: '1.0.0',
        results: { tool: { name: 'x' }, tests: [] },
      });
      expect(() => parseCtrfJson(bad)).toThrow('parseCtrfJson: results.summary must be an object');
    });

    it('should throw when results.tool is missing', () => {
      const bad = JSON.stringify({
        reportFormat: 'CTRF',
        specVersion: '1.0.0',
        results: { summary: {}, tests: [] },
      });
      expect(() => parseCtrfJson(bad)).toThrow('parseCtrfJson: results.tool must be an object');
    });
  });

  describe('buildExitCodeReport', () => {
    it('should return passed status for exit code 0', () => {
      const report = buildExitCodeReport('npm test', 0, '', 1700000000000, 1700000003000);
      expect(report.results.tests[0].status).toBe('passed');
    });

    it('should return failed status for non-zero exit code', () => {
      const report = buildExitCodeReport(
        'npm test',
        1,
        'Error: tests failed',
        1700000000000,
        1700000003000
      );
      expect(report.results.tests[0].status).toBe('failed');
    });

    it('should set test name to the command', () => {
      const report = buildExitCodeReport('npm run test:unit', 0, '', 1700000000000, 1700000003000);
      expect(report.results.tests[0].name).toBe('npm run test:unit');
    });

    it('should include stderr as message when exit code is non-zero', () => {
      const report = buildExitCodeReport(
        'npm test',
        1,
        'Something went wrong',
        1700000000000,
        1700000003000
      );
      expect(report.results.tests[0].message).toBe('Something went wrong');
    });

    it('should set duration to stop minus start', () => {
      const report = buildExitCodeReport('npm test', 0, '', 1700000000000, 1700000003000);
      expect(report.results.tests[0].duration).toBe(3000);
    });

    it('should produce correct summary for passed run', () => {
      const report = buildExitCodeReport('npm test', 0, '', 1700000000000, 1700000003000);
      expect(report.results.summary.tests).toBe(1);
      expect(report.results.summary.passed).toBe(1);
      expect(report.results.summary.failed).toBe(0);
    });

    it('should produce correct summary for failed run', () => {
      const report = buildExitCodeReport('npm test', 1, '', 1700000000000, 1700000003000);
      expect(report.results.summary.tests).toBe(1);
      expect(report.results.summary.passed).toBe(0);
      expect(report.results.summary.failed).toBe(1);
    });

    it('should set reportFormat to CTRF', () => {
      const report = buildExitCodeReport('npm test', 0, '', 0, 1000);
      expect(report.reportFormat).toBe('CTRF');
    });
  });

  describe('parseReport', () => {
    it('should dispatch to parseJestJson when format is jest-json', () => {
      const fixture = fs.readFileSync(path.join(FIXTURE_DIR, 'jest-json.fixture.json'), 'utf8');
      const report = parseReport(REPORT_FORMAT.JEST_JSON, fixture, 'npm test', 0, '', 0, 1000);
      expect(report.results.tests).toHaveLength(4);
    });

    it('should dispatch to parseJunitXml when format is junit-xml', () => {
      const fixture = fs.readFileSync(path.join(FIXTURE_DIR, 'junit-xml.fixture.xml'), 'utf8');
      const report = parseReport(REPORT_FORMAT.JUNIT_XML, fixture, 'npm test', 0, '', 0, 1000);
      expect(report.results.tests).toHaveLength(5);
    });

    it('should dispatch to parseCtrfJson when format is ctrf-json', () => {
      const fixture = fs.readFileSync(path.join(FIXTURE_DIR, 'ctrf-json.fixture.json'), 'utf8');
      const report = parseReport(REPORT_FORMAT.CTRF_JSON, fixture, 'npm test', 0, '', 0, 1000);
      expect(report.results.tests).toHaveLength(3);
    });

    it('should use exit-code fallback when format is exit-code', () => {
      const report = parseReport(REPORT_FORMAT.EXIT_CODE, '', 'npm test', 0, '', 0, 1000);
      expect(report.results.tests).toHaveLength(1);
      expect(report.results.tests[0].status).toBe('passed');
    });

    it('should use exit-code fallback for unknown format', () => {
      const report = parseReport('unknown-format', '', 'npm test', 1, 'err', 0, 1000);
      expect(report.results.tests[0].status).toBe('failed');
    });
  });
});
