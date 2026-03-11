package ctrf

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"regexp"
	"strings"
	"time"
)

// InputFormat identifies the detected test report format.
type InputFormat string

const (
	FormatCTRF    InputFormat = "ctrf"
	FormatJUnit   InputFormat = "junit"
	FormatJestJSON InputFormat = "jest-json"
	FormatXUnit   InputFormat = "xunit"
	FormatTAP     InputFormat = "tap"
	FormatUnknown InputFormat = "unknown"
)

// DetectFormat examines raw bytes and returns the detected format.
func DetectFormat(data []byte) InputFormat {
	trimmed := strings.TrimSpace(string(data))

	// TAP: starts with "TAP version" or "1..N"
	if strings.HasPrefix(trimmed, "TAP version") || regexp.MustCompile(`^1\.\.\d+`).MatchString(trimmed) {
		return FormatTAP
	}

	// XML-based formats
	if strings.HasPrefix(trimmed, "<?xml") || strings.HasPrefix(trimmed, "<") {
		if strings.Contains(trimmed, "<testsuites") || strings.Contains(trimmed, "<testsuite") {
			// Distinguish JUnit from xUnit by looking for xUnit-specific elements
			if strings.Contains(trimmed, "<assembly") || strings.Contains(trimmed, "<collection") {
				return FormatXUnit
			}
			return FormatJUnit
		}
		if strings.Contains(trimmed, "<assemblies") || strings.Contains(trimmed, "<assembly") {
			return FormatXUnit
		}
	}

	// JSON-based formats
	if strings.HasPrefix(trimmed, "{") {
		var probe map[string]json.RawMessage
		if json.Unmarshal(data, &probe) == nil {
			// CTRF: has "results" with "tool" and "tests"
			if _, ok := probe["results"]; ok {
				return FormatCTRF
			}
			// Jest JSON: has "testResults" array and "numTotalTests"
			if _, ok := probe["testResults"]; ok {
				return FormatJestJSON
			}
		}
	}

	return FormatUnknown
}

// ConvertResult wraps a converted CTRF report with metadata about the conversion.
type ConvertResult struct {
	Report       *Report
	SourceFormat InputFormat
	Warnings     []string
}

// ConvertToCTRF auto-detects the input format and converts to CTRF.
// Returns the CTRF report plus any conversion warnings.
func ConvertToCTRF(data []byte) (*ConvertResult, error) {
	format := DetectFormat(data)

	switch format {
	case FormatCTRF:
		report, err := Parse(data)
		if err != nil {
			return nil, err
		}
		return &ConvertResult{Report: report, SourceFormat: FormatCTRF}, nil

	case FormatJUnit:
		return convertJUnit(data)

	case FormatJestJSON:
		return convertJestJSON(data)

	case FormatXUnit:
		return convertXUnit(data)

	case FormatTAP:
		return convertTAP(data)

	default:
		// Try CTRF parse as fallback
		report, err := Parse(data)
		if err != nil {
			return nil, fmt.Errorf("unrecognized format: not valid CTRF JSON, JUnit XML, Jest JSON, xUnit XML, or TAP")
		}
		return &ConvertResult{
			Report:       report,
			SourceFormat: FormatCTRF,
			Warnings:     []string{"format auto-detected as CTRF (no explicit format markers found)"},
		}, nil
	}
}

// --- JUnit XML ---

type junitTestSuites struct {
	XMLName    xml.Name         `xml:"testsuites"`
	Suites     []junitTestSuite `xml:"testsuite"`
	Tests      int              `xml:"tests,attr"`
	Failures   int              `xml:"failures,attr"`
	Errors     int              `xml:"errors,attr"`
	Skipped    int              `xml:"skipped,attr"`
	Time       float64          `xml:"time,attr"`
}

type junitTestSuite struct {
	XMLName   xml.Name        `xml:"testsuite"`
	Name      string          `xml:"name,attr"`
	Tests     int             `xml:"tests,attr"`
	Failures  int             `xml:"failures,attr"`
	Errors    int             `xml:"errors,attr"`
	Skipped   int             `xml:"skipped,attr"`
	Time      float64         `xml:"time,attr"`
	Timestamp string          `xml:"timestamp,attr"`
	TestCases []junitTestCase `xml:"testcase"`
}

