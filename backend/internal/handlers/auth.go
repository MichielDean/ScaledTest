package handlers

import (
	"strings"

	"github.com/MichielDean/ScaledTest/backend/internal/models"
	"github.com/MichielDean/ScaledTest/backend/internal/services"
	"github.com/gofiber/fiber/v2"
	"go.uber.org/zap"
)

// AuthHandler handles HTTP requests for authentication operations.
type AuthHandler struct {
	authService services.AuthManager
	logger      *zap.Logger
}

// NewAuthHandler creates a new auth handler with injected dependencies.
func NewAuthHandler(authService services.AuthManager, logger *zap.Logger) *AuthHandler {
	return &AuthHandler{
		authService: authService,
		logger:      logger,
	}
}

// SignupRequest represents a user signup request.
type SignupRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

// LoginRequest represents a user login request.
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// AuthResponse represents the authentication response.
type AuthResponse struct {
	AccessToken string    `json:"access_token"`
	TokenType   string    `json:"token_type"`
	ExpiresIn   int64     `json:"expires_in"`
	User        *UserData `json:"user"`
}

// UserData represents user information in responses.
type UserData struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
	Role  string `json:"role"`
}

// Signup handles user registration.
func (h *AuthHandler) Signup(c *fiber.Ctx) error {
	var req SignupRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	result, err := h.authService.Signup(c.Context(), req.Email, req.Password, req.Name)
	if err != nil {
		return h.handleAuthError(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(h.toAuthResponse(result))
}

// Login handles user authentication.
func (h *AuthHandler) Login(c *fiber.Ctx) error {
	var req LoginRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	result, err := h.authService.Login(c.Context(), req.Email, req.Password)
	if err != nil {
		return h.handleAuthError(c, err)
	}

	return c.JSON(h.toAuthResponse(result))
}

// GetUser returns the current authenticated user.
func (h *AuthHandler) GetUser(c *fiber.Ctx) error {
	userID := c.Locals("user_id")
	if userID == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Unauthorized",
		})
	}

	user, err := h.authService.GetUser(c.Context(), userID.(string))
	if err != nil {
		return h.handleAuthError(c, err)
	}

	return c.JSON(UserData{
		ID:    user.ID,
		Email: user.Email,
		Name:  user.Name,
		Role:  string(user.Role),
	})
}

// Logout invalidates the current session.
func (h *AuthHandler) Logout(c *fiber.Ctx) error {
	// For JWT-based auth, logout is typically handled client-side
	return c.JSON(fiber.Map{
		"message": "Logged out successfully",
	})
}

// handleAuthError maps service errors to HTTP responses.
func (h *AuthHandler) handleAuthError(c *fiber.Ctx, err error) error {
	errMsg := err.Error()

	switch {
	case strings.Contains(errMsg, "email and password are required"):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": errMsg,
		})
	case strings.Contains(errMsg, "email already exists"):
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error": errMsg,
		})
	case strings.Contains(errMsg, "invalid email or password"):
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": errMsg,
		})
	case strings.Contains(errMsg, "not found"):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "User not found",
		})
	default:
		h.logger.Error("Auth error", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Internal server error",
		})
	}
}

// toAuthResponse converts a models.AuthResult to an AuthResponse.
func (h *AuthHandler) toAuthResponse(result *models.AuthResult) AuthResponse {
	return AuthResponse{
		AccessToken: result.AccessToken,
		TokenType:   result.TokenType,
		ExpiresIn:   result.ExpiresIn,
		User: &UserData{
			ID:    result.User.ID,
			Email: result.User.Email,
			Name:  result.User.Name,
			Role:  string(result.User.Role),
		},
	}
}
