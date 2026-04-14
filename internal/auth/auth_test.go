package auth

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestJWTRoundTrip(t *testing.T) {
	mgr, _ := NewJWTManager("test-secret-32-chars-long-enough!", 15*time.Minute, 7*24*time.Hour)

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
	mgr, _ := NewJWTManager("test-secret-32-chars-long-enough!", -1*time.Second, 7*24*time.Hour)

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
	mgr1, _ := NewJWTManager("secret-one-that-is-long-enough!!", 15*time.Minute, 7*24*time.Hour)
	mgr2, _ := NewJWTManager("secret-two-that-is-long-enough!!", 15*time.Minute, 7*24*time.Hour)

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
	mgr, _ := NewJWTManager("test-secret-32-chars-long-enough!", 15*time.Minute, 7*24*time.Hour)
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
	mgr, _ := NewJWTManager("test-secret-32-chars-long-enough!", 15*time.Minute, 7*24*time.Hour)
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
	mgr, _ := NewJWTManager("test-secret-32-chars-long-enough!", 15*time.Minute, 7*24*time.Hour)
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
	mgr, _ := NewJWTManager("test-secret-32-chars-long-enough!", 15*time.Minute, 7*24*time.Hour)
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
	mgr, _ := NewJWTManager("test-secret-32-chars-long-enough!", 15*time.Minute, 7*24*time.Hour)

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

// --- JWT edge cases ---

func TestJWTMalformedToken(t *testing.T) {
	mgr, _ := NewJWTManager("test-secret-32-chars-long-enough!", 15*time.Minute, 7*24*time.Hour)

	malformed := []string{
		"",
		"not-a-jwt",
		"three.parts.here",
		"eyJhbGciOiJIUzI1NiJ9.invalid-payload.invalid-sig",
		"a]b]c",
		"eyJhbGciOiJub25lIn0.eyJ1aWQiOiJ1c2VyLTEifQ.", // alg: none
	}

	for _, tok := range malformed {
		_, err := mgr.ValidateAccessToken(tok)
		if err == nil {
			t.Errorf("ValidateAccessToken(%q) should fail", tok)
		}
	}
}

func TestJWTShortSecretReturnsError(t *testing.T) {
	_, err := NewJWTManager("short", 15*time.Minute, 7*24*time.Hour)
	if err == nil {
		t.Error("expected error for short secret, got nil")
	}
}

func TestJWTEmptyTeamID(t *testing.T) {
	mgr, _ := NewJWTManager("test-secret-32-chars-long-enough!", 15*time.Minute, 7*24*time.Hour)
	pair, err := mgr.GenerateTokenPair("user-1", "test@example.com", "owner", "")
	if err != nil {
		t.Fatalf("GenerateTokenPair() error: %v", err)
	}

	claims, err := mgr.ValidateAccessToken(pair.AccessToken)
	if err != nil {
		t.Fatalf("ValidateAccessToken() error: %v", err)
	}
	if claims.TeamID != "" {
		t.Errorf("TeamID = %q, want empty string", claims.TeamID)
	}
}

func TestJWTExpiresAtInFuture(t *testing.T) {
	mgr, _ := NewJWTManager("test-secret-32-chars-long-enough!", 5*time.Minute, 7*24*time.Hour)
	pair, _ := mgr.GenerateTokenPair("u", "e@e.com", "owner", "")

	if !pair.ExpiresAt.After(time.Now()) {
		t.Error("ExpiresAt should be in the future")
	}
	if pair.ExpiresAt.After(time.Now().Add(6 * time.Minute)) {
		t.Error("ExpiresAt should be within ~5min")
	}
}

func TestRefreshDuration(t *testing.T) {
	mgr, _ := NewJWTManager("test-secret-32-chars-long-enough!", 15*time.Minute, 48*time.Hour)
	if mgr.RefreshDuration() != 48*time.Hour {
		t.Errorf("RefreshDuration = %v, want 48h", mgr.RefreshDuration())
	}
}

func TestRefreshTokenRandomness(t *testing.T) {
	mgr, _ := NewJWTManager("test-secret-32-chars-long-enough!", 15*time.Minute, 7*24*time.Hour)
	p1, _ := mgr.GenerateTokenPair("u", "e@e.com", "owner", "")
	p2, _ := mgr.GenerateTokenPair("u", "e@e.com", "owner", "")
	if p1.RefreshToken == p2.RefreshToken {
		t.Error("refresh tokens should be unique")
	}
	if len(p1.RefreshToken) < 32 {
		t.Errorf("refresh token too short: %d chars", len(p1.RefreshToken))
	}
}

// --- Middleware edge cases ---

func TestMiddlewareExpiredJWT(t *testing.T) {
	mgr, _ := NewJWTManager("test-secret-32-chars-long-enough!", -1*time.Second, 7*24*time.Hour)
	mw := Middleware(mgr, nil)

	pair, _ := mgr.GenerateTokenPair("user-1", "test@example.com", "owner", "")

	handler := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("handler should not be called for expired token")
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+pair.AccessToken)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expired JWT: status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestMiddlewareInvalidAPIToken(t *testing.T) {
	mgr, _ := NewJWTManager("test-secret-32-chars-long-enough!", 15*time.Minute, 7*24*time.Hour)

	lookup := func(hash string) (*Claims, error) {
		return nil, fmt.Errorf("token not found")
	}

	mw := Middleware(mgr, lookup)
	handler := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("handler should not be called for invalid API token")
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "sct_invalid_token_hash")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("invalid API token: status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestMiddlewareAPITokenNoLookupConfigured(t *testing.T) {
	mgr, _ := NewJWTManager("test-secret-32-chars-long-enough!", 15*time.Minute, 7*24*time.Hour)

	// tokenLookup is nil — API tokens should be rejected
	mw := Middleware(mgr, nil)
	handler := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("handler should not be called when API tokens not configured")
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "sct_some_token")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("API token with nil lookup: status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestMiddlewareBearerWithAPITokenPrefix(t *testing.T) {
	mgr, _ := NewJWTManager("test-secret-32-chars-long-enough!", 15*time.Minute, 7*24*time.Hour)

	apiToken, _ := GenerateAPIToken()
	expectedClaims := &Claims{UserID: "api-user", Role: "owner", TeamID: "team-1"}

	lookup := func(hash string) (*Claims, error) {
		if hash == apiToken.TokenHash {
			return expectedClaims, nil
		}
		return nil, fmt.Errorf("not found")
	}

	mw := Middleware(mgr, lookup)
	handler := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims := GetClaims(r.Context())
		if claims == nil || claims.UserID != "api-user" {
			t.Error("expected valid claims for Bearer sct_ token")
		}
		w.WriteHeader(http.StatusOK)
	}))

	// "Bearer sct_..." should work (Bearer prefix stripped, sct_ prefix detected)
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+apiToken.Token)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Bearer sct_ token: status = %d, want %d", w.Code, http.StatusOK)
	}
}

