package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/rs/zerolog/log"

	"github.com/scaledtest/scaledtest/internal/analytics"
	"github.com/scaledtest/scaledtest/internal/auth"
	"github.com/scaledtest/scaledtest/internal/db"
)

// AnalyticsHandler handles analytics endpoints.
type AnalyticsHandler struct {
	DB             *db.Pool
	AnalyticsStore analyticsStore
}

// Trends handles GET /api/v1/analytics/trends.
// Query params: start (RFC3339), end (RFC3339), group_by (day|week|month).
func (h *AnalyticsHandler) Trends(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if h.DB == nil && h.AnalyticsStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	q := parseTrendQuery(r, claims.TeamID)

	if h.AnalyticsStore != nil {
		rows, err := h.AnalyticsStore.QueryTrends(r.Context(), q.GroupBy, q.TeamID, q.StartDate, q.EndDate)
		if err != nil {
			log.Error().Err(err).Msg("analytics: trends query failed")
			Error(w, http.StatusInternalServerError, "query failed")
			return
		}
		trends := make([]analytics.TrendPoint, len(rows))
		for i, row := range rows {
			trends[i] = analytics.TrendPoint{
				Date:     row.Date,
				Total:    row.Total,
				Passed:   row.Passed,
				Failed:   row.Failed,
				Skipped:  row.Skipped,
				PassRate: row.PassRate,
			}
		}
		JSON(w, http.StatusOK, map[string]interface{}{
			"trends": trends,
		})
		return
	}

	// Legacy path: direct SQL

	query := `
		SELECT
			time_bucket($1::interval, created_at) AS bucket,
			count(*) AS total,
			count(*) FILTER (WHERE status = 'passed') AS passed,
			count(*) FILTER (WHERE status = 'failed') AS failed,
			count(*) FILTER (WHERE status = 'skipped') AS skipped
		FROM test_results
		WHERE team_id = $2
			AND created_at >= $3
			AND created_at <= $4
		GROUP BY bucket
		ORDER BY bucket
	`

	rows, err := h.DB.Query(r.Context(), query, q.GroupBy, q.TeamID, q.StartDate, q.EndDate)
	if err != nil {
		log.Error().Err(err).Msg("analytics: trends query failed")
		Error(w, http.StatusInternalServerError, "query failed")
		return
	}
	defer rows.Close()

	var trends []analytics.TrendPoint
	for rows.Next() {
		var tp analytics.TrendPoint
		if err := rows.Scan(&tp.Date, &tp.Total, &tp.Passed, &tp.Failed, &tp.Skipped); err != nil {
			log.Error().Err(err).Msg("analytics: trends scan failed")
			Error(w, http.StatusInternalServerError, "query failed")
			return
		}
		tp.PassRate = analytics.ComputePassRate(tp.Passed, tp.Total)
		trends = append(trends, tp)
	}
	if err := rows.Err(); err != nil {
		log.Error().Err(err).Msg("analytics: trends iteration failed")
		Error(w, http.StatusInternalServerError, "query failed")
		return
	}

	if trends == nil {
		trends = []analytics.TrendPoint{}
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"trends": trends,
	})
}

// FlakyTests handles GET /api/v1/analytics/flaky-tests.
// Query params: window_days (int, default 7), min_runs (int, default 5), limit (int, default 20).
func (h *AnalyticsHandler) FlakyTests(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if h.DB == nil && h.AnalyticsStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	q := parseFlakyQuery(r, claims.TeamID)
	cutoff := time.Now().Add(-q.Window)

	// Query: for each test, get ordered statuses, then compute flakiness in Go.
	// This avoids complex SQL window functions and uses the analytics.DetectFlaky helper.
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

	rows, err := h.DB.Query(r.Context(), query, q.TeamID, cutoff, q.MinRuns)
	if err != nil {
		log.Error().Err(err).Msg("analytics: flaky query failed")
		Error(w, http.StatusInternalServerError, "query failed")
		return
	}
	defer rows.Close()

	var flaky []analytics.FlakyTest
	for rows.Next() {
		var ft analytics.FlakyTest
		var statuses []string
		if err := rows.Scan(&ft.Name, &ft.Suite, &ft.FilePath, &statuses, &ft.LastStatus, &ft.TotalRuns); err != nil {
			log.Error().Err(err).Msg("analytics: flaky scan failed")
			Error(w, http.StatusInternalServerError, "query failed")
			return
		}

		ft.FlipCount, ft.FlipRate = analytics.DetectFlaky(statuses)
		if ft.FlipCount > 0 {
			flaky = append(flaky, ft)
		}

		if q.Limit > 0 && len(flaky) >= q.Limit {
			break
		}
	}
	if err := rows.Err(); err != nil {
		log.Error().Err(err).Msg("analytics: flaky iteration failed")
		Error(w, http.StatusInternalServerError, "query failed")
		return
	}

	if flaky == nil {
		flaky = []analytics.FlakyTest{}
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"flaky_tests": flaky,
	})
}

