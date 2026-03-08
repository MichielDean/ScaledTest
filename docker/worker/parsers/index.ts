/**
 * CTRF report structure returned by all parsers.
 * Kept minimal — only the fields the worker actually populates.
 */
export interface CtrfReport {
  reportFormat: string;
  specVersion: string;
  reportId: string;
  timestamp: string;
  generatedBy: string;
  results: {
    tool: {
      name: string;
      version?: string;
    };
    summary: {
      tests: number;
      passed: number;
      failed: number;
      skipped: number;
      pending: number;
      other: number;
      start: number;
      stop: number;
    };
    tests: CtrfTestEntry[];
  };
}

export interface CtrfTestEntry {
  name: string;
  status: 'passed' | 'failed' | 'skipped' | 'pending' | 'other';
  duration: number;
  suite?: string;
  message?: string;
  trace?: string;
  stdout?: string[];
}

// ---------------------------------------------------------------------------
// Supported format constants
// ---------------------------------------------------------------------------

export const REPORT_FORMAT = {
  JEST_JSON: 'jest-json',
  JUNIT_XML: 'junit-xml',
  CTRF_JSON: 'ctrf-json',
  EXIT_CODE: 'exit-code',
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateReportId(): string {
  // Node 20 is pinned in the Dockerfile and always provides crypto.randomUUID.
  // The worker targets Node 20+ exclusively, so no fallback is needed.
  // Dropping the fallback is intentional: a non-UUID fallback would cause the
  // API to return 400 (reportId is validated as z.string().uuid() when present).
  return crypto.randomUUID();
}

function baseReport(): Omit<CtrfReport, 'results'> {
  return {
    reportFormat: 'CTRF',
    specVersion: '1.0.0',
    reportId: generateReportId(),
    timestamp: new Date().toISOString(),
    generatedBy: 'scaledtest-worker',
  };
}

function buildSummary(
  tests: CtrfTestEntry[],
  start: number,
  stop: number
): CtrfReport['results']['summary'] {
  return {
    tests: tests.length,
    passed: tests.filter(t => t.status === 'passed').length,
    failed: tests.filter(t => t.status === 'failed').length,
    skipped: tests.filter(t => t.status === 'skipped').length,
    pending: tests.filter(t => t.status === 'pending').length,
    other: tests.filter(t => t.status === 'other').length,
    start,
    stop,
  };
}

// ---------------------------------------------------------------------------
// Jest JSON parser
// ---------------------------------------------------------------------------

interface JestAssertionResult {
  title: string;
  ancestorTitles: string[];
  status: string;
  duration?: number | null;
  failureMessages?: string[];
}

interface JestTestFileResult {
  assertionResults: JestAssertionResult[];
  testFilePath?: string;
}

interface JestJsonOutput {
  testResults?: JestTestFileResult[];
  numPassedTests?: number;
  numFailedTests?: number;
}

/**
 * Parse Jest `--json` output into a CTRF report.
 *
 * @param raw   - Raw stdout string from Jest `--json`
 * @param start - Unix timestamp (ms) when the test run started
 * @param stop  - Unix timestamp (ms) when the test run ended
 */
export function parseJestJson(raw: string, start: number, stop: number): CtrfReport {
  let parsed: JestJsonOutput;
  try {
    parsed = JSON.parse(raw) as JestJsonOutput;
  } catch {
    throw new Error('parseJestJson: invalid JSON input');
  }

  if (!Array.isArray(parsed.testResults)) {
    throw new Error('parseJestJson: JSON is missing required "testResults" array');
  }

  const tests: CtrfTestEntry[] = [];

  for (const fileResult of parsed.testResults) {
    for (const assertion of fileResult.assertionResults ?? []) {
      const duration = typeof assertion.duration === 'number' ? assertion.duration : 0;
      const suite =
        assertion.ancestorTitles?.length > 0 ? assertion.ancestorTitles.join(' > ') : undefined;

      let status: CtrfTestEntry['status'];
      switch (assertion.status) {
        case 'passed':
          status = 'passed';
          break;
        case 'failed':
          status = 'failed';
          break;
        case 'skipped':
          status = 'skipped';
          break;
        case 'pending':
        case 'todo':
          status = 'pending';
          break;
        default:
          status = 'other';
      }

      const failureMessages = assertion.failureMessages ?? [];
      const message = failureMessages.length > 0 ? failureMessages.join('\n') : undefined;

      tests.push({
        name: assertion.title,
        status,
        duration,
        suite,
        message,
      });
    }
  }

  return {
    ...baseReport(),
    results: {
      tool: { name: 'Jest' },
      summary: buildSummary(tests, start, stop),
      tests,
    },
  };
}

// ---------------------------------------------------------------------------
// JUnit XML parser
// ---------------------------------------------------------------------------

/**
 * Minimal hand-rolled JUnit XML parser.
 *
 * Supports the standard JUnit XML schema used by Jest (jest-junit),
 * pytest (junit-xml), and most CI systems:
 *
 *   <testsuites ...>
 *     <testsuite name="Suite" ...>
 *       <testcase name="Test" time="1.25" classname="...">
 *         [<failure message="..." type="...">trace</failure>]
 *         [<error message="..." type="...">trace</error>]
 *         [<skipped/>]
 *       </testcase>
 *     </testsuite>
 *   </testsuites>
 *
 * Intentionally avoids external XML dependencies so the file can be bundled
 * with the worker without extra install steps.
 */
export function parseJunitXml(raw: string, start: number, stop: number): CtrfReport {
  if (!raw || raw.trim().length === 0) {
    throw new Error('parseJunitXml: empty XML input');
  }

  const tests: CtrfTestEntry[] = [];
  let totalSuites = 0;

  // Two-pass approach:
  // Pass 1: Find each <testsuite …> opening tag and capture its name attribute.
  //         Note: use \btestsuite\b (not testsuites) to avoid matching <testsuites>.
  // Pass 2: Within the suite's text range, find all <testcase …> elements.

  // Split by testsuite open tags (not testsuites).
  // Strategy: scan for "<testsuite " (with space — not "<testsuites") open tags,
  // then extract the text up to the matching </testsuite>.

  const suiteOpenPattern = /<testsuite\s([^>]*)>/gi;
  let suiteOpenMatch: RegExpExecArray | null;

  while ((suiteOpenMatch = suiteOpenPattern.exec(raw)) !== null) {
    totalSuites++;
    const suiteAttrs = suiteOpenMatch[1];
    const suiteStart = suiteOpenMatch.index + suiteOpenMatch[0].length;

    // Find matching </testsuite> — scan forward from suiteStart
    const closeTag = '</testsuite>';
    const suiteEnd = raw.indexOf(closeTag, suiteStart);
    const suiteBody = suiteEnd >= 0 ? raw.slice(suiteStart, suiteEnd) : raw.slice(suiteStart);

    const suiteName = extractAttr(suiteAttrs, 'name') ?? undefined;

    // Now extract all <testcase …> … </testcase> (or self-closing) blocks from suiteBody.
    // We use a character-level scan to find each <testcase open tag and its closing boundary.
    parseSuiteBody(suiteBody, suiteName, tests);
  }

  if (totalSuites === 0) {
    throw new Error('parseJunitXml: no <testsuite> elements found');
  }

  return {
    ...baseReport(),
    results: {
      tool: { name: 'JUnit XML' },
      summary: buildSummary(tests, start, stop),
      tests,
    },
  };
}

/**
 * Extract all testcase entries from within a single <testsuite> body string.
 */
function parseSuiteBody(body: string, suiteName: string | undefined, tests: CtrfTestEntry[]): void {
  // Match <testcase …/> (self-closing) or <testcase …>…</testcase>
  const tcOpenPattern = /<testcase\s([^>]*?)(\s*\/>|>)/gi;
  let tcMatch: RegExpExecArray | null;

  while ((tcMatch = tcOpenPattern.exec(body)) !== null) {
    const caseAttrs = tcMatch[1];
    const closing = tcMatch[2].trim();
    const selfClose = closing === '/>';

    let caseBody = '';
    if (!selfClose) {
      // Find matching </testcase>
      const caseStart = tcMatch.index + tcMatch[0].length;
      const closeTag = '</testcase>';
      const caseEnd = body.indexOf(closeTag, caseStart);
      caseBody = caseEnd >= 0 ? body.slice(caseStart, caseEnd) : body.slice(caseStart);
    }

    const name = extractAttr(caseAttrs, 'name') ?? '(unnamed)';
    const timeStr = extractAttr(caseAttrs, 'time');
    const durationMs = timeStr ? Math.round(parseFloat(timeStr) * 1000) : 0;

    let status: CtrfTestEntry['status'] = 'passed';
    let message: string | undefined;
    let trace: string | undefined;

    const failureMatch = /<failure([^>]*)>([\s\S]*?)<\/failure>/i.exec(caseBody);
    const errorMatch = /<error([^>]*)>([\s\S]*?)<\/error>/i.exec(caseBody);
    const skippedMatch = /<skipped[\s/>]/i.exec(caseBody);

    if (failureMatch) {
      status = 'failed';
      message = extractAttr(failureMatch[1], 'message') ?? failureMatch[2].trim();
      trace = failureMatch[2].trim() || undefined;
    } else if (errorMatch) {
      // Per JUnit spec, <error> indicates an unexpected exception (infrastructure
      // or setup error), distinct from <failure> which means an assertion failure.
      // Mapping to 'other' preserves this distinction for consumers that need it.
      status = 'other';
      message = extractAttr(errorMatch[1], 'message') ?? errorMatch[2].trim();
      trace = errorMatch[2].trim() || undefined;
    } else if (skippedMatch) {
      status = 'skipped';
    }

    tests.push({
      name,
      status,
      duration: durationMs,
      suite: suiteName,
      message,
      trace,
    });
  }
}

/**
 * Extract an XML attribute value from an attribute string.
 * Handles both single-quoted and double-quoted values.
 */
function extractAttr(attrs: string, key: string): string | null {
  const pattern = new RegExp(`${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
  const match = pattern.exec(attrs);
  if (!match) return null;
  return (match[1] ?? match[2]).trim();
}

// ---------------------------------------------------------------------------
// CTRF JSON passthrough parser
// ---------------------------------------------------------------------------

/**
 * Validate and return a CTRF JSON report as-is (passthrough).
 *
 * @param raw - Raw JSON string that must be a valid CTRF report
 */
export function parseCtrfJson(raw: string): CtrfReport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('parseCtrfJson: invalid JSON input');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('parseCtrfJson: root value must be an object');
  }

  const report = parsed as Record<string, unknown>;

  if (report.reportFormat !== 'CTRF') {
    throw new Error(
      `parseCtrfJson: reportFormat must be "CTRF", got ${JSON.stringify(report.reportFormat)}`
    );
  }

  // Validate structural fields so callers get a clear parse-time error rather
  // than a cryptic downstream failure in the API when required fields are missing.
  if (typeof report.results !== 'object' || report.results === null) {
    throw new Error('parseCtrfJson: results must be an object');
  }

  const results = report.results as Record<string, unknown>;

  if (!Array.isArray(results.tests)) {
    throw new Error('parseCtrfJson: results.tests must be an array');
  }

  if (typeof results.summary !== 'object' || results.summary === null) {
    throw new Error('parseCtrfJson: results.summary must be an object');
  }

  if (typeof results.tool !== 'object' || results.tool === null) {
    throw new Error('parseCtrfJson: results.tool must be an object');
  }

  return report as unknown as CtrfReport;
}

// ---------------------------------------------------------------------------
// Exit-code fallback (current behavior, retained)
// ---------------------------------------------------------------------------

/**
 * Build a minimal 1-test CTRF report from an exit code, matching the
 * original worker behaviour before this feature was added.
 *
 * @param command  - The test command that was run
 * @param exitCode - Process exit code (0 = passed)
 * @param stderr   - Captured stderr output
 * @param start    - Unix timestamp (ms) when the test run started
 * @param stop     - Unix timestamp (ms) when the test run ended
 * @param stdout   - Captured stdout output (optional, preserved as-is)
 */
export function buildExitCodeReport(
  command: string,
  exitCode: number,
  stderr: string,
  start: number,
  stop: number,
  stdout?: string
): CtrfReport {
  const passed = exitCode === 0;
  const status: CtrfTestEntry['status'] = passed ? 'passed' : 'failed';
  const message = !passed && stderr ? stderr : undefined;

  const tests: CtrfTestEntry[] = [
    {
      name: command,
      status,
      duration: stop - start,
      message,
      stdout: stdout ? [stdout] : undefined,
    },
  ];

  return {
    ...baseReport(),
    results: {
      tool: { name: 'scaledtest-worker' },
      summary: buildSummary(tests, start, stop),
      tests,
    },
  };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/**
 * Parse test runner output according to the given format and return a CTRF report.
 *
 * @param format   - One of the REPORT_FORMAT constants (or a raw env-var string)
 * @param output   - Captured stdout from the test command
 * @param command  - The test command that was run (used in exit-code fallback)
 * @param exitCode - Process exit code
 * @param stderr   - Captured stderr output
 * @param start    - Unix timestamp (ms) for run start
 * @param stop     - Unix timestamp (ms) for run stop
 */
export function parseReport(
  format: string,
  output: string,
  command: string,
  exitCode: number,
  stderr: string,
  start: number,
  stop: number
): CtrfReport {
  switch (format) {
    case REPORT_FORMAT.JEST_JSON:
      return parseJestJson(output, start, stop);
    case REPORT_FORMAT.JUNIT_XML:
      return parseJunitXml(output, start, stop);
    case REPORT_FORMAT.CTRF_JSON:
      return parseCtrfJson(output);
    case REPORT_FORMAT.EXIT_CODE:
    default:
      // Preserve raw stdout in exit-code mode to match original worker behaviour
      return buildExitCodeReport(command, exitCode, stderr, start, stop, output || undefined);
  }
}
