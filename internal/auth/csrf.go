package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"
	"time"
)

const (
	csrfCookieName = "__csrf_token"
	csrfHeaderName = "X-CSRF-Token"
	csrfTokenBytes = 32
)

// CSRFMiddleware returns middleware that enforces double-submit cookie CSRF
// protection on state-changing requests (POST, PUT, DELETE, PATCH).
//
// Requests authenticated via API token (sct_ prefix) are exempt because API
// tokens are sent in the Authorization header, which browsers never attach
// automatically to cross-origin requests.
//
// The hmacKey is used to sign CSRF cookie values so that attackers cannot
// forge valid cookie+header pairs.
func CSRFMiddleware(hmacKey []byte) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Skip CSRF for safe methods
			if isSafeMethod(r.Method) {
				next.ServeHTTP(w, r)
				return
			}

			// Skip CSRF for API token auth — these tokens are never
			// auto-attached by browsers, so CSRF is not a threat.
			if isAPITokenRequest(r) {
				next.ServeHTTP(w, r)
				return
			}

			// Validate double-submit: cookie value must match header value.
			cookie, err := r.Cookie(csrfCookieName)
			if err != nil || cookie.Value == "" {
				jsonError(w, "missing CSRF token", http.StatusForbidden)
				return
			}

			headerVal := r.Header.Get(csrfHeaderName)
			if headerVal == "" {
				jsonError(w, "missing CSRF header", http.StatusForbidden)
				return
			}

			if !validSignedToken(cookie.Value, hmacKey) {
				jsonError(w, "invalid CSRF token", http.StatusForbidden)
				return
			}

			if cookie.Value != headerVal {
				jsonError(w, "CSRF token mismatch", http.StatusForbidden)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// SetCSRFCookie generates a new signed CSRF token and writes it as a cookie.
// Call this from the csrf-token endpoint so the SPA can read and echo it back.
func SetCSRFCookie(w http.ResponseWriter, hmacKey []byte, secure bool) string {
	token := generateSignedToken(hmacKey)
	http.SetCookie(w, &http.Cookie{
		Name:     csrfCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: false, // JS must read this cookie
		Secure:   secure,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   int((24 * time.Hour).Seconds()),
	})
	return token
}

func isSafeMethod(method string) bool {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodOptions, http.MethodTrace:
		return true
	}
	return false
}

func isAPITokenRequest(r *http.Request) bool {
	return strings.HasPrefix(r.Header.Get("Authorization"), "sct_")
}

// generateSignedToken creates a random token with an HMAC signature appended.
// Format: <random_hex>.<hmac_hex>
func generateSignedToken(key []byte) string {
	b := make([]byte, csrfTokenBytes)
	if _, err := rand.Read(b); err != nil {
		panic("csrf: failed to read random bytes: " + err.Error())
	}
	raw := hex.EncodeToString(b)
	sig := computeHMAC(raw, key)
	return raw + "." + sig
}

// validSignedToken checks that a token has a valid HMAC signature.
func validSignedToken(token string, key []byte) bool {
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 {
		return false
	}
	expected := computeHMAC(parts[0], key)
	return hmac.Equal([]byte(parts[1]), []byte(expected))
}

func computeHMAC(data string, key []byte) string {
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(data))
	return hex.EncodeToString(mac.Sum(nil))
}
