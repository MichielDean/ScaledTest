package middleware

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"go.uber.org/zap"
)

func TestAuthMiddleware(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	jwtSecret := "test-secret"

	t.Run("Success - Valid token", func(t *testing.T) {
		app := fiber.New()
		app.Use(AuthMiddleware(jwtSecret, logger))
		app.Get("/protected", func(c *fiber.Ctx) error {
			userID := c.Locals(string(UserIDKey))
			role := c.Locals(string(UserRoleKey))
			return c.JSON(fiber.Map{
				"user_id": userID,
				"role":    role,
			})
		})

		// Create valid token
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"sub":  "user-123",
			"role": "user",
			"exp":  time.Now().Add(time.Hour).Unix(),
		})
		tokenString, _ := token.SignedString([]byte(jwtSecret))

		req := httptest.NewRequest("GET", "/protected", nil)
		req.Header.Set("Authorization", "Bearer "+tokenString)

		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatal(err)
		}

		if resp.StatusCode != fiber.StatusOK {
			t.Errorf("Expected status 200, got %d", resp.StatusCode)
		}
	})

	t.Run("Success - Valid token with default role", func(t *testing.T) {
		app := fiber.New()
		app.Use(AuthMiddleware(jwtSecret, logger))
		app.Get("/protected", func(c *fiber.Ctx) error {
			role := c.Locals(string(UserRoleKey))
			return c.JSON(fiber.Map{"role": role})
		})

		// Create token without role claim
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"sub": "user-123",
			"exp": time.Now().Add(time.Hour).Unix(),
		})
		tokenString, _ := token.SignedString([]byte(jwtSecret))

		req := httptest.NewRequest("GET", "/protected", nil)
		req.Header.Set("Authorization", "Bearer "+tokenString)

		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatal(err)
		}

		if resp.StatusCode != fiber.StatusOK {
			t.Errorf("Expected status 200, got %d", resp.StatusCode)
		}
	})

	t.Run("Error - Missing authorization header", func(t *testing.T) {
		app := fiber.New()
		app.Use(AuthMiddleware(jwtSecret, logger))
		app.Get("/protected", func(c *fiber.Ctx) error {
			return c.SendString("should not reach here")
		})

		req := httptest.NewRequest("GET", "/protected", nil)

		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatal(err)
		}

		if resp.StatusCode != fiber.StatusUnauthorized {
			t.Errorf("Expected status 401, got %d", resp.StatusCode)
		}
	})

	t.Run("Error - Invalid authorization format", func(t *testing.T) {
		app := fiber.New()
		app.Use(AuthMiddleware(jwtSecret, logger))
		app.Get("/protected", func(c *fiber.Ctx) error {
			return c.SendString("should not reach here")
		})

		req := httptest.NewRequest("GET", "/protected", nil)
		req.Header.Set("Authorization", "InvalidFormat token123")

		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatal(err)
		}

		if resp.StatusCode != fiber.StatusUnauthorized {
			t.Errorf("Expected status 401, got %d", resp.StatusCode)
		}
	})

	t.Run("Error - Invalid token signature", func(t *testing.T) {
		app := fiber.New()
		app.Use(AuthMiddleware(jwtSecret, logger))
		app.Get("/protected", func(c *fiber.Ctx) error {
			return c.SendString("should not reach here")
		})

		// Create token with wrong secret
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"sub":  "user-123",
			"role": "user",
			"exp":  time.Now().Add(time.Hour).Unix(),
		})
		tokenString, _ := token.SignedString([]byte("wrong-secret"))

		req := httptest.NewRequest("GET", "/protected", nil)
		req.Header.Set("Authorization", "Bearer "+tokenString)

		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatal(err)
		}

		if resp.StatusCode != fiber.StatusUnauthorized {
			t.Errorf("Expected status 401, got %d", resp.StatusCode)
		}
	})

	t.Run("Error - Expired token", func(t *testing.T) {
		app := fiber.New()
		app.Use(AuthMiddleware(jwtSecret, logger))
		app.Get("/protected", func(c *fiber.Ctx) error {
			return c.SendString("should not reach here")
		})

		// Create expired token
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"sub":  "user-123",
			"role": "user",
			"exp":  time.Now().Add(-time.Hour).Unix(), // Expired 1 hour ago
		})
		tokenString, _ := token.SignedString([]byte(jwtSecret))

		req := httptest.NewRequest("GET", "/protected", nil)
		req.Header.Set("Authorization", "Bearer "+tokenString)

		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatal(err)
		}

		if resp.StatusCode != fiber.StatusUnauthorized {
			t.Errorf("Expected status 401, got %d", resp.StatusCode)
		}
	})

	t.Run("Error - Missing sub claim", func(t *testing.T) {
		app := fiber.New()
		app.Use(AuthMiddleware(jwtSecret, logger))
		app.Get("/protected", func(c *fiber.Ctx) error {
			return c.SendString("should not reach here")
		})

		// Create token without sub claim
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"role": "user",
			"exp":  time.Now().Add(time.Hour).Unix(),
		})
		tokenString, _ := token.SignedString([]byte(jwtSecret))

		req := httptest.NewRequest("GET", "/protected", nil)
		req.Header.Set("Authorization", "Bearer "+tokenString)

		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatal(err)
		}

		if resp.StatusCode != fiber.StatusUnauthorized {
			t.Errorf("Expected status 401, got %d", resp.StatusCode)
		}
	})

	t.Run("Error - Wrong signing method", func(t *testing.T) {
		app := fiber.New()
		app.Use(AuthMiddleware(jwtSecret, logger))
		app.Get("/protected", func(c *fiber.Ctx) error {
			return c.SendString("should not reach here")
		})

		// This will fail because we use an invalid token format
		req := httptest.NewRequest("GET", "/protected", nil)
		req.Header.Set("Authorization", "Bearer invalid.token.here")

		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatal(err)
		}

		if resp.StatusCode != fiber.StatusUnauthorized {
			t.Errorf("Expected status 401, got %d", resp.StatusCode)
		}
	})
}

