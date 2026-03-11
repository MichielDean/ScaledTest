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

// testCSRFToken fetches a CSRF token from the router and returns the token
// value plus the cookie to attach to subsequent requests.
func testCSRFToken(t *testing.T, router http.Handler) (string, *http.Cookie) {
	t.Helper()
	req := httptest.NewRequest("GET", "/auth/csrf-token", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("GET /auth/csrf-token status = %d, want 200", w.Code)
	}
	cookies := w.Result().Cookies()
	var csrfCookie *http.Cookie
	for _, c := range cookies {
		if c.Name == "__csrf_token" {
			csrfCookie = c
			break
		}
	}
	if csrfCookie == nil {
		t.Fatal("csrf-token endpoint did not set __csrf_token cookie")
	}
	return csrfCookie.Value, csrfCookie
}

// addCSRF adds CSRF cookie and header to a request.
func addCSRF(req *http.Request, token string, cookie *http.Cookie) {
	req.AddCookie(cookie)
	req.Header.Set("X-CSRF-Token", token)
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
		{"GET", "/api/v1/reports", http.StatusServiceUnavailable},                        // no DB configured
		{"GET", "/api/v1/executions", http.StatusServiceUnavailable},                      // no DB configured
		{"GET", "/api/v1/analytics/trends", http.StatusServiceUnavailable},                // no DB configured
		{"GET", "/api/v1/analytics/flaky-tests", http.StatusServiceUnavailable},           // no DB configured
		{"GET", "/api/v1/analytics/error-analysis", http.StatusServiceUnavailable},        // no DB configured
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
	csrfToken, csrfCookie := testCSRFToken(t, router)

	report := `{"results":{"tool":{"name":"jest"},"summary":{"tests":2,"passed":1,"failed":1,"skipped":0,"pending":0,"other":0},"tests":[{"name":"test1","status":"passed","duration":100},{"name":"test2","status":"failed","duration":200,"message":"oops"}]}}`

	req := httptest.NewRequest("POST", "/api/v1/reports", strings.NewReader(report))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	addCSRF(req, csrfToken, csrfCookie)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("POST /api/v1/reports status = %d, want %d (body: %s)", w.Code, http.StatusCreated, w.Body.String())
	}
}

func TestCTRFReportInvalidPayload(t *testing.T) {
	router := NewRouter(testConfig(), nil)
	token := testToken()
	csrfToken, csrfCookie := testCSRFToken(t, router)

	req := httptest.NewRequest("POST", "/api/v1/reports", strings.NewReader(`{invalid json}`))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	addCSRF(req, csrfToken, csrfCookie)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("invalid CTRF: status = %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestCSRFTokenEndpoint(t *testing.T) {
	router := NewRouter(testConfig(), nil)
	csrfToken, cookie := testCSRFToken(t, router)

	if csrfToken == "" {
		t.Error("CSRF token is empty")
	}
	if cookie.Value != csrfToken {
		t.Error("cookie value doesn't match response token")
	}
	if cookie.HttpOnly {
		t.Error("CSRF cookie should not be HttpOnly")
	}
}

func TestCSRFBlocksMutationWithoutToken(t *testing.T) {
	router := NewRouter(testConfig(), nil)
	token := testToken()

	req := httptest.NewRequest("POST", "/api/v1/reports", strings.NewReader(`{}`))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("POST without CSRF: status = %d, want %d", w.Code, http.StatusForbidden)
	}
}

func TestAuthRateLimiting(t *testing.T) {
	router := NewRouter(testConfig(), nil)

	// Auth endpoints allow 10 requests per minute per IP.
	// Send 11 requests — the 11th should be rate-limited.
	for i := 0; i < 10; i++ {
		req := httptest.NewRequest("POST", "/auth/login", strings.NewReader(`{"email":"a@b.com","password":"12345678"}`))
		req.Header.Set("Content-Type", "application/json")
		req.RemoteAddr = "10.0.0.1:1234"
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		if w.Code == http.StatusTooManyRequests {
			t.Fatalf("request %d was rate-limited too early", i+1)
		}
	}

	req := httptest.NewRequest("POST", "/auth/login", strings.NewReader(`{"email":"a@b.com","password":"12345678"}`))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "10.0.0.1:1234"
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusTooManyRequests {
		t.Errorf("11th auth request: status = %d, want %d", w.Code, http.StatusTooManyRequests)
	}
	if ra := w.Header().Get("Retry-After"); ra == "" {
		t.Error("rate-limited response missing Retry-After header")
	}
}

func TestExecutionCreateRateLimiting(t *testing.T) {
	router := NewRouter(testConfig(), nil)
	token := testToken()
	csrfToken, csrfCookie := testCSRFToken(t, router)

	// Execution creation allows 20 requests per minute per IP.
	// Send 21 requests — the 21st should be rate-limited.
	for i := 0; i < 20; i++ {
		req := httptest.NewRequest("POST", "/api/v1/executions", strings.NewReader(`{}`))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		req.RemoteAddr = "10.0.0.2:1234"
		addCSRF(req, csrfToken, csrfCookie)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		if w.Code == http.StatusTooManyRequests {
			t.Fatalf("request %d was rate-limited too early", i+1)
		}
	}

	req := httptest.NewRequest("POST", "/api/v1/executions", strings.NewReader(`{}`))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "10.0.0.2:1234"
	addCSRF(req, csrfToken, csrfCookie)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusTooManyRequests {
		t.Errorf("21st execution create request: status = %d, want %d", w.Code, http.StatusTooManyRequests)
	}
	if ra := w.Header().Get("Retry-After"); ra == "" {
		t.Error("rate-limited response missing Retry-After header")
	}
}

func TestReportUploadRateLimiting(t *testing.T) {
	router := NewRouter(testConfig(), nil)
	token := testToken()
	csrfToken, csrfCookie := testCSRFToken(t, router)

	report := `{"results":{"tool":{"name":"jest"},"summary":{"tests":1,"passed":1,"failed":0,"skipped":0,"pending":0,"other":0},"tests":[{"name":"t1","status":"passed","duration":10}]}}`

	// Report uploads allow 30 requests per minute per IP.
	// Send 31 — the 31st should be rate-limited.
	for i := 0; i < 30; i++ {
		req := httptest.NewRequest("POST", "/api/v1/reports", strings.NewReader(report))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		req.RemoteAddr = "10.0.0.3:1234"
		addCSRF(req, csrfToken, csrfCookie)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		if w.Code == http.StatusTooManyRequests {
			t.Fatalf("request %d was rate-limited too early", i+1)
		}
	}

	req := httptest.NewRequest("POST", "/api/v1/reports", strings.NewReader(report))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "10.0.0.3:1234"
	addCSRF(req, csrfToken, csrfCookie)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusTooManyRequests {
		t.Errorf("31st report upload request: status = %d, want %d", w.Code, http.StatusTooManyRequests)
	}
	if ra := w.Header().Get("Retry-After"); ra == "" {
		t.Error("rate-limited response missing Retry-After header")
	}
}

func TestCSRFAllowsAPITokenWithoutCSRF(t *testing.T) {
	router := NewRouter(testConfig(), nil)

	// API tokens (sct_) should bypass CSRF — they'll fail auth (no DB) but not CSRF
	req := httptest.NewRequest("POST", "/api/v1/reports", strings.NewReader(`{}`))
	req.Header.Set("Authorization", "sct_test-api-token")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Should get 401 (api tokens not configured) not 403 (CSRF)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("sct_ POST without CSRF: status = %d, want %d (body: %s)", w.Code, http.StatusUnauthorized, w.Body.String())
	}
}
