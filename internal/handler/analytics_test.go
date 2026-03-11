package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)


func TestAnalyticsTrendsNoDB(t *testing.T) {
	h := &AnalyticsHandler{DB: nil}

	req := httptest.NewRequest("GET", "/api/v1/analytics/trends", nil)
	req = testWithClaimsTeamOnly(req, "team-1")
	w := httptest.NewRecorder()

	h.Trends(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Trends without DB: status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestAnalyticsFlakyTestsNoDB(t *testing.T) {
	h := &AnalyticsHandler{DB: nil}

	req := httptest.NewRequest("GET", "/api/v1/analytics/flaky-tests", nil)
	req = testWithClaimsTeamOnly(req, "team-1")
	w := httptest.NewRecorder()

	h.FlakyTests(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("FlakyTests without DB: status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestAnalyticsErrorAnalysisNoDB(t *testing.T) {
	h := &AnalyticsHandler{DB: nil}

	req := httptest.NewRequest("GET", "/api/v1/analytics/error-analysis", nil)
	req = testWithClaimsTeamOnly(req, "team-1")
	w := httptest.NewRecorder()

	h.ErrorAnalysis(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("ErrorAnalysis without DB: status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestAnalyticsDurationDistributionNoDB(t *testing.T) {
	h := &AnalyticsHandler{DB: nil}

	req := httptest.NewRequest("GET", "/api/v1/analytics/duration-distribution", nil)
	req = testWithClaimsTeamOnly(req, "team-1")
	w := httptest.NewRecorder()

	h.DurationDistribution(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("DurationDistribution without DB: status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestAnalyticsUnauthorized(t *testing.T) {
	h := &AnalyticsHandler{DB: nil}

	handlers := []struct {
		name string
		fn   http.HandlerFunc
	}{
		{"Trends", h.Trends},
		{"FlakyTests", h.FlakyTests},
		{"ErrorAnalysis", h.ErrorAnalysis},
		{"DurationDistribution", h.DurationDistribution},
	}

	for _, tc := range handlers {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/test", nil)
			w := httptest.NewRecorder()

			tc.fn(w, req)

			if w.Code != http.StatusUnauthorized {
				t.Errorf("%s without claims: status = %d, want %d", tc.name, w.Code, http.StatusUnauthorized)
			}
		})
	}
}

func TestParseDateRange(t *testing.T) {
	now := time.Now()

	// Default: last 30 days
	req := httptest.NewRequest("GET", "/test", nil)
	start, end := parseDateRange(req)

	if end.Sub(now) > time.Second {
		t.Error("default end should be ~now")
	}
	expectedStart := now.AddDate(0, 0, -30)
	if start.Sub(expectedStart).Abs() > time.Second {
		t.Error("default start should be ~30 days ago")
	}

	// Custom range
	req = httptest.NewRequest("GET", "/test?start=2025-01-01T00:00:00Z&end=2025-01-31T23:59:59Z", nil)
	start, end = parseDateRange(req)

	if start.Year() != 2025 || start.Month() != 1 || start.Day() != 1 {
		t.Errorf("custom start = %v, want 2025-01-01", start)
	}
	if end.Year() != 2025 || end.Month() != 1 || end.Day() != 31 {
		t.Errorf("custom end = %v, want 2025-01-31", end)
	}
}

func TestParseIntParam(t *testing.T) {
	tests := []struct {
		query string
		name  string
		def   int
		want  int
	}{
		{"", "limit", 20, 20},
		{"limit=10", "limit", 20, 10},
		{"limit=abc", "limit", 20, 20},
		{"limit=-5", "limit", 20, 20},
		{"limit=0", "limit", 20, 20},
	}

	for _, tt := range tests {
		req := httptest.NewRequest("GET", "/test?"+tt.query, nil)
		got := parseIntParam(req, tt.name, tt.def)
		if got != tt.want {
			t.Errorf("parseIntParam(%q, %q, %d) = %d, want %d", tt.query, tt.name, tt.def, got, tt.want)
		}
	}
}

func TestParseTrendQuery(t *testing.T) {
	tests := []struct {
		query   string
		wantGrp string
	}{
		{"", "1 day"},
		{"group_by=day", "1 day"},
		{"group_by=week", "1 week"},
		{"group_by=month", "1 month"},
		{"group_by=invalid", "1 day"},
	}

	for _, tt := range tests {
		req := httptest.NewRequest("GET", "/test?"+tt.query, nil)
		q := parseTrendQuery(req, "team-1")
		if q.GroupBy != tt.wantGrp {
			t.Errorf("parseTrendQuery(%q).GroupBy = %q, want %q", tt.query, q.GroupBy, tt.wantGrp)
		}
		if q.TeamID != "team-1" {
			t.Errorf("parseTrendQuery(%q).TeamID = %q, want %q", tt.query, q.TeamID, "team-1")
		}
	}
}

func TestParseFlakyQuery(t *testing.T) {
	req := httptest.NewRequest("GET", "/test?window_days=14&min_runs=10&limit=50", nil)
	q := parseFlakyQuery(req, "team-1")

	if q.Window != 14*24*time.Hour {
		t.Errorf("Window = %v, want 14 days", q.Window)
	}
	if q.MinRuns != 10 {
		t.Errorf("MinRuns = %d, want 10", q.MinRuns)
	}
	if q.Limit != 50 {
		t.Errorf("Limit = %d, want 50", q.Limit)
	}
	if q.TeamID != "team-1" {
		t.Errorf("TeamID = %q, want %q", q.TeamID, "team-1")
	}

	// Test defaults
	req = httptest.NewRequest("GET", "/test", nil)
	q = parseFlakyQuery(req, "team-2")
	if q.Window != 7*24*time.Hour {
		t.Errorf("default Window = %v, want 7 days", q.Window)
	}
	if q.MinRuns != 5 {
		t.Errorf("default MinRuns = %d, want 5", q.MinRuns)
	}
	if q.Limit != 20 {
		t.Errorf("default Limit = %d, want 20", q.Limit)
	}
}
