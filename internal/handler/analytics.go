package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/scaledtest/scaledtest/internal/analytics"
	"github.com/scaledtest/scaledtest/internal/auth"
	"github.com/scaledtest/scaledtest/internal/db"
)

// AnalyticsHandler handles analytics endpoints.
type AnalyticsHandler struct {
	Store *analytics.Store
}

// NewAnalyticsHandler creates an analytics handler with DB access.
func NewAnalyticsHandler(pool *db.Pool) *AnalyticsHandler {
	var store *analytics.Store
	if pool != nil {
		store = analytics.NewStore(pool)
	}
	return &AnalyticsHandler{Store: store}
}

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

// Trends handles GET /api/v1/analytics/trends.
func (h *AnalyticsHandler) Trends(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	days := parseIntParam(r, "days", 30)
	if days > 365 {
		days = 365
	}
	groupBy := r.URL.Query().Get("group_by")
	if groupBy == "" {
		groupBy = "day"
	}

	q := analytics.TrendQuery{
		TeamID:    claims.TeamID,
		StartDate: time.Now().AddDate(0, 0, -days),
		EndDate:   time.Now(),
		GroupBy:   groupBy,
	}

	if h.Store == nil {
		JSON(w, http.StatusOK, map[string]interface{}{"trends": []interface{}{}})
		return
	}

	trends, err := h.Store.GetTrends(r.Context(), q)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to fetch trends")
		return
	}

	JSON(w, http.StatusOK, map[string]interface{}{"trends": trends})
}

// FlakyTests handles GET /api/v1/analytics/flaky-tests.
func (h *AnalyticsHandler) FlakyTests(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	days := parseIntParam(r, "days", 7)
	minRuns := parseIntParam(r, "min_runs", 5)
	limit := parseIntParam(r, "limit", 50)

	q := analytics.FlakyQuery{
		TeamID:  claims.TeamID,
		Window:  time.Duration(days) * 24 * time.Hour,
		MinRuns: minRuns,
		Limit:   limit,
	}

	if h.Store == nil {
		JSON(w, http.StatusOK, map[string]interface{}{"flaky_tests": []interface{}{}})
		return
	}

	flaky, err := h.Store.GetFlakyTests(r.Context(), q)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to fetch flaky tests")
		return
	}

	JSON(w, http.StatusOK, map[string]interface{}{"flaky_tests": flaky})
}

// ErrorAnalysis handles GET /api/v1/analytics/error-analysis.
func (h *AnalyticsHandler) ErrorAnalysis(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	days := parseIntParam(r, "days", 30)
	limit := parseIntParam(r, "limit", 20)

	if h.Store == nil {
		JSON(w, http.StatusOK, map[string]interface{}{"errors": []interface{}{}})
		return
	}

	errors, err := h.Store.GetErrorAnalysis(r.Context(), claims.TeamID, days, limit)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to fetch error analysis")
		return
	}

	JSON(w, http.StatusOK, map[string]interface{}{"errors": errors})
}

// DurationDistribution handles GET /api/v1/analytics/duration-distribution.
func (h *AnalyticsHandler) DurationDistribution(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	days := parseIntParam(r, "days", 30)

	if h.Store == nil {
		JSON(w, http.StatusOK, map[string]interface{}{"distribution": analytics.DefaultDurationBuckets()})
		return
	}

	stats, err := h.Store.GetDurationDistribution(r.Context(), claims.TeamID, days)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to fetch duration distribution")
		return
	}

	JSON(w, http.StatusOK, stats)
}

// HealthScore handles GET /api/v1/analytics/health-score.
func (h *AnalyticsHandler) HealthScore(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	days := parseIntParam(r, "days", 7)

	if h.Store == nil {
		JSON(w, http.StatusOK, &analytics.HealthScore{Score: 0, Trend: "stable"})
		return
	}

	score, err := h.Store.GetHealthScore(r.Context(), claims.TeamID, days)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to compute health score")
		return
	}

	JSON(w, http.StatusOK, score)
}
