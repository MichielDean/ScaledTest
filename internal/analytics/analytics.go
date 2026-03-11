package analytics

import "time"

// TrendPoint represents a single data point in a pass/fail trend over time.
type TrendPoint struct {
	Date    time.Time `json:"date"`
	Total   int       `json:"total"`
	Passed  int       `json:"passed"`
	Failed  int       `json:"failed"`
	Skipped int       `json:"skipped"`
	PassRate float64  `json:"pass_rate"`
}

// FlakyTest represents a test detected as flaky (alternating pass/fail).
type FlakyTest struct {
	Name       string  `json:"name"`
	Suite      string  `json:"suite,omitempty"`
	FilePath   string  `json:"file_path,omitempty"`
	FlipCount  int     `json:"flip_count"`  // Number of status changes
	TotalRuns  int     `json:"total_runs"`
	FlipRate   float64 `json:"flip_rate"`   // flip_count / total_runs
	LastStatus string  `json:"last_status"`
}

// ErrorCluster groups similar error messages.
type ErrorCluster struct {
	Message    string `json:"message"`
	Count      int    `json:"count"`
	TestNames  []string `json:"test_names"`
	FirstSeen  time.Time `json:"first_seen"`
	LastSeen   time.Time `json:"last_seen"`
}

// DurationBucket represents a bucket in a duration distribution histogram.
type DurationBucket struct {
	RangeLabel string `json:"range_label"` // e.g., "0-100ms", "100-500ms"
	MinMs      int64  `json:"min_ms"`
	MaxMs      int64  `json:"max_ms"`
	Count      int    `json:"count"`
}

// DurationStats holds aggregate duration statistics.
type DurationStats struct {
	Mean         float64          `json:"mean_ms"`
	Median       float64          `json:"median_ms"`
	P95          float64          `json:"p95_ms"`
	P99          float64          `json:"p99_ms"`
	Min          int64            `json:"min_ms"`
	Max          int64            `json:"max_ms"`
	Distribution []DurationBucket `json:"distribution"`
}

// TrendQuery defines the parameters for a trend query.
type TrendQuery struct {
	TeamID    string
	StartDate time.Time
	EndDate   time.Time
	GroupBy   string // "day", "week", "month"
}

// FlakyQuery defines the parameters for flaky test detection.
type FlakyQuery struct {
	TeamID    string
	Window    time.Duration // Look-back window (e.g., 7 days)
	MinRuns   int           // Minimum runs to consider (default: 5)
	Limit     int           // Max results
}

// ComputePassRate calculates the pass rate from counts.
func ComputePassRate(passed, total int) float64 {
	if total == 0 {
		return 0
	}
	return float64(passed) / float64(total) * 100
}

// DetectFlaky analyzes a sequence of test statuses to determine flakiness.
// A test is flaky if its status changes (flips) between consecutive runs.
func DetectFlaky(statuses []string) (flipCount int, flipRate float64) {
	if len(statuses) < 2 {
		return 0, 0
	}

	for i := 1; i < len(statuses); i++ {
		if statuses[i] != statuses[i-1] {
			flipCount++
		}
	}

	flipRate = float64(flipCount) / float64(len(statuses)-1)
	return flipCount, flipRate
}

// DefaultDurationBuckets returns the default histogram buckets for duration distribution.
func DefaultDurationBuckets() []DurationBucket {
	return []DurationBucket{
		{RangeLabel: "0-100ms", MinMs: 0, MaxMs: 100},
		{RangeLabel: "100-500ms", MinMs: 100, MaxMs: 500},
		{RangeLabel: "500ms-1s", MinMs: 500, MaxMs: 1000},
		{RangeLabel: "1-5s", MinMs: 1000, MaxMs: 5000},
		{RangeLabel: "5-30s", MinMs: 5000, MaxMs: 30000},
		{RangeLabel: "30s-2m", MinMs: 30000, MaxMs: 120000},
		{RangeLabel: ">2m", MinMs: 120000, MaxMs: 1<<62},
	}
}

// BucketDuration places a duration (in ms) into the appropriate bucket.
func BucketDuration(durationMs int64, buckets []DurationBucket) int {
	for i, b := range buckets {
		if durationMs >= b.MinMs && durationMs < b.MaxMs {
			return i
		}
	}
	return len(buckets) - 1 // overflow into last bucket
}