type junitTestCase struct {
	Name      string        `xml:"name,attr"`
	ClassName string        `xml:"classname,attr"`
	Time      float64       `xml:"time,attr"`
	Failure   *junitFailure `xml:"failure"`
	Error     *junitError   `xml:"error"`
	Skipped   *junitSkipped `xml:"skipped"`
}

type junitFailure struct {
	Message string `xml:"message,attr"`
	Type    string `xml:"type,attr"`
	Body    string `xml:",chardata"`
}

type junitError struct {
	Message string `xml:"message,attr"`
	Type    string `xml:"type,attr"`
	Body    string `xml:",chardata"`
}

type junitSkipped struct {
	Message string `xml:"message,attr"`
}

func convertJUnit(data []byte) (*ConvertResult, error) {
	var warnings []string

	// Try parsing as <testsuites> first, then as single <testsuite>
	var suites []junitTestSuite

	var testSuites junitTestSuites
	if err := xml.Unmarshal(data, &testSuites); err == nil && len(testSuites.Suites) > 0 {
		suites = testSuites.Suites
	} else {
		var single junitTestSuite
		if err := xml.Unmarshal(data, &single); err != nil {
			return nil, fmt.Errorf("invalid JUnit XML: %w", err)
		}
		suites = []junitTestSuite{single}
	}

	var tests []Test
	passed, failed, skipped, errored := 0, 0, 0, 0

	for _, suite := range suites {
		for _, tc := range suite.TestCases {
			t := Test{
				Name:     tc.Name,
				Duration: tc.Time * 1000, // seconds to ms
				Suite:    suite.Name,
			}
			if tc.ClassName != "" {
				t.FilePath = tc.ClassName
			}

			switch {
			case tc.Failure != nil:
				t.Status = "failed"
				t.Message = tc.Failure.Message
				t.Trace = tc.Failure.Body
				failed++
			case tc.Error != nil:
				t.Status = "failed"
				t.Message = tc.Error.Message
				t.Trace = tc.Error.Body
				errored++
			case tc.Skipped != nil:
				t.Status = "skipped"
				t.Message = tc.Skipped.Message
				skipped++
			default:
				t.Status = "passed"
				passed++
			}
			tests = append(tests, t)
		}
	}

	if errored > 0 {
		warnings = append(warnings, fmt.Sprintf("converted %d JUnit <error> elements to CTRF 'failed' status", errored))
	}

	report := &Report{
		ReportFormat: "CTRF",
		SpecVersion:  CurrentSpecVersion,
		Results: Results{
			Tool: Tool{Name: "junit-import"},
			Summary: Summary{
				Tests:   len(tests),
				Passed:  passed,
				Failed:  failed + errored,
				Skipped: skipped,
			},
			Tests: tests,
		},
	}

	warnings = append(warnings, "converted from JUnit XML to CTRF format")
	return &ConvertResult{Report: report, SourceFormat: FormatJUnit, Warnings: warnings}, nil
}

// --- Jest JSON ---

type jestReport struct {
	NumTotalTests  int               `json:"numTotalTests"`
	NumPassedTests int               `json:"numPassedTests"`
	NumFailedTests int               `json:"numFailedTests"`
	NumPendingTests int              `json:"numPendingTests"`
	TestResults    []jestTestResult  `json:"testResults"`
	StartTime      int64             `json:"startTime"`
}

type jestTestResult struct {
	TestFilePath     string          `json:"testFilePath"`
	AssertionResults []jestAssertion `json:"assertionResults"`
}

type jestAssertion struct {
	FullName        string   `json:"fullName"`
	Title           string   `json:"title"`
	AncestorTitles  []string `json:"ancestorTitles"`
	Status          string   `json:"status"`
	Duration        *int     `json:"duration"`
	FailureMessages []string `json:"failureMessages"`
}

