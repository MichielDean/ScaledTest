package analytics

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Store provides analytics queries against the database.
type Store struct {
	pool *pgxpool.Pool
}

// NewStore creates an analytics store.
func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

// GetTrends returns pass rate trend data grouped by day, week, or month.
func (s *Store) GetTrends(ctx context.Context, q TrendQuery) ([]TrendPoint, error) {
	if s.pool == nil {
		return []TrendPoint{}, nil
	}

	interval := "1 day"
	switch q.GroupBy {
	case "week":
		interval = "1 week"
	case "month":
		interval = "1 month"
	}

	query := fmt.Sprintf(`
		SELECT
			time_bucket('%s', created_at) AS bucket,
			COUNT(*) AS total,
			COUNT(*) FILTER (WHERE status = 'passed') AS passed,
			COUNT(*) FILTER (WHERE status = 'failed') AS failed,
			COUNT(*) FILTER (WHERE status = 'skipped') AS skipped
		FROM test_results
		WHERE created_at >= $1
		  AND created_at <= $2
		  AND ($3::uuid IS NULL OR team_id = $3::uuid)
		GROUP BY bucket
		ORDER BY bucket ASC
	`, interval)

	var teamID *string
	if q.TeamID != "" {
		teamID = &q.TeamID
	}

	rows, err := s.pool.Query(ctx, query, q.StartDate, q.EndDate, teamID)
	if err != nil {
		return nil, fmt.Errorf("query trends: %w", err)
	}
	defer rows.Close()

	var points []TrendPoint
	for rows.Next() {
		var p TrendPoint
		if err := rows.Scan(&p.Date, &p.Total, &p.Passed, &p.Failed, &p.Skipped); err != nil {
			return nil, fmt.Errorf("scan trend point: %w", err)
		}
		p.PassRate = ComputePassRate(p.Passed, p.Total)
		points = append(points, p)
	}

	if points == nil {
		points = []TrendPoint{}
	}
	return points, rows.Err()
}

// GetFlakyTests returns tests that alternate between pass and fail.
func (s *Store) GetFlakyTests(ctx context.Context, q FlakyQuery) ([]FlakyTest, error) {
	if s.pool == nil {
		return []FlakyTest{}, nil
	}

	if q.MinRuns <= 0 {
		q.MinRuns = 5
	}
	if q.Limit <= 0 {
		q.Limit = 50
	}

	query := `
		WITH test_history AS (
			SELECT
				name,
				suite,
				file_path,
				ARRAY_AGG(status ORDER BY created_at ASC) AS statuses,
				COUNT(*) AS total_runs,
				(ARRAY_AGG(status ORDER BY created_at DESC))[1] AS last_status
			FROM test_results
			WHERE created_at >= $1
			  AND ($2::uuid IS NULL OR team_id = $2::uuid)
			GROUP BY name, suite, file_path
			HAVING COUNT(*) >= $3
		)
		SELECT name, suite, file_path, statuses, total_runs, last_status
		FROM test_history
		ORDER BY total_runs DESC
		LIMIT $4
	`

	window := time.Now().Add(-q.Window)
	var teamID *string
	if q.TeamID != "" {
		teamID = &q.TeamID
	}

	rows, err := s.pool.Query(ctx, query, window, teamID, q.MinRuns, q.Limit)
	if err != nil {
		return nil, fmt.Errorf("query flaky tests: %w", err)
	}
	defer rows.Close()

	var results []FlakyTest
	for rows.Next() {
		var ft FlakyTest
		var statuses []string
		if err := rows.Scan(&ft.Name, &ft.Suite, &ft.FilePath, &statuses, &ft.TotalRuns, &ft.LastStatus); err != nil {
			return nil, fmt.Errorf("scan flaky test: %w", err)
		}
		ft.FlipCount, ft.FlipRate = DetectFlaky(statuses)
		if ft.FlipCount > 0 {
			results = append(results, ft)
		}
	}

	// Sort by flip rate descending
	for i := 0; i < len(results); i++ {
		for j := i + 1; j < len(results); j++ {
			if results[j].FlipRate > results[i].FlipRate {
				results[i], results[j] = results[j], results[i]
			}
		}
	}

	if q.Limit > 0 && len(results) > q.Limit {
		results = results[:q.Limit]
	}

	if results == nil {
		results = []FlakyTest{}
	}
	return results, rows.Err()
}

