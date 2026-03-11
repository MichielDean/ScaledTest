package auth

import (
	"context"
	"net/http"
	"strings"
)

type contextKey string

const (
	// ClaimsContextKey is the context key for authenticated user claims.
	ClaimsContextKey contextKey = "claims"
)

// Middleware returns an HTTP middleware that validates JWT access tokens
// from the Authorization header or API tokens with sct_ prefix.
// The tokenLookup function resolves API tokens to claims via database lookup.
func Middleware(jwtMgr *JWTManager, tokenLookup func(tokenHash string) (*Claims, error)) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := extractToken(r)
			if token == "" {
				http.Error(w, `{"error":"missing authorization"}`, http.StatusUnauthorized)
				return
			}

			var claims *Claims
			var err error

			if strings.HasPrefix(token, "sct_") {
				// API token — hash and look up
				if tokenLookup == nil {
					http.Error(w, `{"error":"api tokens not configured"}`, http.StatusUnauthorized)
					return
				}
				hash := HashAPIToken(token)
				claims, err = tokenLookup(hash)
			} else {
				// JWT access token
				claims, err = jwtMgr.ValidateAccessToken(token)
			}

			if err != nil {
				http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
				return
			}

			ctx := context.WithValue(r.Context(), ClaimsContextKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireRole returns middleware that checks the authenticated user has one of the allowed roles.
func RequireRole(roles ...string) func(http.Handler) http.Handler {
	allowed := make(map[string]bool, len(roles))
	for _, r := range roles {
		allowed[r] = true
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims := GetClaims(r.Context())
			if claims == nil {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			if !allowed[claims.Role] {
				http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// GetClaims extracts the authenticated user claims from context.
func GetClaims(ctx context.Context) *Claims {
	claims, _ := ctx.Value(ClaimsContextKey).(*Claims)
	return claims
}

func extractToken(r *http.Request) string {
	// Check Authorization header: "Bearer <token>" or raw "sct_<token>"
	auth := r.Header.Get("Authorization")
	if strings.HasPrefix(auth, "Bearer ") {
		return strings.TrimPrefix(auth, "Bearer ")
	}
	if strings.HasPrefix(auth, "sct_") {
		return auth
	}

	// Check query param (for WebSocket connections)
	if token := r.URL.Query().Get("token"); token != "" {
		return token
	}

	return ""
}
