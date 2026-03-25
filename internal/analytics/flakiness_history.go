package analytics

import (
	"context"
	"sort"
)

// HistoryQuery defines the input parameters for a flakiness history lookup.
type HistoryQuery struct {
	TeamID       string
	TestNames    []string // test names to look up; empty returns empty result
	Branch       string   // optional: filter by CTRF environment.branch
	Repository   string   // optional: filter by CTRF environment.repository
	LookbackDays int      // look-back window in days; 0 or negative defaults to 30
}

// LookbackWindow returns the effective look-back window in days, applying the
// default of 30 when LookbackDays is zero or negative.
func (q HistoryQuery) LookbackWindow() int {
	if q.LookbackDays <= 0 {
		return 30
	}
	return q.LookbackDays
}

// TestHistoryRow is a single test's aggregated historical data as returned by
// the data layer. Statuses must be ordered oldest-to-newest.
type TestHistoryRow struct {
	Name       string
	Statuses   []string // ordered oldest→newest
	LastStatus string
	PassCount  int
	FailCount  int
	TotalRuns  int
}

// TestFlakinessSummary holds the computed flakiness history for a single test.
type TestFlakinessSummary struct {
	TestName   string  `json:"test_name"`
	TotalRuns  int     `json:"total_runs"`
	PassCount  int     `json:"pass_count"`
	FailCount  int     `json:"fail_count"`
	PassRate   float64 `json:"pass_rate"`   // percentage 0–100
	FailRate   float64 `json:"fail_rate"`   // percentage 0–100
	FlipCount  int     `json:"flip_count"`
	FlakyScore float64 `json:"flaky_score"` // 0–1; 0=stable, 1=alternates every run
	LastStatus string  `json:"last_status,omitempty"`
	HasHistory bool    `json:"has_history"` // false for unknown/new tests
}

// HistoryReader abstracts the data source for flakiness history queries.
// Use a DBHistoryReader in production; inject a stub for unit tests.
type HistoryReader interface {
	ReadHistory(ctx context.Context, q HistoryQuery) ([]TestHistoryRow, error)
}

// BuildFlakinessSummaries computes per-test flakiness summaries from raw history
// rows returned by a HistoryReader.
//
// Every name in query.TestNames appears in the returned slice. Names absent from
// rows are returned with HasHistory=false and zero metrics — unknown or new tests
// are not an error. The result is sorted by TestName for deterministic output.
func BuildFlakinessSummaries(query HistoryQuery, rows []TestHistoryRow) []TestFlakinessSummary {
	if len(query.TestNames) == 0 {
		return []TestFlakinessSummary{}
	}

	// Index rows by name for O(1) lookup.
	byName := make(map[string]TestHistoryRow, len(rows))
	for _, r := range rows {
		byName[r.Name] = r
	}

	summaries := make([]TestFlakinessSummary, 0, len(query.TestNames))
	for _, name := range query.TestNames {
		row, known := byName[name]
		if !known {
			summaries = append(summaries, TestFlakinessSummary{
				TestName:   name,
				HasHistory: false,
			})
			continue
		}

		flipCount, flakyScore := DetectFlaky(row.Statuses)
		summaries = append(summaries, TestFlakinessSummary{
			TestName:   name,
			TotalRuns:  row.TotalRuns,
			PassCount:  row.PassCount,
			FailCount:  row.FailCount,
			PassRate:   ComputePassRate(row.PassCount, row.TotalRuns),
			FailRate:   ComputePassRate(row.FailCount, row.TotalRuns),
			FlipCount:  flipCount,
			FlakyScore: flakyScore,
			LastStatus: row.LastStatus,
			HasHistory: true,
		})
	}

	// Sort by TestName for determinism regardless of input or row order.
	sort.Slice(summaries, func(i, j int) bool {
		return summaries[i].TestName < summaries[j].TestName
	})

	return summaries
}
