package handlers

import (
	"context"
	"strings"

	"github.com/MichielDean/ScaledTest/backend/internal/services"
	"github.com/gofiber/fiber/v2"
	"go.uber.org/zap"
)

// UserHandler handles HTTP requests for user operations.
// It depends on the UserManager interface for testability.
type UserHandler struct {
	userService services.UserManager
	logger      *zap.Logger
}

// NewUserHandler creates a new user handler with injected dependencies.
func NewUserHandler(userService services.UserManager, logger *zap.Logger) *UserHandler {
	return &UserHandler{
		userService: userService,
		logger:      logger,
	}
}

type UpdateProfileRequest struct {
	Name  string `json:"name"`
	Email string `json:"email"`
}

type UserProfile struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
	Role  string `json:"role"`
}

// GetUserProfile retrieves a user's profile
func (h *UserHandler) GetUserProfile(c *fiber.Ctx) error {
	userID := c.Params("id")
	if userID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "User ID is required",
		})
	}

	// Verify the authenticated user matches the requested profile
	// or has admin role
	authUserID := c.Locals("user_id")
	authUserRole := c.Locals("user_role")

	if authUserID != userID && authUserRole != "admin" {
		h.logger.Info("Unauthorized profile access attempt",
			zap.String("authUserId", authUserID.(string)),
			zap.String("requestedUserId", userID),
		)
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "Access denied",
		})
	}

	user, err := h.userService.GetUserByID(context.Background(), userID)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"error": "User not found",
			})
		}
		h.logger.Error("Failed to fetch user profile",
			zap.Error(err),
			zap.String("userId", userID),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to fetch user profile",
		})
	}

	return c.JSON(UserProfile{
		ID:    user.ID,
		Email: user.Email,
		Name:  user.Name,
		Role:  string(user.Role),
	})
}

// UpdateUserProfile updates a user's profile
func (h *UserHandler) UpdateUserProfile(c *fiber.Ctx) error {
	userID := c.Params("id")
	if userID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "User ID is required",
		})
	}

	// Verify the authenticated user matches the profile being updated
	authUserID := c.Locals("user_id")
	if authUserID != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "Access denied",
		})
	}

	var req UpdateProfileRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	// Get existing profile
	profile, err := h.userService.GetProfileByID(context.Background(), userID)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"error": "User not found",
			})
		}
		h.logger.Error("Failed to get profile",
			zap.Error(err),
			zap.String("userId", userID),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to get profile",
		})
	}

	// Update profile fields
	profile.Name = req.Name
	profile.Email = req.Email

	if err := h.userService.UpdateProfile(context.Background(), profile); err != nil {
		h.logger.Error("Failed to update user profile",
			zap.Error(err),
			zap.String("userId", userID),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to update profile",
		})
	}

	h.logger.Info("User profile updated",
		zap.String("userId", userID),
	)

	return c.JSON(fiber.Map{
		"message": "Profile updated successfully",
	})
}

// ListUsers lists all users (admin only)
func (h *UserHandler) ListUsers(c *fiber.Ctx) error {
	page := c.QueryInt("page", 1)
	pageSize := c.QueryInt("page_size", 100)

	users, totalCount, err := h.userService.ListUsersREST(
		context.Background(),
		int32(page),
		int32(pageSize),
		"", // search
		"", // roleFilter
	)
	if err != nil {
		h.logger.Error("Failed to list users", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to list users",
		})
	}

	userMaps := make([]fiber.Map, 0, len(users))
	for _, u := range users {
		userMaps = append(userMaps, fiber.Map{
			"id":         u.ID,
			"email":      u.Email,
			"name":       u.Name,
			"role":       string(u.Role),
			"created_at": u.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		})
	}

	return c.JSON(fiber.Map{
		"users": userMaps,
		"total": totalCount,
	})
}
