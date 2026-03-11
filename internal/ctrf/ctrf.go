package ctrf

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/scaledtest/scaledtest/internal/model"
)

// Report represents a CTRF (Common Test Results Format) JSON report.
type Report struct {
	ReportFormat string  `json:"reportFormat,omitempty"`
	SpecVersion  string  `json:"specVersion,omitempty"`
	Results      Results `json:"results"`
}

// Results is the top-level results object in a CTRF report.
type Results struct {
	Tool        Tool            `json:"tool"`
	Summary     Summary         `json:"summary"`
	Tests       []Test          `json:"tests"`
	Environment json.RawMessage `json:"environment,omitempty"`
}

// Tool identifies the test tool that produced the report.
type Tool struct {
	Name    string `json:"name"`
	Version string `json:"version,omitempty"`
}

// Summary contains aggregate test counts.
type Summary struct {
	Tests   int   `json:"tests"`
	Passed  int   `json:"passed"`
	Failed  int   `json:"failed"`
	Skipped int   `json:"skipped"`
	Pending int   `json:"pending"`
	Other   int   `json:"other"`
	Start   int64 `json:"start"`
	Stop    int64 `json:"stop"`
}

// Test represents an individual test result in the CTRF format.
type Test struct {
	Name     string   `json:"name"`
	Status   string   `json:"status"` // passed, failed, skipped, pending, other
	Duration float64  `json:"duration"`
	Message  string   `json:"message,omitempty"`
	Trace    string   `json:"trace,omitempty"`
	FilePath string   `json:"filePath,omitempty"`
	Suite    string   `json:"suite,omitempty"`
	Tags     []string `json:"tags,omitempty"`
	Retry    int      `json:"retry,omitempty"`
	Flaky    bool     `json:"flaky,omitempty"`
}

// ValidationResult holds validation errors and warnings separately.
type ValidationResult struct {
	Errors   []string `json:"errors,omitempty"`
	Warnings []string `json:"warnings,omitempty"`
}

// Valid returns true if there are no errors (warnings are acceptable).
func (v *ValidationResult) Valid() bool {
	return len(v.Errors) == 0
}

// CurrentSpecVersion is the latest supported CTRF spec version.
const CurrentSpecVersion = "0.0.1"

// SupportedSpecVersions lists all supported CTRF spec versions.
var SupportedSpecVersions = []string{"0.0.1"}

// Parse parses a raw CTRF JSON payload into a Report.
func Parse(data []byte) (*Report, error) {
	var report Report
	if err := json.Unmarshal(data, &report); err != nil {
		return nil, fmt.Errorf("parse CTRF JSON: %w", err)
	}
	return &report, nil
}

// Validate checks that a parsed CTRF report has required fields.
// Returns nil on success (for backward compatibility). Use ValidateDetailed
// for warnings.
func Validate(report *Report) error {
	result := ValidateDetailed(report)
	if !result.Valid() {
		return fmt.Errorf("%s", result.Errors[0])
	}
	return nil
}

// ValidateDetailed performs strict CTRF schema validation, returning both
// errors (which prevent ingestion) and warnings (informational).
func ValidateDetailed(report *Report) *ValidationResult {
	result := &ValidationResult{}

	// Required: tool.name
	if report.Results.Tool.Name == "" {
		result.Errors = append(result.Errors, "missing required field: results.tool.name")
	}

	// Required: at least one test
	if report.Results.Summary.Tests == 0 && len(report.Results.Tests) == 0 {
		result.Errors = append(result.Errors, "report has no tests: results.tests must contain at least one test entry")
	}

	// Validate individual tests
	validStatuses := map[string]bool{
		"passed": true, "failed": true, "skipped": true, "pending": true, "other": true,
	}
	for i, test := range report.Results.Tests {
		if test.Name == "" {
			result.Errors = append(result.Errors, fmt.Sprintf("test[%d]: missing required field: name", i))
		}
		if !validStatuses[test.Status] {
			result.Errors = append(result.Errors,
				fmt.Sprintf("test[%d] %q: invalid status %q (valid: passed, failed, skipped, pending, other)", i, test.Name, test.Status))
		}
		if test.Duration < 0 {
			result.Warnings = append(result.Warnings,
				fmt.Sprintf("test[%d] %q: negative duration %v", i, test.Name, test.Duration))
		}
	}

	// Warning: summary count mismatch
	if len(report.Results.Tests) > 0 && report.Results.Summary.Tests != len(report.Results.Tests) {
		result.Warnings = append(result.Warnings,
			fmt.Sprintf("summary.tests (%d) does not match actual test count (%d)",
				report.Results.Summary.Tests, len(report.Results.Tests)))
	}

	// Warning: summary status counts don't add up
	if len(report.Results.Tests) > 0 {
		statusCounts := map[string]int{}
		for _, t := range report.Results.Tests {
			statusCounts[t.Status]++
		}
		if c := statusCounts["passed"]; c != report.Results.Summary.Passed {
			result.Warnings = append(result.Warnings,
				fmt.Sprintf("summary.passed (%d) does not match actual passed count (%d)", report.Results.Summary.Passed, c))
		}
		if c := statusCounts["failed"]; c != report.Results.Summary.Failed {
			result.Warnings = append(result.Warnings,
				fmt.Sprintf("summary.failed (%d) does not match actual failed count (%d)", report.Results.Summary.Failed, c))
		}
	}

	// Version detection and compatibility
	if report.ReportFormat != "" && report.ReportFormat != "CTRF" {
		result.Warnings = append(result.Warnings,
			fmt.Sprintf("reportFormat is %q, expected \"CTRF\"", report.ReportFormat))
	}
	if report.SpecVersion != "" {
		supported := false
		for _, v := range SupportedSpecVersions {
			if v == report.SpecVersion {
				supported = true
				break
			}
		}
		if !supported {
			result.Warnings = append(result.Warnings,
				fmt.Sprintf("specVersion %q is not in supported versions %v; ingesting with best-effort compatibility",
					report.SpecVersion, SupportedSpecVersions))
		}
	}

	// Warning: timestamps look suspicious
	if report.Results.Summary.Start > 0 && report.Results.Summary.Stop > 0 {
		if report.Results.Summary.Stop < report.Results.Summary.Start {
			result.Warnings = append(result.Warnings, "summary.stop is before summary.start")
		}
	}

	return result
}

// Normalize extracts individual TestResult rows from a CTRF report for storage.
func Normalize(report *Report, reportID, teamID string) []model.TestResult {
	now := time.Now()
	results := make([]model.TestResult, 0, len(report.Results.Tests))

	for _, test := range report.Results.Tests {
		results = append(results, model.TestResult{
			ReportID:   reportID,
			TeamID:     teamID,
			Name:       test.Name,
			Status:     test.Status,
			DurationMs: int64(test.Duration),
			Message:    test.Message,
			Trace:      test.Trace,
			FilePath:   test.FilePath,
			Suite:      test.Suite,
			Tags:       test.Tags,
			Retry:      test.Retry,
			Flaky:      test.Flaky,
			CreatedAt:  now,
		})
	}

	return results
}

// SummaryJSON returns the summary as a JSON-encoded byte slice for database storage.
func SummaryJSON(s Summary) (json.RawMessage, error) {
	return json.Marshal(s)
}
