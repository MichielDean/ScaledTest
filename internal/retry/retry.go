// Package retry provides test retry logic and flaky test detection.
package retry

import (
	"github.com/scaledtest/scaledtest/internal/analytics"
	"github.com/scaledtest/scaledtest/internal/model"
)

// DefaultMaxRetries is the default maximum retry count when retries are enabled.
const DefaultMaxRetries = 3

// MaxAllowedRetries is the absolute ceiling to prevent runaway retries.
const MaxAllowedRetries = 10

// ClampRetries ensures max_retries is within valid bounds.
func ClampRetries(n int) int {
	if n < 0 {
		return 0
	}
	if n > MaxAllowedRetries {
		return MaxAllowedRetries
	}
	return n
}

// ClassifyResult determines if a test result indicates flakiness based on
// its retry count and final status. A test is flaky if it was retried
// (retry > 0) and ultimately passed.
func ClassifyResult(result *model.TestResult) bool {
	return result.Retry > 0 && result.Status == "passed"
}

// DetectFlakyTests analyzes a set of test results and returns tests that
// appear flaky. It uses the analytics.DetectFlaky function to compute
// flip counts across historical statuses.
func DetectFlakyTests(results []model.TestResult, minFlips int) []analytics.FlakyTest {
	// Group results by test name
	byName := make(map[string][]model.TestResult)
	for i := range results {
		byName[results[i].Name] = append(byName[results[i].Name], results[i])
	}

	var flaky []analytics.FlakyTest
	for name, runs := range byName {
		if len(runs) < 2 {
			continue
		}

		statuses := make([]string, len(runs))
		for i, r := range runs {
			statuses[i] = r.Status
		}

		flipCount, flipRate := analytics.DetectFlaky(statuses)
		if flipCount < minFlips {
			continue
		}

		ft := analytics.FlakyTest{
			Name:       name,
			FlipCount:  flipCount,
			TotalRuns:  len(runs),
			FlipRate:   flipRate,
			LastStatus: runs[len(runs)-1].Status,
		}
		// Use metadata from the most recent run
		latest := runs[len(runs)-1]
		ft.Suite = latest.Suite
		ft.FilePath = latest.FilePath

		flaky = append(flaky, ft)
	}

	return flaky
}

// ShouldQuarantine determines if a test should be auto-quarantined based on
// its flakiness metrics and the team's retry configuration.
func ShouldQuarantine(flipCount, totalRuns int, flipRate float64) bool {
	// Require minimum 5 runs and flip rate > 30% to auto-quarantine
	if totalRuns < 5 {
		return false
	}
	return flipRate > 0.3 && flipCount >= 3
}

// FilterQuarantined filters a list of test names against quarantined tests,
// returning the names that are currently quarantined and should be skipped.
func FilterQuarantined(testNames []string, quarantined map[string]bool) []string {
	var skip []string
	for _, name := range testNames {
		if quarantined[name] {
			skip = append(skip, name)
		}
	}
	return skip
}
