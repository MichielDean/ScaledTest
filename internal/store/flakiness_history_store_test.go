//go:build integration

package store_test

import (
	"context"
	"testing"
	"time"

	"github.com/scaledtest/scaledtest/internal/analytics"
	"github.com/scaledtest/scaledtest/internal/integration"
	"github.com/scaledtest/scaledtest/internal/store"
)

// insertTestReport inserts a test_reports row with the given JSONB environment
// string and returns the new row's UUID.
func insertTestReport(t *testing.T, tdb *integration.TestDB, teamID, environment string) string {
	t.Helper()
	ctx := context.Background()
	var id string
	err := tdb.Pool.QueryRow(ctx,
		`INSERT INTO test_reports (team_id, tool_name, summary, raw, environment, created_at)
		 VALUES ($1, 'jest', '{}', '{}', $2::jsonb, now()) RETURNING id`,
		teamID, environment,
	).Scan(&id)
	if err != nil {
		t.Fatalf("insertTestReport: %v", err)
	}
	return id
}

// insertTestResult inserts a test_results row with an explicit created_at.
func insertTestResult(t *testing.T, tdb *integration.TestDB, reportID, teamID, name, status string, createdAt time.Time) {
	t.Helper()
	ctx := context.Background()
	_, err := tdb.Pool.Exec(ctx,
		`INSERT INTO test_results (report_id, team_id, name, status, created_at)
		 VALUES ($1, $2, $3, $4, $5)`,
		reportID, teamID, name, status, createdAt,
	)
	if err != nil {
		t.Fatalf("insertTestResult: %v", err)
	}
}

// TestDBHistoryReader_ReadHistory_BasicTeamScoped verifies that results are
// returned only for the queried team and aggregate pass/fail counts correctly.
func TestDBHistoryReader_ReadHistory_BasicTeamScoped(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamA := tdb.CreateTeam(t, "hist-team-a")
	teamB := tdb.CreateTeam(t, "hist-team-b")
	r := store.NewDBHistoryReader(tdb.Pool)

	now := time.Now()
	reportA := insertTestReport(t, tdb, teamA, "{}")
	insertTestResult(t, tdb, reportA, teamA, "TestFoo", "passed", now.Add(-3*time.Hour))
	insertTestResult(t, tdb, reportA, teamA, "TestFoo", "passed", now.Add(-2*time.Hour))
	insertTestResult(t, tdb, reportA, teamA, "TestFoo", "failed", now.Add(-1*time.Hour))

	// team B has a result for the same test name — must not appear in team A's query
	reportB := insertTestReport(t, tdb, teamB, "{}")
	insertTestResult(t, tdb, reportB, teamB, "TestFoo", "passed", now.Add(-30*time.Minute))

	rows, err := r.ReadHistory(ctx, analytics.HistoryQuery{
		TeamID:    teamA,
		TestNames: []string{"TestFoo"},
	})
	if err != nil {
		t.Fatalf("ReadHistory: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("len(rows) = %d, want 1", len(rows))
	}
	got := rows[0]
	if got.Name != "TestFoo" {
		t.Errorf("Name = %q, want %q", got.Name, "TestFoo")
	}
	if got.TotalRuns != 3 {
		t.Errorf("TotalRuns = %d, want 3", got.TotalRuns)
	}
	if got.PassCount != 2 {
		t.Errorf("PassCount = %d, want 2", got.PassCount)
	}
	if got.FailCount != 1 {
		t.Errorf("FailCount = %d, want 1", got.FailCount)
	}
	if got.LastStatus != "failed" {
		t.Errorf("LastStatus = %q, want %q", got.LastStatus, "failed")
	}
}

// TestDBHistoryReader_ReadHistory_BranchAndRepositoryFiltering verifies the
// conditional JOIN path: when Branch or Repository is set, only results from
// reports whose environment JSONB matches the filter are returned.
func TestDBHistoryReader_ReadHistory_BranchAndRepositoryFiltering(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "hist-branch-team")
	r := store.NewDBHistoryReader(tdb.Pool)

	now := time.Now()
	// Two runs on "main" branch
	reportMain := insertTestReport(t, tdb, teamID, `{"branch":"main","repository":"myrepo"}`)
	insertTestResult(t, tdb, reportMain, teamID, "TestBar", "passed", now.Add(-3*time.Hour))
	insertTestResult(t, tdb, reportMain, teamID, "TestBar", "passed", now.Add(-2*time.Hour))

	// One run on "feature" branch
	reportFeature := insertTestReport(t, tdb, teamID, `{"branch":"feature","repository":"myrepo"}`)
	insertTestResult(t, tdb, reportFeature, teamID, "TestBar", "failed", now.Add(-1*time.Hour))

	// Filter by branch=main → 2 passed runs only
	rowsBranch, err := r.ReadHistory(ctx, analytics.HistoryQuery{
		TeamID:    teamID,
		TestNames: []string{"TestBar"},
		Branch:    "main",
	})
	if err != nil {
		t.Fatalf("ReadHistory branch=main: %v", err)
	}
	if len(rowsBranch) != 1 {
		t.Fatalf("branch=main: len(rows) = %d, want 1", len(rowsBranch))
	}
	if rowsBranch[0].TotalRuns != 2 {
		t.Errorf("branch=main: TotalRuns = %d, want 2", rowsBranch[0].TotalRuns)
	}
	if rowsBranch[0].PassCount != 2 {
		t.Errorf("branch=main: PassCount = %d, want 2", rowsBranch[0].PassCount)
	}

	// Filter by repository=myrepo → all 3 runs (both branches share the repo)
	rowsRepo, err := r.ReadHistory(ctx, analytics.HistoryQuery{
		TeamID:     teamID,
		TestNames:  []string{"TestBar"},
		Repository: "myrepo",
	})
	if err != nil {
		t.Fatalf("ReadHistory repository=myrepo: %v", err)
	}
	if len(rowsRepo) != 1 {
		t.Fatalf("repository=myrepo: len(rows) = %d, want 1", len(rowsRepo))
	}
	if rowsRepo[0].TotalRuns != 3 {
		t.Errorf("repository=myrepo: TotalRuns = %d, want 3", rowsRepo[0].TotalRuns)
	}

	// Filter by both branch=main and repository=myrepo → 2 runs
	rowsBoth, err := r.ReadHistory(ctx, analytics.HistoryQuery{
		TeamID:     teamID,
		TestNames:  []string{"TestBar"},
		Branch:     "main",
		Repository: "myrepo",
	})
	if err != nil {
		t.Fatalf("ReadHistory branch=main repository=myrepo: %v", err)
	}
	if len(rowsBoth) != 1 {
		t.Fatalf("branch=main repository=myrepo: len(rows) = %d, want 1", len(rowsBoth))
	}
	if rowsBoth[0].TotalRuns != 2 {
		t.Errorf("branch=main repository=myrepo: TotalRuns = %d, want 2", rowsBoth[0].TotalRuns)
	}
}

