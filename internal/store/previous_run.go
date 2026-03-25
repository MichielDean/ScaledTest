package store

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// DBPreviousRunFinder implements analytics.PreviousRunFinder against PostgreSQL.
type DBPreviousRunFinder struct {
	pool *pgxpool.Pool
}

// NewDBPreviousRunFinder creates a DBPreviousRunFinder backed by pool.
func NewDBPreviousRunFinder(pool *pgxpool.Pool) *DBPreviousRunFinder {
	return &DBPreviousRunFinder{pool: pool}
}

// FindPreviousSuccessfulCommit returns the commit SHA from the most recent
// test report for the given team/repository that had zero failed tests and a
// non-empty commit SHA in its CTRF environment JSONB.
//
// Optional parameters:
//   - branch: when non-empty, restricts the search to reports from that branch
//   - excludeReportID: when non-empty, skips this report (e.g. the current run)
//
// Returns an empty string (no error) when no qualifying report exists.
func (f *DBPreviousRunFinder) FindPreviousSuccessfulCommit(ctx context.Context, teamID, repository, branch, excludeReportID string) (string, error) {
	const baseSQL = `
		SELECT environment->>'commit'
		FROM test_reports
		WHERE team_id = $1
		  AND environment->>'repository' = $2
		  AND COALESCE((summary->>'failed')::int, 1) = 0
		  AND (environment->>'commit') IS NOT NULL
		  AND (environment->>'commit') != ''
		  %s
		  %s
		ORDER BY created_at DESC
		LIMIT 1`

	args := []interface{}{teamID, repository}
	branchClause := ""
	excludeClause := ""

	if branch != "" {
		args = append(args, branch)
		branchClause = fmt.Sprintf("AND environment->>'branch' = $%d", len(args))
	}
	if excludeReportID != "" {
		args = append(args, excludeReportID)
		excludeClause = fmt.Sprintf("AND id != $%d::uuid", len(args))
	}

	query := fmt.Sprintf(baseSQL, branchClause, excludeClause)

	var sha string
	err := f.pool.QueryRow(ctx, query, args...).Scan(&sha)
	if err == pgx.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("find previous successful commit: %w", err)
	}
	return sha, nil
}
