package auth

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestJWTRoundTrip(t *testing.T) {
	mgr := NewJWTManager("test-secret-32-chars-long-enough!", 15*time.Minute, 7*24*time.Hour)

	pair, err := mgr.GenerateTokenPair("user-123", "test@example.com", "maintainer", "team-456")
	if err != nil {
		t.Fatalf("GenerateTokenPair() error: %v", err)
	}

	if pair.AccessToken == "" {
		t.Error("AccessToken is empty")
	}
	if pair.RefreshToken == "" {
		t.Error("RefreshToken is empty")
	}
	if pair.ExpiresAt.Before(time.Now()) {
		t.Error("ExpiresAt is in the past")
	}

	claims, err := mgr.ValidateAccessToken(pair.AccessToken)
	if err != nil {
		t.Fatalf("ValidateAccessToken() error: %v", err)
	}

	if claims.UserID != "user-123" {
		t.Errorf("UserID = %q, want %q", claims.UserID, "user-123")
	}
	if claims.Email != "test@example.com" {
		t.Errorf("Email = %q, want %q", claims.Email, "test@example.com")
	}
	if claims.Role != "maintainer" {
		t.Errorf("Role = %q, want %q", claims.Role, "maintainer")
	}
	if claims.TeamID != "team-456" {
		t.Errorf("TeamID = %q, want %q", claims.TeamID, "team-456")
	}
}

func TestJWTExpiredToken(t *testing.T) {
	mgr := NewJWTManager("test-secret-32-chars-long-enough!", -1*time.Second, 7*24*time.Hour)

	pair, err := mgr.GenerateTokenPair("user-123", "test@example.com", "maintainer", "")
	if err != nil {
		t.Fatalf("GenerateTokenPair() error: %v", err)
	}

	_, err = mgr.ValidateAccessToken(pair.AccessToken)
	if err == nil {
		t.Error("expected error for expired token, got nil")
	}
}

func TestJWTInvalidSecret(t *testing.T) {
	mgr1 := NewJWTManager("secret-one-that-is-long-enough!!", 15*time.Minute, 7*24*time.Hour)
	mgr2 := NewJWTManager("secret-two-that-is-long-enough!!", 15*time.Minute, 7*24*time.Hour)

	pair, _ := mgr1.GenerateTokenPair("user-123", "test@example.com", "maintainer", "")

	_, err := mgr2.ValidateAccessToken(pair.AccessToken)
	if err == nil {
		t.Error("expected error for wrong secret, got nil")
	}
}

func TestPasswordHashAndCheck(t *testing.T) {
	hash, err := HashPassword("mypassword123")
	if err != nil {
		t.Fatalf("HashPassword() error: %v", err)
	}

	if !CheckPassword("mypassword123", hash) {
		t.Error("CheckPassword() returned false for correct password")
	}
	if CheckPassword("wrongpassword", hash) {
		t.Error("CheckPassword() returned true for wrong password")
	}
}

func TestAPITokenGeneration(t *testing.T) {
	result, err := GenerateAPIToken()
	if err != nil {
		t.Fatalf("GenerateAPIToken() error: %v", err)
	}

	if !strings.HasPrefix(result.Token, "sct_") {
		t.Errorf("Token = %q, want sct_ prefix", result.Token)
	}
	if len(result.TokenHash) != 64 { // SHA-256 hex = 64 chars
		t.Errorf("TokenHash length = %d, want 64", len(result.TokenHash))
	}
	if len(result.Prefix) != 8 {
		t.Errorf("Prefix length = %d, want 8", len(result.Prefix))
	}

	// Verify HashAPIToken matches
	rehash := HashAPIToken(result.Token)
	if rehash != result.TokenHash {
		t.Error("HashAPIToken() does not match generated hash")
	}
}

func TestAPITokenUniqueness(t *testing.T) {
	t1, _ := GenerateAPIToken()
	t2, _ := GenerateAPIToken()

	if t1.Token == t2.Token {
		t.Error("two generated tokens are identical")
	}
	if t1.TokenHash == t2.TokenHash {
		t.Error("two generated token hashes are identical")
	}
}

