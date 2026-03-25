package analytics

import (
	"testing"
)

// fixture builds a TestHistoryRow from a list of statuses for table-driven tests.
func fixture(name string, statuses []string) TestHistoryRow {
	var pass, fail int
	for _, s := range statuses {
		switch s {
		case "passed":
			pass++
		case "failed":
			fail++
		}
	}
	last := ""
	if len(statuses) > 0 {
		last = statuses[len(statuses)-1]
	}
	return TestHistoryRow{
		Name:       name,
		Statuses:   statuses,
		LastStatus: last,
		PassCount:  pass,
		FailCount:  fail,
		TotalRuns:  len(statuses),
	}
}

func TestBuildFlakinessSummaries_UnknownTestReturnsZeroHistory(t *testing.T) {
	query := HistoryQuery{
		TeamID:    "team-1",
		TestNames: []string{"unknown/test"},
	}
	summaries := BuildFlakinessSummaries(query, nil)

	if len(summaries) != 1 {
		t.Fatalf("len = %d, want 1", len(summaries))
	}
	s := summaries[0]
	if s.HasHistory {
		t.Error("HasHistory = true, want false for unknown test")
	}
	if s.TestName != "unknown/test" {
		t.Errorf("TestName = %q, want %q", s.TestName, "unknown/test")
	}
	if s.TotalRuns != 0 {
		t.Errorf("TotalRuns = %d, want 0", s.TotalRuns)
	}
	if s.FlakyScore != 0 {
		t.Errorf("FlakyScore = %f, want 0", s.FlakyScore)
	}
	if s.PassRate != 0 {
		t.Errorf("PassRate = %f, want 0", s.PassRate)
	}
}

func TestBuildFlakinessSummaries_StablePassingTest(t *testing.T) {
	query := HistoryQuery{
		TeamID:    "team-1",
		TestNames: []string{"suite/stable"},
	}
	rows := []TestHistoryRow{
		fixture("suite/stable", []string{"passed", "passed", "passed", "passed"}),
	}
	summaries := BuildFlakinessSummaries(query, rows)

	if len(summaries) != 1 {
		t.Fatalf("len = %d, want 1", len(summaries))
	}
	s := summaries[0]
	if !s.HasHistory {
		t.Error("HasHistory = false, want true")
	}
	if s.TotalRuns != 4 {
		t.Errorf("TotalRuns = %d, want 4", s.TotalRuns)
	}
	if s.PassCount != 4 {
		t.Errorf("PassCount = %d, want 4", s.PassCount)
	}
	if s.FailCount != 0 {
		t.Errorf("FailCount = %d, want 0", s.FailCount)
	}
	if s.PassRate != 100.0 {
		t.Errorf("PassRate = %f, want 100.0", s.PassRate)
	}
	if s.FailRate != 0.0 {
		t.Errorf("FailRate = %f, want 0.0", s.FailRate)
	}
	if s.FlakyScore != 0.0 {
		t.Errorf("FlakyScore = %f, want 0.0 for stable test", s.FlakyScore)
	}
	if s.FlipCount != 0 {
		t.Errorf("FlipCount = %d, want 0", s.FlipCount)
	}
	if s.LastStatus != "passed" {
		t.Errorf("LastStatus = %q, want %q", s.LastStatus, "passed")
	}
}

func TestBuildFlakinessSummaries_ConsistentlyFailingTest(t *testing.T) {
	query := HistoryQuery{
		TeamID:    "team-1",
		TestNames: []string{"suite/always-fails"},
	}
	rows := []TestHistoryRow{
		fixture("suite/always-fails", []string{"failed", "failed", "failed"}),
	}
	summaries := BuildFlakinessSummaries(query, rows)

	if len(summaries) != 1 {
		t.Fatalf("len = %d, want 1", len(summaries))
	}
	s := summaries[0]
	if !s.HasHistory {
		t.Error("HasHistory = false, want true")
	}
	if s.FlakyScore != 0.0 {
		// A consistently failing test is not flaky — it's a regression.
		t.Errorf("FlakyScore = %f, want 0.0 for consistently failing test", s.FlakyScore)
	}
	if s.PassRate != 0.0 {
		t.Errorf("PassRate = %f, want 0.0", s.PassRate)
	}
	if s.FailRate != 100.0 {
		t.Errorf("FailRate = %f, want 100.0", s.FailRate)
	}
}

func TestBuildFlakinessSummaries_MaximallyFlakyTest(t *testing.T) {
	// A test that alternates every run has the maximum flaky score.
	query := HistoryQuery{
		TeamID:    "team-1",
		TestNames: []string{"suite/alternating"},
	}
	rows := []TestHistoryRow{
		fixture("suite/alternating", []string{"passed", "failed", "passed", "failed"}),
	}
	summaries := BuildFlakinessSummaries(query, rows)

	if len(summaries) != 1 {
		t.Fatalf("len = %d, want 1", len(summaries))
	}
	s := summaries[0]
	if s.FlakyScore != 1.0 {
		t.Errorf("FlakyScore = %f, want 1.0 for fully alternating test", s.FlakyScore)
	}
	if s.FlipCount != 3 {
		t.Errorf("FlipCount = %d, want 3", s.FlipCount)
	}
}