// GetErrorAnalysis clusters failures by error message.
func (s *Store) GetErrorAnalysis(ctx context.Context, teamID string, days, limit int) ([]ErrorCluster, error) {
	if s.pool == nil {
		return []ErrorCluster{}, nil
	}

	if days <= 0 {
		days = 30
	}
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	query := `
		SELECT
			COALESCE(message, 'No error message') AS error_message,
			COUNT(*) AS occurrence_count,
			ARRAY_AGG(DISTINCT name) AS test_names,
			MIN(created_at) AS first_seen,
			MAX(created_at) AS last_seen
		FROM test_results
		WHERE status = 'failed'
		  AND created_at >= NOW() - ($1 || ' days')::interval
		  AND ($2::uuid IS NULL OR team_id = $2::uuid)
		GROUP BY COALESCE(message, 'No error message')
		ORDER BY occurrence_count DESC
		LIMIT $3
	`

	var tid *string
	if teamID != "" {
		tid = &teamID
	}

	rows, err := s.pool.Query(ctx, query, fmt.Sprintf("%d", days), tid, limit)
	if err != nil {
		return nil, fmt.Errorf("query error analysis: %w", err)
	}
	defer rows.Close()

	var clusters []ErrorCluster
	for rows.Next() {
		var c ErrorCluster
		if err := rows.Scan(&c.Message, &c.Count, &c.TestNames, &c.FirstSeen, &c.LastSeen); err != nil {
			return nil, fmt.Errorf("scan error cluster: %w", err)
		}
		clusters = append(clusters, c)
	}

	if clusters == nil {
		clusters = []ErrorCluster{}
	}
	return clusters, rows.Err()
}

