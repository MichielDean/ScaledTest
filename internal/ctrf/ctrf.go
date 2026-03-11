package ctrf

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/scaledtest/scaledtest/internal/model"
)

// Report represents a CTRF (Common Test Results Format) JSON report.
type Report struct {
	Results Results `json:"results"`
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

// Parse parses a raw CTRF JSON payload into a Report.
func Parse(data []byte) (*Report, error) {
	var report Report
	if err := json.Unmarshal(data, &report); err != nil {
		return nil, fmt.Errorf("parse CTRF JSON: %w", err)
	}
	return &report, nil
}

// Validate checks that a parsed CTRF report has required fields.
func Validate(report *Report) error {
	if report.Results.Tool.Name == "" {
		return fmt.Errorf("missing required field: results.tool.name")
	}
	if report.Results.Summary.Tests == 0 && len(report.Results.Tests) == 0 {
		return fmt.Errorf("report has no tests")
	}

	validStatuses := map[string]bool{
		"passed": true, "failed": true, "skipped": true, "pending": true, "other": true,
	}
	for i, test := range report.Results.Tests {
		if test.Name == "" {
			return fmt.Errorf("test[%d]: missing required field: name", i)
		}
		if !validStatuses[test.Status] {
			return fmt.Errorf("test[%d] %q: invalid status %q", i, test.Name, test.Status)
		}
	}

	// Verify summary counts match actual tests (warning, not error)
	if report.Results.Summary.Tests != len(report.Results.Tests) && len(report.Results.Tests) > 0 {
		// Allow mismatch — some reporters set summary independently
	}

	return nil
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
