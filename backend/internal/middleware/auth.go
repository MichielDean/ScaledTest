package middleware

import (
	"context"
	"strings"

	"github.com/MichielDean/ScaledTest/backend/internal/models"
	"github.com/gofiber/fiber/v2"
	"go.uber.org/zap"
)

// Re-export context keys from models package for backward compatibility
const (
	UserIDKey     = models.UserIDKey
	UserRoleKey   = models.UserRoleKey
	TokenTypeKey  = models.TokenTypeKey
	ProjectIDKey  = models.ProjectIDKey
	K8sJobNameKey = models.K8sJobNameKey
)

// AuthMiddleware validates JWT tokens for HTTP requests.
// Uses shared ValidateToken function from grpc_auth.go.
func AuthMiddleware(jwtSecret string, logger *zap.Logger) fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Get Authorization header
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			logger.Debug("Missing authorization header")
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Missing authorization token",
			})
		}

		// Extract token from "Bearer <token>"
		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenString == authHeader {
			logger.Debug("Invalid authorization header format")
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Invalid authorization format",
			})
		}

		// Use shared token validation
		claims, err := ValidateToken(tokenString, jwtSecret)
		if err != nil {
			logger.Debug("Invalid token", zap.Error(err))
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Invalid or expired token",
			})
		}

		// Store claims in Fiber context
		c.Locals(string(TokenTypeKey), claims.TokenType)
		c.Locals(string(UserIDKey), claims.UserID)
		c.Locals(string(UserRoleKey), claims.Role)

		if claims.ProjectID != "" {
			c.Locals(string(ProjectIDKey), claims.ProjectID)
		}
		if claims.K8sJobName != "" {
			c.Locals(string(K8sJobNameKey), claims.K8sJobName)
		}

		if claims.TokenType == "job_token" {
			logger.Debug("Job token authenticated",
				zap.String("project_id", claims.ProjectID),
				zap.String("k8s_job_name", claims.K8sJobName),
			)
		} else {
			logger.Debug("User authenticated",
				zap.String("user_id", claims.UserID),
				zap.String("role", claims.Role),
			)
		}

		return c.Next()
	}
}

// GetUserID extracts the user ID from the Fiber context
func GetUserID(c *fiber.Ctx) string {
	if userID, ok := c.Locals(string(UserIDKey)).(string); ok {
		return userID
	}
	return ""
}

// GetUserRole extracts the user role from the Fiber context
func GetUserRole(c *fiber.Ctx) string {
	if role, ok := c.Locals(string(UserRoleKey)).(string); ok {
		return role
	}
	return "user"
}

// RequireRole middleware ensures the user has the required role
func RequireRole(requiredRole string, logger *zap.Logger) fiber.Handler {
	return func(c *fiber.Ctx) error {
		role := GetUserRole(c)
		
		if role != requiredRole && role != "admin" {
			logger.Warn("Insufficient permissions",
				zap.String("user_role", role),
				zap.String("required_role", requiredRole),
			)
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "Insufficient permissions",
			})
		}

		return c.Next()
	}
}

// GetUserIDFromContext extracts user ID from standard context (for gRPC)
func GetUserIDFromContext(ctx context.Context) string {
	if userID, ok := ctx.Value(UserIDKey).(string); ok {
		return userID
	}
	return ""
}
