//go:build integration

package store_test

import (
	"context"
	"testing"
	"time"

	"github.com/scaledtest/scaledtest/internal/integration"
	"github.com/scaledtest/scaledtest/internal/store"
)

// insertSuccessfulReport inserts a test_reports row with the given environment
// JSONB and a summary indicating zero failed tests.
func insertSuccessfulReport(t *testing.T, tdb *integration.TestDB, teamID, environment string, createdAt time.Time) string {
	t.Helper()
	ctx := context.Background()
	var id string
	err := tdb.Pool.QueryRow(ctx,
		`INSERT INTO test_reports (team_id, tool_name, summary, raw, environment, created_at)
		 VALUES ($1, 'jest', '{"failed":0,"passed":5,"tests":5}', '{}', $2::jsonb, $3)
		 RETURNING id`,
		teamID, environment, createdAt,
	).Scan(&id)
	if err != nil {
		t.Fatalf("insertSuccessfulReport: %v", err)
	}
	return id
}

// insertFailedReport inserts a test_reports row with one or more failed tests.
func insertFailedReport(t *testing.T, tdb *integration.TestDB, teamID, environment string, createdAt time.Time) string {
	t.Helper()
	ctx := context.Background()
	var id string
	err := tdb.Pool.QueryRow(ctx,
		`INSERT INTO test_reports (team_id, tool_name, summary, raw, environment, created_at)
		 VALUES ($1, 'jest', '{"failed":2,"passed":3,"tests":5}', '{}', $2::jsonb, $3)
		 RETURNING id`,
		teamID, environment, createdAt,
	).Scan(&id)
	if err != nil {
		t.Fatalf("insertFailedReport: %v", err)
	}
	return id
}

// TestDBPreviousRunFinder_FindPreviousSuccessfulCommit_BasicCase verifies that
// the finder returns the commit SHA from the most recent successful run.
func TestDBPreviousRunFinder_FindPreviousSuccessfulCommit_BasicCase(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "prev-run-basic")
	f := store.NewDBPreviousRunFinder(tdb.Pool)

	now := time.Now()
	insertSuccessfulReport(t, tdb, teamID,
		`{"repository":"org/repo","commit":"older-sha","branch":"main"}`,
		now.Add(-2*time.Hour))
	insertSuccessfulReport(t, tdb, teamID,
		`{"repository":"org/repo","commit":"recent-sha","branch":"main"}`,
		now.Add(-1*time.Hour))

	got, err := f.FindPreviousSuccessfulCommit(ctx, teamID, "org/repo", "", "")
	if err != nil {
		t.Fatalf("FindPreviousSuccessfulCommit: %v", err)
	}
	if got != "recent-sha" {
		t.Errorf("commit = %q, want recent-sha (most recent successful)", got)
	}
}

// TestDBPreviousRunFinder_FindPreviousSuccessfulCommit_NoSuccessfulRun returns
// empty string when no passing run exists.
func TestDBPreviousRunFinder_FindPreviousSuccessfulCommit_NoSuccessfulRun(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "prev-run-none")
	f := store.NewDBPreviousRunFinder(tdb.Pool)

	got, err := f.FindPreviousSuccessfulCommit(ctx, teamID, "org/repo", "", "")
	if err != nil {
		t.Fatalf("FindPreviousSuccessfulCommit: %v", err)
	}
	if got != "" {
		t.Errorf("commit = %q, want empty when no successful run exists", got)
	}
}

// TestDBPreviousRunFinder_FindPreviousSuccessfulCommit_IgnoresFailedRuns verifies
// that reports with failed tests are not returned.
func TestDBPreviousRunFinder_FindPreviousSuccessfulCommit_IgnoresFailedRuns(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "prev-run-failed")
	f := store.NewDBPreviousRunFinder(tdb.Pool)

	now := time.Now()
	// Only failed runs
	insertFailedReport(t, tdb, teamID,
		`{"repository":"org/repo","commit":"failed-sha","branch":"main"}`,
		now.Add(-1*time.Hour))

	got, err := f.FindPreviousSuccessfulCommit(ctx, teamID, "org/repo", "", "")
	if err != nil {
		t.Fatalf("FindPreviousSuccessfulCommit: %v", err)
	}
	if got != "" {
		t.Errorf("commit = %q, want empty (failed runs must be skipped)", got)
	}
}