// ErrorAnalysis handles GET /api/v1/analytics/error-analysis.
// Query params: start (RFC3339), end (RFC3339), limit (int, default 20).
func (h *AnalyticsHandler) ErrorAnalysis(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if h.DB == nil && h.AnalyticsStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	start, end := parseDateRange(r)
	limit := parseIntParam(r, "limit", 20)

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

	rows, err := h.DB.Query(r.Context(), query, claims.TeamID, start, end, limit)
	if err != nil {
		log.Error().Err(err).Msg("analytics: error analysis query failed")
		Error(w, http.StatusInternalServerError, "query failed")
		return
	}
	defer rows.Close()

	var clusters []analytics.ErrorCluster
	for rows.Next() {
		var ec analytics.ErrorCluster
		if err := rows.Scan(&ec.Message, &ec.Count, &ec.TestNames, &ec.FirstSeen, &ec.LastSeen); err != nil {
			log.Error().Err(err).Msg("analytics: error analysis scan failed")
			Error(w, http.StatusInternalServerError, "query failed")
			return
		}
		clusters = append(clusters, ec)
	}
	if err := rows.Err(); err != nil {
		log.Error().Err(err).Msg("analytics: error analysis iteration failed")
		Error(w, http.StatusInternalServerError, "query failed")
		return
	}

	if clusters == nil {
		clusters = []analytics.ErrorCluster{}
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"errors": clusters,
	})
}

// DurationDistribution handles GET /api/v1/analytics/duration-distribution.
// Query params: start (RFC3339), end (RFC3339).
func (h *AnalyticsHandler) DurationDistribution(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if h.DB == nil && h.AnalyticsStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	start, end := parseDateRange(r)

	// Build histogram buckets
	buckets := analytics.DefaultDurationBuckets()
	bucketQuery := `
		SELECT duration_ms
		FROM test_results
		WHERE team_id = $1
			AND created_at >= $2
			AND created_at <= $3
	`

	rows, err := h.DB.Query(r.Context(), bucketQuery, claims.TeamID, start, end)
	if err != nil {
		log.Error().Err(err).Msg("analytics: duration bucket query failed")
		Error(w, http.StatusInternalServerError, "query failed")
		return
	}
	defer rows.Close()

	for rows.Next() {
		var ms int64
		if err := rows.Scan(&ms); err != nil {
			log.Error().Err(err).Msg("analytics: duration bucket scan failed")
			Error(w, http.StatusInternalServerError, "query failed")
			return
		}
		idx := analytics.BucketDuration(ms, buckets)
		buckets[idx].Count++
	}
	if err := rows.Err(); err != nil {
		log.Error().Err(err).Msg("analytics: duration bucket iteration failed")
		Error(w, http.StatusInternalServerError, "query failed")
		return
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"distribution": buckets,
	})
}

// parseTrendQuery extracts trend query parameters from the request.
func parseTrendQuery(r *http.Request, teamID string) analytics.TrendQuery {
	start, end := parseDateRange(r)

	groupBy := r.URL.Query().Get("group_by")
	switch groupBy {
	case "week":
		groupBy = "1 week"
	case "month":
		groupBy = "1 month"
	default:
		groupBy = "1 day"
	}

	return analytics.TrendQuery{
		TeamID:    teamID,
		StartDate: start,
		EndDate:   end,
		GroupBy:   groupBy,
	}
}

// parseFlakyQuery extracts flaky test query parameters from the request.
func parseFlakyQuery(r *http.Request, teamID string) analytics.FlakyQuery {
	windowDays := parseIntParam(r, "window_days", 7)
	minRuns := parseIntParam(r, "min_runs", 5)
	limit := parseIntParam(r, "limit", 20)

	return analytics.FlakyQuery{
		TeamID:  teamID,
		Window:  time.Duration(windowDays) * 24 * time.Hour,
		MinRuns: minRuns,
		Limit:   limit,
	}
}

// parseDateRange extracts start/end date query parameters with defaults.
func parseDateRange(r *http.Request) (time.Time, time.Time) {
	now := time.Now()
	end := now
	start := now.AddDate(0, 0, -30)

	if s := r.URL.Query().Get("start"); s != "" {
		if t, err := time.Parse(time.RFC3339, s); err == nil {
			start = t
		}
	}
	if s := r.URL.Query().Get("end"); s != "" {
		if t, err := time.Parse(time.RFC3339, s); err == nil {
			end = t
		}
	}

	return start, end
}

// parseIntParam extracts an integer query parameter with a default.
func parseIntParam(r *http.Request, name string, defaultVal int) int {
	s := r.URL.Query().Get(name)
	if s == "" {
		return defaultVal
	}
	v, err := strconv.Atoi(s)
	if err != nil || v <= 0 {
		return defaultVal
	}
	return v
}
