package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type AnalyticsStore struct {
	pool *pgxpool.Pool
}

func NewAnalyticsStore(pool *pgxpool.Pool) *AnalyticsStore {
	return &AnalyticsStore{pool: pool}
}

type TrendRow struct {
	Date     time.Time
	Total    int
	Passed   int
	Failed   int
	Skipped  int
	PassRate float64
}

func (s *AnalyticsStore) QueryTrends(ctx context.Context, groupBy, teamID string, start, end time.Time) ([]TrendRow, error) {
	query := `
		SELECT
			time_bucket($1::interval, created_at) AS bucket,
			count(*) AS total,
			count(*) FILTER (WHERE status = 'passed') AS passed,
			count(*) FILTER (WHERE status = 'failed') AS failed,
			count(*) FILTER (WHERE status = 'skipped') AS skipped,
			CASE WHEN count(*) > 0
			     THEN round(count(*) FILTER (WHERE status = 'passed')::numeric / count(*)::numeric * 100, 2)
			     ELSE 0
			END AS pass_rate
		FROM test_results
		WHERE team_id = $2
			AND created_at >= $3
			AND created_at <= $4
		GROUP BY bucket
		ORDER BY bucket
	`
	rows, err := s.pool.Query(ctx, query, groupBy, teamID, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []TrendRow
	for rows.Next() {
		var tr TrendRow
		if err := rows.Scan(&tr.Date, &tr.Total, &tr.Passed, &tr.Failed, &tr.Skipped, &tr.PassRate); err != nil {
			return nil, err
		}
		results = append(results, tr)
	}
	return results, rows.Err()
}

func (s *AnalyticsStore) QueryDurationBuckets(ctx context.Context, teamID string, start, end time.Time) ([]int64, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT duration_ms
		 FROM test_results
		 WHERE team_id = $1 AND created_at >= $2 AND created_at <= $3`,
		teamID, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var durations []int64
	for rows.Next() {
		var ms int64
		if err := rows.Scan(&ms); err != nil {
			return nil, err
		}
		durations = append(durations, ms)
	}
	return durations, rows.Err()
}

type ErrorClusterRow struct {
	Message   string
	Count     int
	TestNames []string
	FirstSeen time.Time
	LastSeen  time.Time
}

func (s *AnalyticsStore) QueryErrorClusters(ctx context.Context, teamID string, start, end time.Time, limit int) ([]ErrorClusterRow, error) {
	query := `
		SELECT
			message,
			count(*) AS count,
			array_agg(DISTINCT name) AS test_names,
			min(created_at) AS first_seen,
			max(created_at) AS last_seen
		FROM test_results
		WHERE team_id = $1
			AND status = 'failed'
			AND message IS NOT NULL
			AND message != ''
			AND created_at >= $2
			AND created_at <= $3
		GROUP BY message
		ORDER BY count DESC
		LIMIT $4
	`
	rows, err := s.pool.Query(ctx, query, teamID, start, end, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var clusters []ErrorClusterRow
	for rows.Next() {
		var ec ErrorClusterRow
		if err := rows.Scan(&ec.Message, &ec.Count, &ec.TestNames, &ec.FirstSeen, &ec.LastSeen); err != nil {
			return nil, err
		}
		clusters = append(clusters, ec)
	}
	return clusters, rows.Err()
}

type FlakyRow struct {
	Name       string
	Suite      string
	FilePath   string
	Statuses   []string
	LastStatus string
	TotalRuns  int
}

func (s *AnalyticsStore) QueryFlakyTests(ctx context.Context, teamID string, cutoff time.Time, minRuns int) ([]FlakyRow, error) {
	query := `
		SELECT
			name,
			COALESCE(suite, '') AS suite,
			COALESCE(file_path, '') AS file_path,
			array_agg(status ORDER BY created_at) AS statuses,
			(array_agg(status ORDER BY created_at DESC))[1] AS last_status,
			count(*) AS total_runs
		FROM test_results
		WHERE team_id = $1
			AND created_at >= $2
		GROUP BY name, suite, file_path
		HAVING count(*) >= $3
		ORDER BY name
	`
	rows, err := s.pool.Query(ctx, query, teamID, cutoff, minRuns)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []FlakyRow
	for rows.Next() {
		var fr FlakyRow
		if err := rows.Scan(&fr.Name, &fr.Suite, &fr.FilePath, &fr.Statuses, &fr.LastStatus, &fr.TotalRuns); err != nil {
			return nil, err
		}
		results = append(results, fr)
	}
	return results, rows.Err()
}