// TestDBPreviousRunFinder_FindPreviousSuccessfulCommit_IgnoresReportWithoutCommit
// verifies that reports lacking a commit SHA in environment are skipped.
func TestDBPreviousRunFinder_FindPreviousSuccessfulCommit_IgnoresReportWithoutCommit(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "prev-run-no-commit")
	f := store.NewDBPreviousRunFinder(tdb.Pool)

	now := time.Now()
	insertSuccessfulReport(t, tdb, teamID,
		`{"repository":"org/repo","branch":"main"}`, // no commit field
		now.Add(-1*time.Hour))

	got, err := f.FindPreviousSuccessfulCommit(ctx, teamID, "org/repo", "", "")
	if err != nil {
		t.Fatalf("FindPreviousSuccessfulCommit: %v", err)
	}
	if got != "" {
		t.Errorf("commit = %q, want empty when commit field is absent", got)
	}
}

// TestDBPreviousRunFinder_FindPreviousSuccessfulCommit_BranchFilter verifies
// that the optional branch filter restricts results to the given branch.
func TestDBPreviousRunFinder_FindPreviousSuccessfulCommit_BranchFilter(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "prev-run-branch")
	f := store.NewDBPreviousRunFinder(tdb.Pool)

	now := time.Now()
	insertSuccessfulReport(t, tdb, teamID,
		`{"repository":"org/repo","commit":"main-sha","branch":"main"}`,
		now.Add(-2*time.Hour))
	insertSuccessfulReport(t, tdb, teamID,
		`{"repository":"org/repo","commit":"feature-sha","branch":"feature/x"}`,
		now.Add(-1*time.Hour))

	// Filter by branch=main: should return main-sha, not the more recent feature-sha
	got, err := f.FindPreviousSuccessfulCommit(ctx, teamID, "org/repo", "main", "")
	if err != nil {
		t.Fatalf("FindPreviousSuccessfulCommit: %v", err)
	}
	if got != "main-sha" {
		t.Errorf("commit = %q, want main-sha (branch filter must apply)", got)
	}
}

// TestDBPreviousRunFinder_FindPreviousSuccessfulCommit_ExcludeReportID verifies
// that the optional excludeReportID parameter skips a specific report.
func TestDBPreviousRunFinder_FindPreviousSuccessfulCommit_ExcludeReportID(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "prev-run-exclude")
	f := store.NewDBPreviousRunFinder(tdb.Pool)

	now := time.Now()
	insertSuccessfulReport(t, tdb, teamID,
		`{"repository":"org/repo","commit":"older-sha","branch":"main"}`,
		now.Add(-2*time.Hour))
	recentID := insertSuccessfulReport(t, tdb, teamID,
		`{"repository":"org/repo","commit":"recent-sha","branch":"main"}`,
		now.Add(-1*time.Hour))

	// Exclude the most recent report — should fall back to older-sha
	got, err := f.FindPreviousSuccessfulCommit(ctx, teamID, "org/repo", "", recentID)
	if err != nil {
		t.Fatalf("FindPreviousSuccessfulCommit: %v", err)
	}
	if got != "older-sha" {
		t.Errorf("commit = %q, want older-sha (recent report excluded)", got)
	}
}

// TestDBPreviousRunFinder_FindPreviousSuccessfulCommit_TeamScoped verifies that
// results from other teams are not returned.
func TestDBPreviousRunFinder_FindPreviousSuccessfulCommit_TeamScoped(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamA := tdb.CreateTeam(t, "prev-run-team-a")
	teamB := tdb.CreateTeam(t, "prev-run-team-b")
	f := store.NewDBPreviousRunFinder(tdb.Pool)

	now := time.Now()
	// Team B has a successful run — must NOT appear when querying team A
	insertSuccessfulReport(t, tdb, teamB,
		`{"repository":"org/repo","commit":"team-b-sha","branch":"main"}`,
		now.Add(-1*time.Hour))

	got, err := f.FindPreviousSuccessfulCommit(ctx, teamA, "org/repo", "", "")
	if err != nil {
		t.Fatalf("FindPreviousSuccessfulCommit: %v", err)
	}
	if got != "" {
		t.Errorf("commit = %q, want empty (team B result must not leak to team A)", got)
	}
}

// TestDBPreviousRunFinder_FindPreviousSuccessfulCommit_DifferentRepositoryIgnored
// verifies that reports for a different repository are not returned.
func TestDBPreviousRunFinder_FindPreviousSuccessfulCommit_DifferentRepositoryIgnored(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "prev-run-diff-repo")
	f := store.NewDBPreviousRunFinder(tdb.Pool)

	now := time.Now()
	insertSuccessfulReport(t, tdb, teamID,
		`{"repository":"org/other-repo","commit":"other-sha","branch":"main"}`,
		now.Add(-1*time.Hour))

	got, err := f.FindPreviousSuccessfulCommit(ctx, teamID, "org/repo", "", "")
	if err != nil {
		t.Fatalf("FindPreviousSuccessfulCommit: %v", err)
	}
	if got != "" {
		t.Errorf("commit = %q, want empty (different repository must be ignored)", got)
	}
}
