package middleware

import (
	"context"
	"errors"
	"strings"

	"connectrpc.com/connect"
	"go.uber.org/zap"
)

// Public endpoints that don't require authentication
var publicEndpoints = map[string]bool{
	"/api.v1.AuthService/Login":                     true,
	"/api.v1.AuthService/Signup":                    true,
	"/api.v1.HealthService/Check":                   true,
	"/api.v1.HealthService/Ready":                   true,
	"/api.v1.HealthService/Live":                    true,
	"/api.v1.HealthService/Watch":                   true,
	"/api.v1.SystemSettingsService/GetPublicConfig": true,
}

// ConnectAuthInterceptor creates a Connect interceptor for JWT authentication.
func ConnectAuthInterceptor(jwtSecret string, logger *zap.Logger) connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			procedure := req.Spec().Procedure

			// Skip auth for public endpoints
			if publicEndpoints[procedure] {
				logger.Debug("Skipping auth for public endpoint",
					zap.String("procedure", procedure),
				)
				return next(ctx, req)
			}

			// Extract token from Authorization header
			authHeader := req.Header().Get("Authorization")
			if authHeader == "" {
				logger.Debug("Missing authorization header",
					zap.String("procedure", procedure),
				)
				return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("missing authorization token"))
			}

			tokenString := strings.TrimPrefix(authHeader, "Bearer ")
			if tokenString == authHeader {
				// No "Bearer " prefix found
				logger.Debug("Invalid authorization header format",
					zap.String("procedure", procedure),
				)
				return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("invalid authorization header format"))
			}

			claims, err := ValidateToken(tokenString, jwtSecret)
			if err != nil {
				logger.Debug("Invalid token",
					zap.String("procedure", procedure),
					zap.Error(err),
				)
				return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("invalid or expired token"))
			}

			logger.Debug("Request authenticated",
				zap.String("procedure", procedure),
				zap.String("user_id", claims.UserID),
				zap.String("role", claims.Role),
			)

			// Add claims to context
			ctx = ContextWithAuthClaims(ctx, claims)
			return next(ctx, req)
		}
	}
}
