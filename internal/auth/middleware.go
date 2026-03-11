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
				jsonError(w, http.StatusUnauthorized, "missing authorization")
				return
			}

			var claims *Claims
			var err error

			if strings.HasPrefix(token, "sct_") {
				// API token — hash and look up
				if tokenLookup == nil {
					jsonError(w, http.StatusUnauthorized, "api tokens not configured")
					return
				}
				hash := HashAPIToken(token)
				claims, err = tokenLookup(hash)
			} else {
				// JWT access token
				claims, err = jwtMgr.ValidateAccessToken(token)
			}

			if err != nil {
				jsonError(w, http.StatusUnauthorized, "invalid token")
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
				jsonError(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			if !allowed[claims.Role] {
				jsonError(w, http.StatusForbidden, "forbidden")
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
	authHeader := r.Header.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		return strings.TrimPrefix(authHeader, "Bearer ")
	}
	if strings.HasPrefix(authHeader, "sct_") {
		return authHeader
	}

	// Allow token in query param only for WebSocket endpoints to avoid
	// leaking credentials in server logs for regular HTTP requests.
	if strings.HasPrefix(r.URL.Path, "/ws/") {
		if token := r.URL.Query().Get("token"); token != "" {
			return token
		}
	}

	return ""
}

// jsonError writes a JSON error response with the correct Content-Type header.
func jsonError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	w.Write([]byte(`{"error":"` + msg + `"}`))
}