// TestDBHistoryReader_ReadHistory_UnknownTestsAbsentFromResult verifies that
// querying for test names absent from the database returns an empty slice, not
// an error. The caller (BuildFlakinessSummaries) handles missing names.
func TestDBHistoryReader_ReadHistory_UnknownTestsAbsentFromResult(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "hist-unknown-team")
	r := store.NewDBHistoryReader(tdb.Pool)

	rows, err := r.ReadHistory(ctx, analytics.HistoryQuery{
		TeamID:    teamID,
		TestNames: []string{"NewTest", "AnotherUnknown"},
	})
	if err != nil {
		t.Fatalf("ReadHistory: %v", err)
	}
	if len(rows) != 0 {
		t.Errorf("len(rows) = %d, want 0 for unknown tests", len(rows))
	}
}

// TestDBHistoryReader_ReadHistory_LookbackWindow verifies that results outside
// the configured lookback window are excluded from the aggregation.
func TestDBHistoryReader_ReadHistory_LookbackWindow(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "hist-lookback-team")
	r := store.NewDBHistoryReader(tdb.Pool)

	now := time.Now()
	report := insertTestReport(t, tdb, teamID, "{}")

	// One result beyond the 30-day window — must be excluded
	insertTestResult(t, tdb, report, teamID, "TestBaz", "passed", now.Add(-35*24*time.Hour))
	// Two results within the window
	insertTestResult(t, tdb, report, teamID, "TestBaz", "failed", now.Add(-5*24*time.Hour))
	insertTestResult(t, tdb, report, teamID, "TestBaz", "passed", now.Add(-1*24*time.Hour))

	rows, err := r.ReadHistory(ctx, analytics.HistoryQuery{
		TeamID:       teamID,
		TestNames:    []string{"TestBaz"},
		LookbackDays: 30,
	})
	if err != nil {
		t.Fatalf("ReadHistory: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("len(rows) = %d, want 1", len(rows))
	}
	if rows[0].TotalRuns != 2 {
		t.Errorf("TotalRuns = %d, want 2 (old result excluded by window)", rows[0].TotalRuns)
	}
	if rows[0].LastStatus != "passed" {
		t.Errorf("LastStatus = %q, want %q", rows[0].LastStatus, "passed")
	}
}