func TestGetUserID(t *testing.T) {
	t.Run("Success - Get user ID from context", func(t *testing.T) {
		app := fiber.New()
		app.Get("/test", func(c *fiber.Ctx) error {
			c.Locals(string(UserIDKey), "user-123")
			userID := GetUserID(c)
			if userID != "user-123" {
				t.Errorf("Expected 'user-123', got '%s'", userID)
			}
			return c.SendString("ok")
		})

		req := httptest.NewRequest("GET", "/test", nil)
		app.Test(req, -1)
	})

	t.Run("Error - No user ID in context", func(t *testing.T) {
		app := fiber.New()
		app.Get("/test", func(c *fiber.Ctx) error {
			userID := GetUserID(c)
			if userID != "" {
				t.Errorf("Expected empty string, got '%s'", userID)
			}
			return c.SendString("ok")
		})

		req := httptest.NewRequest("GET", "/test", nil)
		app.Test(req, -1)
	})

	t.Run("Error - Wrong type in context", func(t *testing.T) {
		app := fiber.New()
		app.Get("/test", func(c *fiber.Ctx) error {
			c.Locals(string(UserIDKey), 123) // Wrong type
			userID := GetUserID(c)
			if userID != "" {
				t.Errorf("Expected empty string, got '%s'", userID)
			}
			return c.SendString("ok")
		})

		req := httptest.NewRequest("GET", "/test", nil)
		app.Test(req, -1)
	})
}

func TestGetUserRole(t *testing.T) {
	t.Run("Success - Get user role from context", func(t *testing.T) {
		app := fiber.New()
		app.Get("/test", func(c *fiber.Ctx) error {
			c.Locals(string(UserRoleKey), "admin")
			role := GetUserRole(c)
			if role != "admin" {
				t.Errorf("Expected 'admin', got '%s'", role)
			}
			return c.SendString("ok")
		})

		req := httptest.NewRequest("GET", "/test", nil)
		app.Test(req, -1)
	})

	t.Run("Default - No user role in context returns user", func(t *testing.T) {
		app := fiber.New()
		app.Get("/test", func(c *fiber.Ctx) error {
			role := GetUserRole(c)
			if role != "user" {
				t.Errorf("Expected 'user', got '%s'", role)
			}
			return c.SendString("ok")
		})

		req := httptest.NewRequest("GET", "/test", nil)
		app.Test(req, -1)
	})
}

func TestRequireRole(t *testing.T) {
	logger, _ := zap.NewDevelopment()

	t.Run("Success - User has required role", func(t *testing.T) {
		app := fiber.New()
		app.Use(func(c *fiber.Ctx) error {
			c.Locals(string(UserRoleKey), "admin")
			return c.Next()
		})
		app.Use(RequireRole("admin", logger))
		app.Get("/protected", func(c *fiber.Ctx) error {
			return c.SendString("success")
		})

		req := httptest.NewRequest("GET", "/protected", nil)

		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatal(err)
		}

		if resp.StatusCode != fiber.StatusOK {
			t.Errorf("Expected status 200, got %d", resp.StatusCode)
		}
	})

	t.Run("Success - Admin can access any role", func(t *testing.T) {
		app := fiber.New()
		app.Use(func(c *fiber.Ctx) error {
			c.Locals(string(UserRoleKey), "admin")
			return c.Next()
		})
		app.Use(RequireRole("owner", logger))
		app.Get("/protected", func(c *fiber.Ctx) error {
			return c.SendString("success")
		})

		req := httptest.NewRequest("GET", "/protected", nil)

		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatal(err)
		}

		if resp.StatusCode != fiber.StatusOK {
			t.Errorf("Expected status 200, got %d", resp.StatusCode)
		}
	})

	t.Run("Error - Insufficient permissions", func(t *testing.T) {
		app := fiber.New()
		app.Use(func(c *fiber.Ctx) error {
			c.Locals(string(UserRoleKey), "user")
			return c.Next()
		})
		app.Use(RequireRole("admin", logger))
		app.Get("/protected", func(c *fiber.Ctx) error {
			return c.SendString("should not reach here")
		})

		req := httptest.NewRequest("GET", "/protected", nil)

		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatal(err)
		}

		if resp.StatusCode != fiber.StatusForbidden {
			t.Errorf("Expected status 403, got %d", resp.StatusCode)
		}
	})
}