func convertJestJSON(data []byte) (*ConvertResult, error) {
	var jest jestReport
	if err := json.Unmarshal(data, &jest); err != nil {
		return nil, fmt.Errorf("invalid Jest JSON: %w", err)
	}

	var tests []Test
	passed, failed, skipped, pending := 0, 0, 0, 0
	var warnings []string

	for _, tr := range jest.TestResults {
		for _, a := range tr.AssertionResults {
			name := a.FullName
			if name == "" {
				name = a.Title
			}

			t := Test{
				Name:     name,
				FilePath: tr.TestFilePath,
			}
			if len(a.AncestorTitles) > 0 {
				t.Suite = strings.Join(a.AncestorTitles, " > ")
			}
			if a.Duration != nil {
				t.Duration = float64(*a.Duration)
			}

			switch a.Status {
			case "passed":
				t.Status = "passed"
				passed++
			case "failed":
				t.Status = "failed"
				if len(a.FailureMessages) > 0 {
					t.Message = a.FailureMessages[0]
					if len(a.FailureMessages) > 1 {
						t.Trace = strings.Join(a.FailureMessages, "\n---\n")
					}
				}
				failed++
			case "pending", "todo":
				t.Status = "pending"
				pending++
			case "skipped", "disabled":
				t.Status = "skipped"
				skipped++
			default:
				t.Status = "other"
				warnings = append(warnings, fmt.Sprintf("unknown Jest status %q for test %q mapped to 'other'", a.Status, name))
			}
			tests = append(tests, t)
		}
	}

	report := &Report{
		ReportFormat: "CTRF",
		SpecVersion:  CurrentSpecVersion,
		Results: Results{
			Tool: Tool{Name: "jest-import"},
			Summary: Summary{
				Tests:   len(tests),
				Passed:  passed,
				Failed:  failed,
				Skipped: skipped,
				Pending: pending,
				Start:   jest.StartTime,
			},
			Tests: tests,
		},
	}

	warnings = append(warnings, "converted from Jest JSON to CTRF format")
	return &ConvertResult{Report: report, SourceFormat: FormatJestJSON, Warnings: warnings}, nil
}

// --- xUnit XML ---

type xunitAssemblies struct {
	XMLName    xml.Name         `xml:"assemblies"`
	Assemblies []xunitAssembly  `xml:"assembly"`
}

type xunitAssembly struct {
	XMLName     xml.Name           `xml:"assembly"`
	Name        string             `xml:"name,attr"`
	Total       int                `xml:"total,attr"`
	Passed      int                `xml:"passed,attr"`
	Failed      int                `xml:"failed,attr"`
	Skipped     int                `xml:"skipped,attr"`
	Errors      int                `xml:"errors,attr"`
	Time        float64            `xml:"time,attr"`
	Collections []xunitCollection  `xml:"collection"`
}

type xunitCollection struct {
	Name      string          `xml:"name,attr"`
	Total     int             `xml:"total,attr"`
	Passed    int             `xml:"passed,attr"`
	Failed    int             `xml:"failed,attr"`
	Skipped   int             `xml:"skipped,attr"`
	Time      float64         `xml:"time,attr"`
	Tests     []xunitTest     `xml:"test"`
}

type xunitTest struct {
	Name    string        `xml:"name,attr"`
	Type    string        `xml:"type,attr"`
	Method  string        `xml:"method,attr"`
	Time    float64       `xml:"time,attr"`
	Result  string        `xml:"result,attr"`
	Failure *xunitFailure `xml:"failure"`
	Reason  *xunitReason  `xml:"reason"`
}

type xunitFailure struct {
	ExceptionType string `xml:"exception-type,attr"`
	Message       struct {
		Body string `xml:",chardata"`
	} `xml:"message"`
	StackTrace struct {
		Body string `xml:",chardata"`
	} `xml:"stack-trace"`
}

type xunitReason struct {
	Body string `xml:",chardata"`
}

