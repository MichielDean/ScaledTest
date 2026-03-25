package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/scaledtest/scaledtest/internal/analytics"
)

// DBHistoryReader implements analytics.HistoryReader against PostgreSQL.
//
// When HistoryQuery.Branch or HistoryQuery.Repository are non-empty the query
// joins test_reports on test_results.report_id and filters by the corresponding
// keys in test_reports.environment JSONB (e.g. {"branch": "main"}).
type DBHistoryReader struct {
	pool *pgxpool.Pool
}

// NewDBHistoryReader creates a DBHistoryReader backed by pool.
func NewDBHistoryReader(pool *pgxpool.Pool) *DBHistoryReader {
	return &DBHistoryReader{pool: pool}
}

// ReadHistory queries test_results for the named tests within the look-back
// window, aggregating statuses oldest-to-newest per test name. Tests not found
// in the database are simply absent from the returned slice; the caller handles
// them as unknown tests via BuildFlakinessSummaries.
func (r *DBHistoryReader) ReadHistory(ctx context.Context, q analytics.HistoryQuery) ([]analytics.TestHistoryRow, error) {
	if len(q.TestNames) == 0 {
		return nil, nil
	}

	since := time.Now().AddDate(0, 0, -q.LookbackWindow())

	// Build the query dynamically: add a JOIN and extra WHERE clauses only when
	// branch/repo context is specified. All user values remain parameterised.
	const baseSQL = `
		SELECT
			tr.name,
			array_agg(tr.status ORDER BY tr.created_at) AS statuses,
			(array_agg(tr.status ORDER BY tr.created_at DESC))[1] AS last_status,
			count(*) FILTER (WHERE tr.status = 'passed') AS pass_count,
			count(*) FILTER (WHERE tr.status = 'failed') AS fail_count,
			count(*) AS total_runs
		FROM test_results tr
		%s
		WHERE tr.team_id = $1
		  AND tr.name = ANY($2::text[])
		  AND tr.created_at >= $3
		  %s
		GROUP BY tr.name
		ORDER BY tr.name`

	args := []interface{}{q.TeamID, q.TestNames, since}
	joinClause := ""
	extraWhere := ""

	if q.Branch != "" || q.Repository != "" {
		joinClause = "JOIN test_reports rpt ON rpt.id = tr.report_id"
		if q.Branch != "" {
			args = append(args, q.Branch)
			extraWhere += fmt.Sprintf(" AND rpt.environment->>'branch' = $%d", len(args))
		}
		if q.Repository != "" {
			args = append(args, q.Repository)
			extraWhere += fmt.Sprintf(" AND rpt.environment->>'repository' = $%d", len(args))
		}
	}

	query := fmt.Sprintf(baseSQL, joinClause, extraWhere)

	pgRows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("read flakiness history: %w", err)
	}
	defer pgRows.Close()

	var result []analytics.TestHistoryRow
	for pgRows.Next() {
		var row analytics.TestHistoryRow
		if err := pgRows.Scan(
			&row.Name,
			&row.Statuses,
			&row.LastStatus,
			&row.PassCount,
			&row.FailCount,
			&row.TotalRuns,
		); err != nil {
			return nil, fmt.Errorf("scan flakiness history row: %w", err)
		}
		result = append(result, row)
	}
	return result, pgRows.Err()
}
