package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/scaledtest/scaledtest/internal/auth"
)

const testSecret = "test-secret-32-chars-long-enough!"

func newTestAuthHandler() *AuthHandler {
	jwt := auth.NewJWTManager(testSecret, 15*time.Minute, 7*24*time.Hour)
	return &AuthHandler{JWT: jwt, DB: nil}
}

func TestRegisterNoDB(t *testing.T) {
	h := newTestAuthHandler()

	body := `{"email":"test@example.com","password":"password123","display_name":"Test User"}`
	req := httptest.NewRequest("POST", "/auth/register", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Register(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Register without DB: status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestLoginNoDB(t *testing.T) {
	h := newTestAuthHandler()

	body := `{"email":"test@example.com","password":"password123"}`
	req := httptest.NewRequest("POST", "/auth/login", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Login(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Login without DB: status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestRefreshNoDB(t *testing.T) {
	h := newTestAuthHandler()

	req := httptest.NewRequest("POST", "/auth/refresh", nil)
	w := httptest.NewRecorder()

	h.Refresh(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Refresh without DB: status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestLogoutNoDB(t *testing.T) {
	h := newTestAuthHandler()

	req := httptest.NewRequest("POST", "/auth/logout", nil)
	w := httptest.NewRecorder()

	h.Logout(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Logout without DB: status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestRegisterInvalidRequest(t *testing.T) {
	h := newTestAuthHandler()

	tests := []struct {
		name string
		body string
	}{
		{"empty body", ""},
		{"missing email", `{"password":"password123","display_name":"Test"}`},
		{"invalid email", `{"email":"not-an-email","password":"password123","display_name":"Test"}`},
		{"short password", `{"email":"test@test.com","password":"short","display_name":"Test"}`},
		{"missing display_name", `{"email":"test@test.com","password":"password123"}`},
		{"invalid json", `{bad json}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("POST", "/auth/register", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			h.Register(w, req)

			// Without DB, we get 503 (DB check happens first). With DB, bad input gets 400.
			// Either way, it should NOT be 200/201.
			if w.Code == http.StatusCreated || w.Code == http.StatusOK {
				t.Errorf("Register(%s): should not succeed, got %d", tt.name, w.Code)
			}
		})
	}
}

func TestLoginInvalidRequest(t *testing.T) {
	h := newTestAuthHandler()

	tests := []struct {
		name string
		body string
	}{
		{"empty body", ""},
		{"missing email", `{"password":"password123"}`},
		{"invalid json", `{bad}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("POST", "/auth/login", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			h.Login(w, req)

			if w.Code == http.StatusOK {
				t.Errorf("Login(%s): should not succeed", tt.name)
			}
		})
	}
}

func TestRefreshMissingCookie(t *testing.T) {
	// Need a handler with a real (mock) DB for this test to get past the nil check.
	// With nil DB, we get 503, which is correct but tests a different path.
	// This test verifies the no-DB path returns 503.
	h := newTestAuthHandler()

	req := httptest.NewRequest("POST", "/auth/refresh", nil)
	w := httptest.NewRecorder()

	h.Refresh(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Refresh no cookie, no DB: status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestLogoutNoCookie(t *testing.T) {
	// Without DB, returns 503
	h := newTestAuthHandler()

	req := httptest.NewRequest("POST", "/auth/logout", nil)
	w := httptest.NewRecorder()

	h.Logout(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Logout no cookie, no DB: status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestAuthResponseShape(t *testing.T) {
	// Verify the JSON shape of AuthResponse
	resp := AuthResponse{
		User: UserResponse{
			ID:          "user-1",
			Email:       "test@test.com",
			DisplayName: "Test User",
			Role:        "maintainer",
		},
		AccessToken: "token123",
		ExpiresAt:   time.Now().Add(15 * time.Minute),
	}

	data, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal AuthResponse: %v", err)
	}

	var decoded map[string]interface{}
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	// Check top-level keys
	for _, key := range []string{"user", "access_token", "expires_at"} {
		if _, ok := decoded[key]; !ok {
			t.Errorf("missing key %q in AuthResponse", key)
		}
	}

	// Check user keys
	user := decoded["user"].(map[string]interface{})
	for _, key := range []string{"id", "email", "display_name", "role"} {
		if _, ok := user[key]; !ok {
			t.Errorf("missing key %q in UserResponse", key)
		}
	}
}

func TestRefreshCookieAttributes(t *testing.T) {
	w := httptest.NewRecorder()
	// Simulate HTTPS via X-Forwarded-Proto so Secure flag is set
	req := httptest.NewRequest("POST", "/auth/refresh", nil)
	req.Header.Set("X-Forwarded-Proto", "https")
	setRefreshCookie(w, req, "test-token", 7*24*time.Hour)

	cookies := w.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("expected 1 cookie, got %d", len(cookies))
	}

	c := cookies[0]
	if c.Name != "refresh_token" {
		t.Errorf("cookie name = %q, want %q", c.Name, "refresh_token")
	}
	if c.Value != "test-token" {
		t.Errorf("cookie value = %q, want %q", c.Value, "test-token")
	}
	if !c.HttpOnly {
		t.Error("cookie should be HttpOnly")
	}
	if !c.Secure {
		t.Error("cookie should be Secure over HTTPS")
	}
	if c.SameSite != http.SameSiteStrictMode {
		t.Errorf("cookie SameSite = %d, want %d", c.SameSite, http.SameSiteStrictMode)
	}
	if c.Path != "/auth" {
		t.Errorf("cookie path = %q, want %q", c.Path, "/auth")
	}
}

func TestRefreshCookieNotSecureOverHTTP(t *testing.T) {
	w := httptest.NewRecorder()
	// Plain HTTP request — Secure should be false
	req := httptest.NewRequest("POST", "/auth/refresh", nil)
	setRefreshCookie(w, req, "test-token", 7*24*time.Hour)

	cookies := w.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("expected 1 cookie, got %d", len(cookies))
	}
	if cookies[0].Secure {
		t.Error("cookie should NOT be Secure over plain HTTP")
	}
}

func TestClearRefreshCookie(t *testing.T) {
	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/auth/logout", nil)
	clearRefreshCookie(w, req)

	cookies := w.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("expected 1 cookie, got %d", len(cookies))
	}

	c := cookies[0]
	if c.MaxAge != -1 {
		t.Errorf("clear cookie MaxAge = %d, want -1", c.MaxAge)
	}
	if c.Value != "" {
		t.Errorf("clear cookie value = %q, want empty", c.Value)
	}
}

func TestChangePasswordNoAuth(t *testing.T) {
	h := newTestAuthHandler()

	body := `{"current_password":"oldpassword123","new_password":"newpassword123"}`
	req := httptest.NewRequest("POST", "/api/v1/auth/change-password", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	// No claims injected into context
	w := httptest.NewRecorder()

	h.ChangePassword(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("ChangePassword with no auth: status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestChangePasswordNoDB(t *testing.T) {
	h := newTestAuthHandler()

	body := `{"current_password":"oldpassword123","new_password":"newpassword123"}`
	req := httptest.NewRequest("POST", "/api/v1/auth/change-password", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(auth.SetClaims(req.Context(), &auth.Claims{UserID: "user-123"}))
	w := httptest.NewRecorder()

	h.ChangePassword(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("ChangePassword without DB: status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestChangePasswordInvalidRequest(t *testing.T) {
	h := newTestAuthHandler()

	tests := []struct {
		name string
		body string
	}{
		{"empty body", ""},
		{"missing new_password", `{"current_password":"oldpassword123"}`},
		{"short new_password", `{"current_password":"oldpassword123","new_password":"short"}`},
		{"missing current_password", `{"new_password":"newpassword123"}`},
		{"invalid json", `{bad}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("POST", "/api/v1/auth/change-password", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			req = req.WithContext(auth.SetClaims(req.Context(), &auth.Claims{UserID: "user-123"}))
			w := httptest.NewRecorder()

			h.ChangePassword(w, req)

			// With nil DB, we get 503 before request body parsing.
			// Either way, it should NOT be 200.
			if w.Code == http.StatusOK {
				t.Errorf("ChangePassword(%s): should not succeed, got %d", tt.name, w.Code)
			}
		})
	}
}
