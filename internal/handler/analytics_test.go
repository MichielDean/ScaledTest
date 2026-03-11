package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/scaledtest/scaledtest/internal/auth"
)

func withTestClaims(ctx context.Context) context.Context {
	claims := &auth.Claims{UserID: "user-1", Email: "test@test.com", Role: "readonly"}
	return context.WithValue(ctx, auth.ClaimsContextKey, claims)
}

func TestAnalyticsTrends_Unauthorized(t *testing.T) {
	h := NewAnalyticsHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/analytics/trends", nil)
	w := httptest.NewRecorder()

	h.Trends(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestAnalyticsTrends_NoPool(t *testing.T) {
	h := NewAnalyticsHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/analytics/trends?days=7", nil)
	req = req.WithContext(withTestClaims(req.Context()))

	w := httptest.NewRecorder()
	h.Trends(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	var body map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	trends, ok := body["trends"].([]interface{})
	if !ok {
		t.Fatal("expected trends array")
	}
	if len(trends) != 0 {
		t.Errorf("expected empty trends, got %d", len(trends))
	}
}

func TestAnalyticsFlakyTests_NoPool(t *testing.T) {
	h := NewAnalyticsHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/analytics/flaky-tests", nil)
	req = req.WithContext(withTestClaims(req.Context()))

	w := httptest.NewRecorder()
	h.FlakyTests(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestAnalyticsErrorAnalysis_NoPool(t *testing.T) {
	h := NewAnalyticsHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/analytics/error-analysis", nil)
	req = req.WithContext(withTestClaims(req.Context()))

	w := httptest.NewRecorder()
	h.ErrorAnalysis(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestAnalyticsDurationDistribution_NoPool(t *testing.T) {
	h := NewAnalyticsHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/analytics/duration-distribution", nil)
	req = req.WithContext(withTestClaims(req.Context()))

	w := httptest.NewRecorder()
	h.DurationDistribution(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestAnalyticsHealthScore_NoPool(t *testing.T) {
	h := NewAnalyticsHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/analytics/health-score", nil)
	req = req.WithContext(withTestClaims(req.Context()))

	w := httptest.NewRecorder()
	h.HealthScore(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestAnalyticsHealthScore_Unauthorized(t *testing.T) {
	h := NewAnalyticsHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/analytics/health-score", nil)
	w := httptest.NewRecorder()

	h.HealthScore(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestAnalyticsTrends_DaysClamp(t *testing.T) {
	h := NewAnalyticsHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/analytics/trends?days=999", nil)
	req = req.WithContext(withTestClaims(req.Context()))

	w := httptest.NewRecorder()
	h.Trends(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200 even with large days param, got %d", w.Code)
	}
}

func TestAnalyticsTrends_GroupBy(t *testing.T) {
	h := NewAnalyticsHandler(nil)
	for _, gb := range []string{"day", "week", "month"} {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/analytics/trends?group_by="+gb, nil)
		req = req.WithContext(withTestClaims(req.Context()))

		w := httptest.NewRecorder()
		h.Trends(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("group_by=%s: expected 200, got %d", gb, w.Code)
		}
	}
}
