package auth

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

var testHMACKey = []byte("test-hmac-key-for-csrf-testing!!")

func mustCSRFMW(t *testing.T) func(http.Handler) http.Handler {
	t.Helper()
	mw, err := CSRFMiddleware(testHMACKey)
	if err != nil {
		t.Fatalf("CSRFMiddleware() error: %v", err)
	}
	return mw
}

func TestCSRFMiddleware_SafeMethodsPass(t *testing.T) {
	handler := mustCSRFMW(t)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	for _, method := range []string{"GET", "HEAD", "OPTIONS"} {
		req := httptest.NewRequest(method, "/test", nil)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("%s: status = %d, want %d", method, w.Code, http.StatusOK)
		}
	}
}

func TestCSRFMiddleware_APITokenSkipsCRSF(t *testing.T) {
	handler := mustCSRFMW(t)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("POST", "/test", nil)
	req.Header.Set("Authorization", "sct_some-api-token")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("API token POST: status = %d, want %d", w.Code, http.StatusOK)
	}
}

func TestCSRFMiddleware_BearerJWTSkipsCSRF(t *testing.T) {
	handler := mustCSRFMW(t)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	for _, method := range []string{"POST", "PUT", "DELETE", "PATCH"} {
		req := httptest.NewRequest(method, "/test", nil)
		req.Header.Set("Authorization", "Bearer some-jwt-token")
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("Bearer JWT %s: status = %d, want %d", method, w.Code, http.StatusOK)
		}
	}
}

func TestCSRFMiddleware_MissingCookieRejects(t *testing.T) {
	handler := mustCSRFMW(t)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("POST", "/test", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("no cookie POST: status = %d, want %d", w.Code, http.StatusForbidden)
	}
}

func TestCSRFMiddleware_MissingHeaderRejects(t *testing.T) {
	handler := mustCSRFMW(t)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	token, _ := generateSignedToken(testHMACKey)
	req := httptest.NewRequest("POST", "/test", nil)
	req.AddCookie(&http.Cookie{Name: csrfCookieName, Value: token})
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("no header POST: status = %d, want %d", w.Code, http.StatusForbidden)
	}
}

func TestCSRFMiddleware_MismatchRejects(t *testing.T) {
	handler := mustCSRFMW(t)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	token1, _ := generateSignedToken(testHMACKey)
	token2, _ := generateSignedToken(testHMACKey)

	req := httptest.NewRequest("POST", "/test", nil)
	req.AddCookie(&http.Cookie{Name: csrfCookieName, Value: token1})
	req.Header.Set(csrfHeaderName, token2)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("mismatched tokens: status = %d, want %d", w.Code, http.StatusForbidden)
	}
}

func TestCSRFMiddleware_ValidDoubleSubmitPasses(t *testing.T) {
	handler := mustCSRFMW(t)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	token, _ := generateSignedToken(testHMACKey)

	for _, method := range []string{"POST", "PUT", "DELETE", "PATCH"} {
		req := httptest.NewRequest(method, "/test", nil)
		req.AddCookie(&http.Cookie{Name: csrfCookieName, Value: token})
		req.Header.Set(csrfHeaderName, token)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("%s with valid CSRF: status = %d, want %d", method, w.Code, http.StatusOK)
		}
	}
}

func TestCSRFMiddleware_ForgedSignatureRejects(t *testing.T) {
	handler := mustCSRFMW(t)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	badToken, _ := generateSignedToken([]byte("wrong-key-for-testing-purposes!!"))

	req := httptest.NewRequest("POST", "/test", nil)
	req.AddCookie(&http.Cookie{Name: csrfCookieName, Value: badToken})
	req.Header.Set(csrfHeaderName, badToken)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("forged signature: status = %d, want %d", w.Code, http.StatusForbidden)
	}
}

func TestCSRFMiddleware_MalformedTokenRejects(t *testing.T) {
	handler := mustCSRFMW(t)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	badToken := "not-a-valid-token-no-dot"

	req := httptest.NewRequest("POST", "/test", nil)
	req.AddCookie(&http.Cookie{Name: csrfCookieName, Value: badToken})
	req.Header.Set(csrfHeaderName, badToken)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("malformed token: status = %d, want %d", w.Code, http.StatusForbidden)
	}
}

func TestCSRFMiddleware_NilKeyReturnsError(t *testing.T) {
	_, err := CSRFMiddleware(nil)
	if err == nil {
		t.Error("CSRFMiddleware with nil key should return error")
	}
}

func TestCSRFMiddleware_EmptyKeyReturnsError(t *testing.T) {
	_, err := CSRFMiddleware([]byte{})
	if err == nil {
		t.Error("CSRFMiddleware with empty key should return error")
	}
}

func TestGenerateSignedToken_EmptyKeyReturnsError(t *testing.T) {
	_, err := generateSignedToken(nil)
	if err == nil {
		t.Error("generateSignedToken with nil key should return error")
	}
}

func TestSetCSRFCookie(t *testing.T) {
	w := httptest.NewRecorder()
	token, err := SetCSRFCookie(w, testHMACKey, false)
	if err != nil {
		t.Fatalf("SetCSRFCookie() error: %v", err)
	}

	if token == "" {
		t.Fatal("SetCSRFCookie returned empty token")
	}
	if !validSignedToken(token, testHMACKey) {
		t.Error("returned token has invalid signature")
	}

	cookies := w.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("expected 1 cookie, got %d", len(cookies))
	}
	c := cookies[0]
	if c.Name != csrfCookieName {
		t.Errorf("cookie name = %q, want %q", c.Name, csrfCookieName)
	}
	if c.Value != token {
		t.Error("cookie value doesn't match returned token")
	}
	if c.HttpOnly {
		t.Error("cookie should not be HttpOnly (JS must read it)")
	}
}

func TestSetCSRFCookie_NilKeyReturnsError(t *testing.T) {
	w := httptest.NewRecorder()
	_, err := SetCSRFCookie(w, nil, false)
	if err == nil {
		t.Error("SetCSRFCookie with nil key should return error")
	}
}

func TestSignedTokenRoundTrip(t *testing.T) {
	token, err := generateSignedToken(testHMACKey)
	if err != nil {
		t.Fatalf("generateSignedToken() error: %v", err)
	}
	if !validSignedToken(token, testHMACKey) {
		t.Error("generated token fails validation")
	}
}

func TestGenerateSignedToken_Success(t *testing.T) {
	token, err := generateSignedToken(testHMACKey)
	if err != nil {
		t.Fatalf("generateSignedToken() unexpected error: %v", err)
	}
	if token == "" {
		t.Error("generateSignedToken() returned empty token")
	}
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 {
		t.Errorf("token format invalid: expected two parts separated by '.', got %q", token)
	}
	if len(parts[0]) == 0 {
		t.Error("random portion of token is empty")
	}
	if len(parts[1]) == 0 {
		t.Error("signature portion of token is empty")
	}
}
