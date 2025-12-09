package handlers

import (
	"github.com/MichielDean/ScaledTest/backend/internal/middleware"
	"github.com/MichielDean/ScaledTest/backend/internal/models"
	"github.com/MichielDean/ScaledTest/backend/internal/services"
	"github.com/gofiber/fiber/v2"
	"go.uber.org/zap"
)

// SystemSettingsHandler handles system settings REST endpoints
type SystemSettingsHandler struct {
	settingsService services.SettingsManager
	logger          *zap.Logger
}

// NewSystemSettingsHandler creates a new system settings handler
func NewSystemSettingsHandler(settingsService services.SettingsManager, logger *zap.Logger) *SystemSettingsHandler {
	return &SystemSettingsHandler{
		settingsService: settingsService,
		logger:          logger,
	}
}

// GetSettings handles GET /api/v1/system/settings
// Returns all system settings (admin only)
func (h *SystemSettingsHandler) GetSettings(c *fiber.Ctx) error {
	// Check if user is admin
	role, ok := c.Locals(string(middleware.UserRoleKey)).(string)
	if !ok || role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"success": false,
			"error":   "Admin access required",
		})
	}

	settings, err := h.settingsService.GetSettings(c.Context())
	if err != nil {
		h.logger.Error("Failed to get settings", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"error":   "Failed to retrieve settings",
		})
	}

	return c.JSON(fiber.Map{
		"success":  true,
		"settings": settings,
	})
}

// UpdateSettings handles PATCH /api/v1/system/settings
// Updates system settings (admin only)
func (h *SystemSettingsHandler) UpdateSettings(c *fiber.Ctx) error {
	// Check if user is admin
	role, ok := c.Locals(string(middleware.UserRoleKey)).(string)
	if !ok || role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"success": false,
			"error":   "Admin access required",
		})
	}

	var req models.UpdateSettingsRequest
	if err := c.BodyParser(&req); err != nil {
		h.logger.Warn("Invalid settings update request", zap.Error(err))
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"error":   "Invalid request body",
		})
	}

	settings, err := h.settingsService.UpdateSettings(c.Context(), &req)
	if err != nil {
		h.logger.Error("Failed to update settings", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"error":   "Failed to update settings",
		})
	}

	h.logger.Info("System settings updated")

	return c.JSON(fiber.Map{
		"success":  true,
		"message":  "Settings updated successfully",
		"settings": settings,
	})
}

// GetPublicConfig handles GET /api/v1/config
// Returns non-sensitive configuration (public, no auth required)
func (h *SystemSettingsHandler) GetPublicConfig(c *fiber.Ctx) error {
	config, err := h.settingsService.GetPublicConfig(c.Context())
	if err != nil {
		h.logger.Error("Failed to get public config", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"error":   "Failed to retrieve configuration",
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"config":  config,
	})
}

// GetSettingsVersion handles GET /api/v1/system/settings/version
// Returns just the version number for cache invalidation checks
func (h *SystemSettingsHandler) GetSettingsVersion(c *fiber.Ctx) error {
	version, err := h.settingsService.GetVersion(c.Context())
	if err != nil {
		h.logger.Error("Failed to get settings version", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"error":   "Failed to retrieve version",
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"version": version,
	})
}
