package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/rs/zerolog/log"

	"github.com/scaledtest/scaledtest/internal/analytics"
	"github.com/scaledtest/scaledtest/internal/auth"
)

// AnalyticsHandler handles analytics endpoints.
type AnalyticsHandler struct {
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

	if h.AnalyticsStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	q := parseTrendQuery(r, claims.TeamID)

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
}

// FlakyTests handles GET /api/v1/analytics/flaky-tests.
// Query params: window_days (int, default 7), min_runs (int, default 5), limit (int, default 20).
func (h *AnalyticsHandler) FlakyTests(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if h.AnalyticsStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	q := parseFlakyQuery(r, claims.TeamID)
	cutoff := time.Now().Add(-q.Window)

	rows, err := h.AnalyticsStore.QueryFlakyTests(r.Context(), claims.TeamID, cutoff, q.MinRuns)
	if err != nil {
		log.Error().Err(err).Msg("analytics: flaky query failed")
		Error(w, http.StatusInternalServerError, "query failed")
		return
	}

	var flaky []analytics.FlakyTest
	for _, fr := range rows {
		ft := analytics.FlakyTest{
			Name:       fr.Name,
			Suite:      fr.Suite,
			FilePath:   fr.FilePath,
			LastStatus: fr.LastStatus,
			TotalRuns:  fr.TotalRuns,
		}
		ft.FlipCount, ft.FlipRate = analytics.DetectFlaky(fr.Statuses)
		if ft.FlipCount > 0 {
			flaky = append(flaky, ft)
		}
		if q.Limit > 0 && len(flaky) >= q.Limit {
			break
		}
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

	if h.AnalyticsStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	start, end := parseDateRange(r)
	limit := parseIntParam(r, "limit", 20)

	clusters, err := h.AnalyticsStore.QueryErrorClusters(r.Context(), claims.TeamID, start, end, limit)
	if err != nil {
		log.Error().Err(err).Msg("analytics: error analysis query failed")
		Error(w, http.StatusInternalServerError, "query failed")
		return
	}

	var result []analytics.ErrorCluster
	for _, ec := range clusters {
		result = append(result, analytics.ErrorCluster{
			Message:   ec.Message,
			Count:     ec.Count,
			TestNames: ec.TestNames,
			FirstSeen: ec.FirstSeen,
			LastSeen:  ec.LastSeen,
		})
	}
	if result == nil {
		result = []analytics.ErrorCluster{}
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"errors": result,
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

	if h.AnalyticsStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	start, end := parseDateRange(r)

	buckets := analytics.DefaultDurationBuckets()
	durations, err := h.AnalyticsStore.QueryDurationBuckets(r.Context(), claims.TeamID, start, end)
	if err != nil {
		log.Error().Err(err).Msg("analytics: duration bucket query failed")
		Error(w, http.StatusInternalServerError, "query failed")
		return
	}
	for _, ms := range durations {
		idx := analytics.BucketDuration(ms, buckets)
		buckets[idx].Count++
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