func convertXUnit(data []byte) (*ConvertResult, error) {
	var assemblies xunitAssemblies
	if err := xml.Unmarshal(data, &assemblies); err != nil {
		// Try as single assembly
		var single xunitAssembly
		if err2 := xml.Unmarshal(data, &single); err2 != nil {
			return nil, fmt.Errorf("invalid xUnit XML: %w", err)
		}
		assemblies.Assemblies = []xunitAssembly{single}
	}

	var tests []Test
	passed, failed, skipped := 0, 0, 0
	var warnings []string

	for _, asm := range assemblies.Assemblies {
		for _, coll := range asm.Collections {
			for _, xt := range coll.Tests {
				t := Test{
					Name:     xt.Name,
					Duration: xt.Time * 1000,
					Suite:    coll.Name,
					FilePath: xt.Type,
				}

				switch xt.Result {
				case "Pass":
					t.Status = "passed"
					passed++
				case "Fail":
					t.Status = "failed"
					failed++
					if xt.Failure != nil {
						t.Message = xt.Failure.Message.Body
						t.Trace = xt.Failure.StackTrace.Body
					}
				case "Skip":
					t.Status = "skipped"
					skipped++
					if xt.Reason != nil {
						t.Message = xt.Reason.Body
					}
				default:
					t.Status = "other"
					warnings = append(warnings, fmt.Sprintf("unknown xUnit result %q for test %q", xt.Result, xt.Name))
				}
				tests = append(tests, t)
			}
		}
	}

	report := &Report{
		ReportFormat: "CTRF",
		SpecVersion:  CurrentSpecVersion,
		Results: Results{
			Tool: Tool{Name: "xunit-import"},
			Summary: Summary{
				Tests:   len(tests),
				Passed:  passed,
				Failed:  failed,
				Skipped: skipped,
			},
			Tests: tests,
		},
	}

	warnings = append(warnings, "converted from xUnit XML to CTRF format")
	return &ConvertResult{Report: report, SourceFormat: FormatXUnit, Warnings: warnings}, nil
}

// --- TAP (Test Anything Protocol) ---

var tapVersionRe = regexp.MustCompile(`^TAP version (\d+)`)
var tapPlanRe = regexp.MustCompile(`^1\.\.(\d+)`)
var tapResultRe = regexp.MustCompile(`^(ok|not ok)\s+(\d+)?\s*-?\s*(.*)`)
var tapDirectiveRe = regexp.MustCompile(`#\s*(SKIP|TODO)\b\s*(.*)`)

func convertTAP(data []byte) (*ConvertResult, error) {
	lines := strings.Split(string(data), "\n")
	var tests []Test
	passed, failed, skipped := 0, 0, 0
	var warnings []string
	now := time.Now().UnixMilli()

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || tapVersionRe.MatchString(line) || tapPlanRe.MatchString(line) {
			continue
		}
		if strings.HasPrefix(line, "#") {
			continue // diagnostic line
		}

		m := tapResultRe.FindStringSubmatch(line)
		if m == nil {
			continue
		}

		ok := m[1] == "ok"
		name := strings.TrimSpace(m[3])

		t := Test{Name: name}

		// Check for SKIP/TODO directives
		if dm := tapDirectiveRe.FindStringSubmatch(name); dm != nil {
			directive := strings.ToUpper(dm[1])
			reason := strings.TrimSpace(dm[2])
			// Strip directive from name
			idx := strings.Index(name, "#")
			if idx > 0 {
				t.Name = strings.TrimSpace(name[:idx])
			}

			switch directive {
			case "SKIP":
				t.Status = "skipped"
				t.Message = reason
				skipped++
			case "TODO":
				t.Status = "pending"
				t.Message = reason
				// TODO tests that pass are still pending in CTRF
			}
		} else if ok {
			t.Status = "passed"
			passed++
		} else {
			t.Status = "failed"
			failed++
		}

		if t.Name == "" {
			t.Name = fmt.Sprintf("test %s", m[2])
		}

		tests = append(tests, t)
	}

	if len(tests) == 0 {
		return nil, fmt.Errorf("TAP input produced no test results")
	}

	report := &Report{
		ReportFormat: "CTRF",
		SpecVersion:  CurrentSpecVersion,
		Results: Results{
			Tool: Tool{Name: "tap-import"},
			Summary: Summary{
				Tests:   len(tests),
				Passed:  passed,
				Failed:  failed,
				Skipped: skipped,
				Start:   now,
				Stop:    now,
			},
			Tests: tests,
		},
	}

	warnings = append(warnings, "converted from TAP to CTRF format; durations unavailable in TAP output")
	return &ConvertResult{Report: report, SourceFormat: FormatTAP, Warnings: warnings}, nil
}
