package ctrf

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/scaledtest/scaledtest/internal/model"
	"github.com/scaledtest/scaledtest/internal/sanitize"
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

const (
	// MaxTests is the maximum number of tests allowed in a single report.
	MaxTests = 100000
	// MaxTestNameLen is the maximum length for a test name.
	MaxTestNameLen = 2000
	// MaxMessageLen is the maximum length for a test message or trace.
	MaxMessageLen = 10000
	// MaxToolNameLen is the maximum length for a tool name.
	MaxToolNameLen = 500
)

// Validate checks that a parsed CTRF report has required fields and enforces size limits.
func Validate(report *Report) error {
	if report.Results.Tool.Name == "" {
		return fmt.Errorf("missing required field: results.tool.name")
	}
	if len(report.Results.Tool.Name) > MaxToolNameLen {
		return fmt.Errorf("results.tool.name exceeds maximum length of %d characters", MaxToolNameLen)
	}
	if report.Results.Summary.Tests == 0 && len(report.Results.Tests) == 0 {
		return fmt.Errorf("report has no tests")
	}
	if len(report.Results.Tests) > MaxTests {
		return fmt.Errorf("report contains %d tests, maximum is %d", len(report.Results.Tests), MaxTests)
	}

	validStatuses := map[string]bool{
		"passed": true, "failed": true, "skipped": true, "pending": true, "other": true,
	}
	for i, test := range report.Results.Tests {
		if test.Name == "" {
			return fmt.Errorf("test[%d]: missing required field: name", i)
		}
		if len(test.Name) > MaxTestNameLen {
			return fmt.Errorf("test[%d]: name exceeds maximum length of %d characters", i, MaxTestNameLen)
		}
		if !validStatuses[test.Status] {
			return fmt.Errorf("test[%d] %q: invalid status %q", i, test.Name, test.Status)
		}
		if len(test.Message) > MaxMessageLen {
			return fmt.Errorf("test[%d] %q: message exceeds maximum length of %d characters", i, test.Name, MaxMessageLen)
		}
		if len(test.Trace) > MaxMessageLen {
			return fmt.Errorf("test[%d] %q: trace exceeds maximum length of %d characters", i, test.Name, MaxMessageLen)
		}
	}

	// Verify summary counts match actual tests (warning, not error)
	if report.Results.Summary.Tests != len(report.Results.Tests) && len(report.Results.Tests) > 0 {
		// Allow mismatch — some reporters set summary independently
	}

	return nil
}

// Sanitize applies HTML escaping to all user-controlled string fields in a CTRF report
// to prevent stored XSS. Call this after validation and before storage.
func Sanitize(report *Report) {
	report.Results.Tool.Name = sanitize.String(report.Results.Tool.Name)
	report.Results.Tool.Version = sanitize.String(report.Results.Tool.Version)
	for i := range report.Results.Tests {
		report.Results.Tests[i].Name = sanitize.String(report.Results.Tests[i].Name)
		report.Results.Tests[i].Message = sanitize.String(report.Results.Tests[i].Message)
		report.Results.Tests[i].Trace = sanitize.String(report.Results.Tests[i].Trace)
		report.Results.Tests[i].Suite = sanitize.String(report.Results.Tests[i].Suite)
		report.Results.Tests[i].FilePath = sanitize.String(report.Results.Tests[i].FilePath)
		report.Results.Tests[i].Tags = sanitize.StringSlice(report.Results.Tests[i].Tags)
	}
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