func TestMiddlewareNoToken(t *testing.T) {
	mgr := NewJWTManager("test-secret-32-chars-long-enough!", 15*time.Minute, 7*24*time.Hour)
	mw := Middleware(mgr, nil)

	handler := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
	if ct := w.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q, want %q", ct, "application/json")
	}
}

func TestMiddlewareQueryTokenBlockedForNonWebSocket(t *testing.T) {
	mgr := NewJWTManager("test-secret-32-chars-long-enough!", 15*time.Minute, 7*24*time.Hour)
	pair, _ := mgr.GenerateTokenPair("user-1", "test@example.com", "owner", "team-1")

	mw := Middleware(mgr, nil)
	handler := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Regular HTTP request with token in query param should be rejected
	req := httptest.NewRequest("GET", "/test?token="+pair.AccessToken, nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("non-WS query token: status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestMiddlewareQueryTokenAllowedForWebSocket(t *testing.T) {
	mgr := NewJWTManager("test-secret-32-chars-long-enough!", 15*time.Minute, 7*24*time.Hour)
	pair, _ := mgr.GenerateTokenPair("user-1", "test@example.com", "owner", "team-1")

	mw := Middleware(mgr, nil)
	handler := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims := GetClaims(r.Context())
		if claims == nil || claims.UserID != "user-1" {
			t.Error("expected valid claims for WS query token")
		}
		w.WriteHeader(http.StatusOK)
	}))

	// WebSocket upgrade request with token in query param should be allowed
	req := httptest.NewRequest("GET", "/ws?token="+pair.AccessToken, nil)
	req.Header.Set("Upgrade", "websocket")
	req.Header.Set("Connection", "Upgrade")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("WS query token: status = %d, want %d", w.Code, http.StatusOK)
	}
}

func TestMiddlewareValidJWT(t *testing.T) {
	mgr := NewJWTManager("test-secret-32-chars-long-enough!", 15*time.Minute, 7*24*time.Hour)
	mw := Middleware(mgr, nil)

	pair, _ := mgr.GenerateTokenPair("user-123", "test@example.com", "owner", "team-1")

	handler := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims := GetClaims(r.Context())
		if claims == nil {
			t.Error("claims are nil in handler")
			return
		}
		if claims.UserID != "user-123" {
			t.Errorf("UserID = %q, want %q", claims.UserID, "user-123")
		}
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+pair.AccessToken)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}
}

func TestMiddlewareAPIToken(t *testing.T) {
	mgr := NewJWTManager("test-secret-32-chars-long-enough!", 15*time.Minute, 7*24*time.Hour)

	apiToken, _ := GenerateAPIToken()
	expectedClaims := &Claims{
		UserID: "api-user",
		Role:   "maintainer",
		TeamID: "team-99",
	}

	lookup := func(hash string) (*Claims, error) {
		if hash == apiToken.TokenHash {
			return expectedClaims, nil
		}
		return nil, http.ErrNoCookie // arbitrary error
	}

	mw := Middleware(mgr, lookup)

	handler := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims := GetClaims(r.Context())
		if claims.UserID != "api-user" {
			t.Errorf("UserID = %q, want %q", claims.UserID, "api-user")
		}
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", apiToken.Token)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}
}

func TestRequireRole(t *testing.T) {
	mgr := NewJWTManager("test-secret-32-chars-long-enough!", 15*time.Minute, 7*24*time.Hour)

	tests := []struct {
		name         string
		userRole     string
		allowedRoles []string
		wantStatus   int
	}{
		{"owner allowed", "owner", []string{"owner"}, http.StatusOK},
		{"maintainer allowed", "maintainer", []string{"maintainer", "owner"}, http.StatusOK},
		{"readonly forbidden", "readonly", []string{"maintainer", "owner"}, http.StatusForbidden},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pair, _ := mgr.GenerateTokenPair("user-1", "test@example.com", tt.userRole, "")

			authMW := Middleware(mgr, nil)
			roleMW := RequireRole(tt.allowedRoles...)

			handler := authMW(roleMW(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			})))

			req := httptest.NewRequest("GET", "/test", nil)
			req.Header.Set("Authorization", "Bearer "+pair.AccessToken)
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("status = %d, want %d", w.Code, tt.wantStatus)
			}
		})
	}
}