func TestMiddlewareMalformedAuthHeader(t *testing.T) {
	mgr, _ := NewJWTManager("test-secret-32-chars-long-enough!", 15*time.Minute, 7*24*time.Hour)
	mw := Middleware(mgr, nil)

	handler := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("handler should not be called for malformed auth header")
	}))

	headers := []string{
		"Bearer ",            // empty token after prefix
		"Basic dXNlcjpwYXNz", // basic auth (not supported)
		"InvalidScheme xyz",
		"Bearer", // no space after Bearer
	}

	for _, h := range headers {
		req := httptest.NewRequest("GET", "/test", nil)
		req.Header.Set("Authorization", h)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Errorf("header %q: status = %d, want %d", h, w.Code, http.StatusUnauthorized)
		}
	}
}

func TestRequireRoleNoClaims(t *testing.T) {
	roleMW := RequireRole("owner")
	handler := roleMW(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("handler should not be called without claims")
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("RequireRole no claims: status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestGetClaimsNilContext(t *testing.T) {
	req := httptest.NewRequest("GET", "/test", nil)
	claims := GetClaims(req.Context())
	if claims != nil {
		t.Errorf("GetClaims with no claims set: got %v, want nil", claims)
	}
}

// --- Password edge cases ---

func TestPasswordEmptyString(t *testing.T) {
	hash, err := HashPassword("")
	if err != nil {
		t.Fatalf("HashPassword empty: %v", err)
	}
	if !CheckPassword("", hash) {
		t.Error("CheckPassword should match empty password")
	}
	if CheckPassword("notempty", hash) {
		t.Error("CheckPassword should not match different password")
	}
}

func TestPasswordHashUniqueness(t *testing.T) {
	h1, _ := HashPassword("same")
	h2, _ := HashPassword("same")
	if h1 == h2 {
		t.Error("same password should produce different hashes (bcrypt salting)")
	}
}

func TestRequireRole(t *testing.T) {
	mgr, _ := NewJWTManager("test-secret-32-chars-long-enough!", 15*time.Minute, 7*24*time.Hour)

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