func TestBuildFlakinessSummaries_PartiallyFlakyTest(t *testing.T) {
	// One flip in three runs: flipRate = 1/2 = 0.5.
	query := HistoryQuery{
		TeamID:    "team-1",
		TestNames: []string{"suite/partial"},
	}
	rows := []TestHistoryRow{
		fixture("suite/partial", []string{"passed", "passed", "failed"}),
	}
	summaries := BuildFlakinessSummaries(query, rows)

	if len(summaries) != 1 {
		t.Fatalf("len = %d, want 1", len(summaries))
	}
	s := summaries[0]
	if s.FlipCount != 1 {
		t.Errorf("FlipCount = %d, want 1", s.FlipCount)
	}
	const wantScore = 0.5
	if s.FlakyScore != wantScore {
		t.Errorf("FlakyScore = %f, want %f", s.FlakyScore, wantScore)
	}
}

func TestBuildFlakinessSummaries_MixedKnownAndUnknown(t *testing.T) {
	query := HistoryQuery{
		TeamID:    "team-1",
		TestNames: []string{"known/test", "new/test", "another/known"},
	}
	rows := []TestHistoryRow{
		fixture("known/test", []string{"passed", "failed", "passed"}),
		fixture("another/known", []string{"passed", "passed"}),
	}
	summaries := BuildFlakinessSummaries(query, rows)

	if len(summaries) != 3 {
		t.Fatalf("len = %d, want 3", len(summaries))
	}

	// Output is sorted by TestName.
	if summaries[0].TestName != "another/known" {
		t.Errorf("summaries[0].TestName = %q, want %q", summaries[0].TestName, "another/known")
	}
	if summaries[1].TestName != "known/test" {
		t.Errorf("summaries[1].TestName = %q, want %q", summaries[1].TestName, "known/test")
	}
	if summaries[2].TestName != "new/test" {
		t.Errorf("summaries[2].TestName = %q, want %q", summaries[2].TestName, "new/test")
	}

	// Known tests have history.
	if !summaries[0].HasHistory {
		t.Error("another/known: HasHistory = false, want true")
	}
	if !summaries[1].HasHistory {
		t.Error("known/test: HasHistory = false, want true")
	}

	// Unknown test has no history — not an error.
	if summaries[2].HasHistory {
		t.Error("new/test: HasHistory = true, want false")
	}
	if summaries[2].TotalRuns != 0 {
		t.Errorf("new/test: TotalRuns = %d, want 0", summaries[2].TotalRuns)
	}
}

func TestBuildFlakinessSummaries_OutputIsDeterministic(t *testing.T) {
	// Same input must always produce the same output, regardless of row order.
	query := HistoryQuery{
		TeamID:    "team-1",
		TestNames: []string{"c/test", "a/test", "b/test"},
	}
	rows := []TestHistoryRow{
		fixture("b/test", []string{"passed", "failed"}),
		fixture("a/test", []string{"passed", "passed"}),
		fixture("c/test", []string{"failed", "failed"}),
	}

	first := BuildFlakinessSummaries(query, rows)
	second := BuildFlakinessSummaries(query, rows)

	if len(first) != len(second) {
		t.Fatalf("len mismatch: %d vs %d", len(first), len(second))
	}
	for i := range first {
		if first[i].TestName != second[i].TestName {
			t.Errorf("[%d] TestName: %q != %q", i, first[i].TestName, second[i].TestName)
		}
		if first[i].FlakyScore != second[i].FlakyScore {
			t.Errorf("[%d] FlakyScore: %f != %f", i, first[i].FlakyScore, second[i].FlakyScore)
		}
	}

	// Verify sort order: a/test < b/test < c/test.
	if first[0].TestName != "a/test" || first[1].TestName != "b/test" || first[2].TestName != "c/test" {
		t.Errorf("want sorted order [a/test, b/test, c/test], got [%s, %s, %s]",
			first[0].TestName, first[1].TestName, first[2].TestName)
	}
}

func TestBuildFlakinessSummaries_EmptyTestNames(t *testing.T) {
	query := HistoryQuery{
		TeamID:    "team-1",
		TestNames: []string{},
	}
	summaries := BuildFlakinessSummaries(query, nil)
	if len(summaries) != 0 {
		t.Errorf("len = %d, want 0 for empty TestNames", len(summaries))
	}
}

func TestBuildFlakinessSummaries_SingleRunTest(t *testing.T) {
	// A test run only once cannot be flaky (no transitions to measure).
	query := HistoryQuery{
		TeamID:    "team-1",
		TestNames: []string{"suite/one-run"},
	}
	rows := []TestHistoryRow{
		fixture("suite/one-run", []string{"failed"}),
	}
	summaries := BuildFlakinessSummaries(query, rows)

	if len(summaries) != 1 {
		t.Fatalf("len = %d, want 1", len(summaries))
	}
	s := summaries[0]
	if s.FlakyScore != 0.0 {
		t.Errorf("FlakyScore = %f, want 0.0 for single-run test", s.FlakyScore)
	}
	if s.FlipCount != 0 {
		t.Errorf("FlipCount = %d, want 0 for single-run test", s.FlipCount)
	}
	if !s.HasHistory {
		t.Error("HasHistory = false, want true for single-run test")
	}
	if s.TotalRuns != 1 {
		t.Errorf("TotalRuns = %d, want 1", s.TotalRuns)
	}
}

func TestHistoryQuery_LookbackWindow_DefaultsToThirty(t *testing.T) {
	tests := []struct {
		name  string
		days  int
		want  int
	}{
		{"zero defaults to 30", 0, 30},
		{"negative defaults to 30", -1, 30},
		{"positive is preserved", 7, 7},
		{"large positive is preserved", 90, 90},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			q := HistoryQuery{LookbackDays: tt.days}
			if got := q.LookbackWindow(); got != tt.want {
				t.Errorf("LookbackWindow() = %d, want %d", got, tt.want)
			}
		})
	}
}