// GetDurationDistribution returns a histogram of test durations.
func (s *Store) GetDurationDistribution(ctx context.Context, teamID string, days int) (*DurationStats, error) {
	if s.pool == nil {
		buckets := DefaultDurationBuckets()
		return &DurationStats{Distribution: buckets}, nil
	}

	if days <= 0 {
		days = 30
	}

	query := `
		SELECT duration_ms
		FROM test_results
		WHERE created_at >= NOW() - ($1 || ' days')::interval
		  AND ($2::uuid IS NULL OR team_id = $2::uuid)
		  AND status IN ('passed', 'failed')
		ORDER BY duration_ms ASC
	`

	var tid *string
	if teamID != "" {
		tid = &teamID
	}

	rows, err := s.pool.Query(ctx, query, fmt.Sprintf("%d", days), tid)
	if err != nil {
		return nil, fmt.Errorf("query durations: %w", err)
	}
	defer rows.Close()

	var durations []int64
	for rows.Next() {
		var d int64
		if err := rows.Scan(&d); err != nil {
			return nil, fmt.Errorf("scan duration: %w", err)
		}
		durations = append(durations, d)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	buckets := DefaultDurationBuckets()
	stats := &DurationStats{Distribution: buckets}

	if len(durations) == 0 {
		return stats, nil
	}

	// Durations are already sorted ASC
	var sum int64
	for _, d := range durations {
		sum += d
		idx := BucketDuration(d, buckets)
		buckets[idx].Count++
	}

	n := len(durations)
	stats.Mean = float64(sum) / float64(n)
	stats.Min = durations[0]
	stats.Max = durations[n-1]
	stats.Median = float64(durations[n/2])
	stats.P95 = float64(durations[int(float64(n)*0.95)])
	if int(float64(n)*0.99) < n {
		stats.P99 = float64(durations[int(float64(n)*0.99)])
	} else {
		stats.P99 = float64(durations[n-1])
	}
	stats.Distribution = buckets

	return stats, nil
}

// HealthScore represents a composite team health metric.
type HealthScore struct {
	Score         float64 `json:"score"`          // 0-100 composite score
	PassRate      float64 `json:"pass_rate"`      // Current pass rate %
	FlakyRate     float64 `json:"flaky_rate"`     // Flaky test percentage
	AvgDurationMs float64 `json:"avg_duration_ms"` // Average test duration
	Trend         string  `json:"trend"`          // "improving", "stable", "degrading"
	Details       struct {
		PassRateScore  float64 `json:"pass_rate_score"`  // 0-100
		FlakyScore     float64 `json:"flaky_score"`      // 0-100
		SpeedScore     float64 `json:"speed_score"`      // 0-100
		PassRateDelta  float64 `json:"pass_rate_delta"`  // Change vs previous period
	} `json:"details"`
}

// GetHealthScore computes a composite health score.
func (s *Store) GetHealthScore(ctx context.Context, teamID string, days int) (*HealthScore, error) {
	if s.pool == nil {
		return &HealthScore{Score: 0, Trend: "stable"}, nil
	}

	if days <= 0 {
		days = 7
	}

	// Get current period stats
	currentQuery := `
		SELECT
			COUNT(*) AS total,
			COUNT(*) FILTER (WHERE status = 'passed') AS passed,
			COUNT(*) FILTER (WHERE flaky = true) AS flaky_count,
			COALESCE(AVG(duration_ms), 0) AS avg_duration
		FROM test_results
		WHERE created_at >= NOW() - ($1 || ' days')::interval
		  AND ($2::uuid IS NULL OR team_id = $2::uuid)
	`

	// Get previous period stats for trend
	prevQuery := `
		SELECT
			COUNT(*) AS total,
			COUNT(*) FILTER (WHERE status = 'passed') AS passed
		FROM test_results
		WHERE created_at >= NOW() - ($1 || ' days')::interval
		  AND created_at < NOW() - ($2 || ' days')::interval
		  AND ($3::uuid IS NULL OR team_id = $3::uuid)
	`

	var tid *string
	if teamID != "" {
		tid = &teamID
	}

	var total, passed, flakyCount int
	var avgDuration float64

	err := s.pool.QueryRow(ctx, currentQuery, fmt.Sprintf("%d", days), tid).
		Scan(&total, &passed, &flakyCount, &avgDuration)
	if err != nil {
		return nil, fmt.Errorf("query health score: %w", err)
	}

	var prevTotal, prevPassed int
	doubleDays := fmt.Sprintf("%d", days*2)
	daysStr := fmt.Sprintf("%d", days)
	err = s.pool.QueryRow(ctx, prevQuery, doubleDays, daysStr, tid).
		Scan(&prevTotal, &prevPassed)
	if err != nil {
		return nil, fmt.Errorf("query previous period: %w", err)
	}

	hs := &HealthScore{}
	hs.PassRate = ComputePassRate(passed, total)

	if total > 0 {
		hs.FlakyRate = float64(flakyCount) / float64(total) * 100
	}
	hs.AvgDurationMs = avgDuration

	// Pass rate score: direct percentage (0-100)
	hs.Details.PassRateScore = hs.PassRate

	// Flaky score: 100 = no flaky tests, 0 = all flaky
	hs.Details.FlakyScore = 100 - hs.FlakyRate
	if hs.Details.FlakyScore < 0 {
		hs.Details.FlakyScore = 0
	}

	// Speed score: based on average duration
	// <500ms = 100, <2s = 80, <5s = 60, <10s = 40, <30s = 20, else 10
	switch {
	case avgDuration < 500:
		hs.Details.SpeedScore = 100
	case avgDuration < 2000:
		hs.Details.SpeedScore = 80
	case avgDuration < 5000:
		hs.Details.SpeedScore = 60
	case avgDuration < 10000:
		hs.Details.SpeedScore = 40
	case avgDuration < 30000:
		hs.Details.SpeedScore = 20
	default:
		hs.Details.SpeedScore = 10
	}

	// Composite: weighted average (pass rate 50%, flakiness 30%, speed 20%)
	hs.Score = hs.Details.PassRateScore*0.5 + hs.Details.FlakyScore*0.3 + hs.Details.SpeedScore*0.2

	// Trend detection
	prevPassRate := ComputePassRate(prevPassed, prevTotal)
	hs.Details.PassRateDelta = hs.PassRate - prevPassRate

	switch {
	case hs.Details.PassRateDelta > 2:
		hs.Trend = "improving"
	case hs.Details.PassRateDelta < -2:
		hs.Trend = "degrading"
	default:
		hs.Trend = "stable"
	}

	return hs, nil
}
