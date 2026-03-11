package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/scaledtest/scaledtest/internal/auth"
	"github.com/scaledtest/scaledtest/internal/config"
)

const testJWTSecret = "test-secret-32-chars-long-enough!"

func testConfig() *config.Config {
	return &config.Config{
		Port:               8080,
		BaseURL:            "http://localhost:8080",
		JWTSecret:          testJWTSecret,
		JWTAccessDuration:  "15m",
		JWTRefreshDuration: "168h",
	}
}

func testToken() string {
	mgr := auth.NewJWTManager(testJWTSecret, 15*time.Minute, 7*24*time.Hour)
	pair, _ := mgr.GenerateTokenPair("user-1", "test@example.com", "owner", "team-1")
	return pair.AccessToken
}

func TestHealthEndpoint(t *testing.T) {
	router := NewRouter(testConfig(), nil)

	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("GET /health status = %d, want %d", w.Code, http.StatusOK)
	}
	if body := w.Body.String(); !strings.Contains(body, `"ok"`) {
		t.Errorf("GET /health body = %q", body)
	}
}

func TestPublicAuthEndpoints(t *testing.T) {
	router := NewRouter(testConfig(), nil)

	endpoints := []struct {
		method string
		path   string
	}{
		{"POST", "/auth/register"},
		{"POST", "/auth/login"},
		{"POST", "/auth/refresh"},
		{"POST", "/auth/logout"},
	}

	for _, ep := range endpoints {
		body := `{"email":"test@test.com","password":"12345678","display_name":"Test"}`
		req := httptest.NewRequest(ep.method, ep.path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		// Auth endpoints should return either 400 (validation) or 501 (not implemented) — but NOT 401
		if w.Code == http.StatusUnauthorized {
			t.Errorf("%s %s should be public, got 401", ep.method, ep.path)
		}
	}
}

func TestAuthenticatedEndpointsRequireToken(t *testing.T) {
	router := NewRouter(testConfig(), nil)

	endpoints := []struct {
		method string
		path   string
	}{
		{"GET", "/api/v1/reports"},
		{"GET", "/api/v1/executions"},
		{"GET", "/api/v1/analytics/trends"},
		{"GET", "/api/v1/quality-gates"},
		{"GET", "/api/v1/teams"},
	}

	for _, ep := range endpoints {
		req := httptest.NewRequest(ep.method, ep.path, nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Errorf("%s %s without token: status = %d, want %d", ep.method, ep.path, w.Code, http.StatusUnauthorized)
		}
	}
}

func TestAuthenticatedEndpointsWithToken(t *testing.T) {
	router := NewRouter(testConfig(), nil)
	token := testToken()

	endpoints := []struct {
		method     string
		path       string
		wantStatus int
	}{
		{"GET", "/api/v1/reports", http.StatusOK},
		{"GET", "/api/v1/executions", http.StatusServiceUnavailable},              // no DB configured
		{"GET", "/api/v1/analytics/trends", http.StatusServiceUnavailable},          // no DB configured
		{"GET", "/api/v1/analytics/flaky-tests", http.StatusServiceUnavailable},     // no DB configured
		{"GET", "/api/v1/analytics/error-analysis", http.StatusServiceUnavailable},  // no DB configured
		{"GET", "/api/v1/analytics/duration-distribution", http.StatusServiceUnavailable}, // no DB configured
		{"GET", "/api/v1/quality-gates", http.StatusOK},
		{"GET", "/api/v1/teams", http.StatusOK},
		{"GET", "/api/v1/admin/users", http.StatusOK}, // owner role
	}

	for _, ep := range endpoints {
		req := httptest.NewRequest(ep.method, ep.path, nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != ep.wantStatus {
			t.Errorf("%s %s status = %d, want %d (body: %s)", ep.method, ep.path, w.Code, ep.wantStatus, w.Body.String())
		}
	}
}

func TestAdminEndpointRequiresOwnerRole(t *testing.T) {
	router := NewRouter(testConfig(), nil)

	// Create a token with readonly role
	mgr := auth.NewJWTManager(testJWTSecret, 15*time.Minute, 7*24*time.Hour)
	pair, _ := mgr.GenerateTokenPair("user-2", "readonly@example.com", "readonly", "team-1")

	req := httptest.NewRequest("GET", "/api/v1/admin/users", nil)
	req.Header.Set("Authorization", "Bearer "+pair.AccessToken)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("admin with readonly role: status = %d, want %d", w.Code, http.StatusForbidden)
	}
}

func TestCTRFReportIngestion(t *testing.T) {
	router := NewRouter(testConfig(), nil)
	token := testToken()

	report := `{"results":{"tool":{"name":"jest"},"summary":{"tests":2,"passed":1,"failed":1,"skipped":0,"pending":0,"other":0},"tests":[{"name":"test1","status":"passed","duration":100},{"name":"test2","status":"failed","duration":200,"message":"oops"}]}}`

	req := httptest.NewRequest("POST", "/api/v1/reports", strings.NewReader(report))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("POST /api/v1/reports status = %d, want %d (body: %s)", w.Code, http.StatusCreated, w.Body.String())
	}
}

func TestCTRFReportInvalidPayload(t *testing.T) {
	router := NewRouter(testConfig(), nil)
	token := testToken()

	req := httptest.NewRequest("POST", "/api/v1/reports", strings.NewReader(`{invalid json}`))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("invalid CTRF: status = %d, want %d", w.Code, http.StatusBadRequest)
	}
}
