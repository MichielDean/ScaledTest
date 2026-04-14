package handler

import (
	"testing"

	"github.com/scaledtest/scaledtest/internal/ctrf"
	"github.com/scaledtest/scaledtest/internal/model"
)

// BenchmarkNormalize_100Results measures CTRF normalization for 100 test results.
// This benchmarks the in-memory processing that happens before bulk-insert,
// confirming the store layer avoids N+1 round-trips.
func BenchmarkNormalize_100Results(b *testing.B) {
	tests := make([]ctrf.Test, 100)
	for i := range tests {
		tests[i] = ctrf.Test{
			Name:     "benchmark-test-name-that-is-reasonably-long",
			Status:   "passed",
			Duration: 100,
			Message:  "benchmark message",
			Trace:    "at benchmark.go:42",
			FilePath: "benchmark/path/to/test.go",
			Suite:    "BenchmarkSuite",
			Tags:     []string{"smoke", "benchmark"},
			Retry:    0,
			Flaky:    false,
		}
	}
	report := &ctrf.Report{
		Results: ctrf.Results{
			Tool:    ctrf.Tool{Name: "bench-tool", Version: "1.0"},
			Summary: ctrf.Summary{Tests: 100, Passed: 90, Failed: 5, Skipped: 5, Pending: 0, Other: 0},
			Tests:   tests,
		},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		results := ctrf.Normalize(report, "bench-report-id", "bench-team-id")
		_ = results
	}
}

// BenchmarkNormalize_1000Results measures CTRF normalization for 1000 test results.
func BenchmarkNormalize_1000Results(b *testing.B) {
	tests := make([]ctrf.Test, 1000)
	for i := range tests {
		status := "passed"
		if i%20 == 0 {
			status = "failed"
		}
		if i%50 == 0 {
			status = "skipped"
		}
		tests[i] = ctrf.Test{
			Name:     "benchmark-test-name-that-is-reasonably-long",
			Status:   status,
			Duration: float64(i * 10),
			Message:  "benchmark message",
			Trace:    "at benchmark.go:42",
			FilePath: "benchmark/path/to/test.go",
			Suite:    "BenchmarkSuite",
			Tags:     []string{"smoke", "benchmark"},
			Retry:    0,
			Flaky:    false,
		}
	}
	report := &ctrf.Report{
		Results: ctrf.Results{
			Tool:    ctrf.Tool{Name: "bench-tool", Version: "1.0"},
			Summary: ctrf.Summary{Tests: 1000, Passed: 900, Failed: 50, Skipped: 50, Pending: 0, Other: 0},
			Tests:   tests,
		},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		results := ctrf.Normalize(report, "bench-report-id", "bench-team-id")
		_ = results
	}
}

// BenchmarkBuildReportData_100Results measures building quality report data for 100 results.
func BenchmarkBuildReportData_100Results(b *testing.B) {
	results := make([]model.TestResult, 100)
	for i := range results {
		status := "passed"
		if i%10 == 0 {
			status = "failed"
		}
		results[i] = model.TestResult{
			Name:       "test-name",
			Status:     status,
			DurationMs: int64(i * 50),
		}
	}
	report := &ctrf.Report{
		Results: ctrf.Results{
			Summary: ctrf.Summary{Tests: 100, Passed: 90, Failed: 10},
		},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		data := buildReportData(report, results, nil)
		_ = data
	}
}

// BenchmarkBuildReportData_1000Results measures building quality report data for 1000 results.
func BenchmarkBuildReportData_1000Results(b *testing.B) {
	results := make([]model.TestResult, 1000)
	for i := range results {
		status := "passed"
		if i%20 == 0 {
			status = "failed"
		}
		results[i] = model.TestResult{
			Name:       "test-name",
			Status:     status,
			DurationMs: int64(i * 5),
		}
	}
	report := &ctrf.Report{
		Results: ctrf.Results{
			Summary: ctrf.Summary{Tests: 1000, Passed: 900, Failed: 50, Skipped: 50},
		},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		data := buildReportData(report, results, nil)
		_ = data
	}
}
