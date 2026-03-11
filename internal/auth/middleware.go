package auth

import (
	"context"
	"encoding/json"
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
				jsonError(w, "missing authorization", http.StatusUnauthorized)
				return
			}

			var claims *Claims
			var err error

			if strings.HasPrefix(token, "sct_") {
				// API token — hash and look up
				if tokenLookup == nil {
					jsonError(w, "api tokens not configured", http.StatusUnauthorized)
					return
				}
				hash := HashAPIToken(token)
				claims, err = tokenLookup(hash)
			} else {
				// JWT access token
				claims, err = jwtMgr.ValidateAccessToken(token)
			}

			if err != nil {
				jsonError(w, "invalid token", http.StatusUnauthorized)
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
				jsonError(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			if !allowed[claims.Role] {
				jsonError(w, "forbidden", http.StatusForbidden)
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

// jsonError writes a JSON error response with the given status code.
func jsonError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// SetClaims stores claims in context. Useful for testing.
func SetClaims(ctx context.Context, claims *Claims) context.Context {
	return context.WithValue(ctx, ClaimsContextKey, claims)
}

func extractToken(r *http.Request) string {
	// Check Authorization header: "Bearer <token>" or raw "sct_<token>"
	authHeader := r.Header.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		return strings.TrimPrefix(authHeader, "Bearer ")
	}
	if strings.HasPrefix(authHeader, "sct_") {
		return authHeader
	}

	// Check query param only for WebSocket upgrade requests, since
	// WebSocket clients cannot set custom headers. Restricting this
	// prevents token leakage via server logs and browser history.
	if strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		if token := r.URL.Query().Get("token"); token != "" {
			return token
		}
	}

	return ""
}
