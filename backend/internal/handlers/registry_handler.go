package handlers

import (
	"strconv"

	"github.com/MichielDean/ScaledTest/backend/internal/middleware"
	"github.com/MichielDean/ScaledTest/backend/internal/services"
	"github.com/gofiber/fiber/v2"
	"go.uber.org/zap"
)

// RegistryHandler handles container registry HTTP endpoints
type RegistryHandler struct {
	service services.RegistryManager
	logger  *zap.Logger
}

// NewRegistryHandler creates a new registry handler
func NewRegistryHandler(service services.RegistryManager, logger *zap.Logger) *RegistryHandler {
	return &RegistryHandler{
		service: service,
		logger:  logger,
	}
}

// AddRegistryRequest represents the request to add a container registry
type AddRegistryRequest struct {
	ProjectID    *string `json:"project_id,omitempty"`
	Name         string  `json:"name"`
	RegistryURL  string  `json:"registry_url"`
	RegistryType string  `json:"registry_type"` // docker-registry, dockerhub, ghcr, generic
	Username     *string `json:"username,omitempty"`
	Credentials  *string `json:"credentials,omitempty"`
	AuthType     string  `json:"auth_type"` // basic, token, none
}

// UpdateRegistryRequest represents the request to update a registry
type UpdateRegistryRequest struct {
	Name        *string `json:"name,omitempty"`
	Username    *string `json:"username,omitempty"`
	Credentials *string `json:"credentials,omitempty"`
}

// AddRegistry handles POST /api/v1/container-registries
func (h *RegistryHandler) AddRegistry(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Unauthorized",
		})
	}

	var req AddRegistryRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	// Validate required fields
	if req.Name == "" || req.RegistryURL == "" || req.RegistryType == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Missing required fields: name, registry_url, registry_type",
		})
	}

	// Default auth type to "none" if not specified
	if req.AuthType == "" {
		req.AuthType = "none"
	}

	// Validate auth type
	validAuthTypes := map[string]bool{"basic": true, "token": true, "none": true}
	if !validAuthTypes[req.AuthType] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid auth_type. Must be: basic, token, or none",
		})
	}

	// Add registry
	registry, err := h.service.AddContainerRegistry(
		c.Context(),
		req.ProjectID,
		req.Name,
		req.RegistryURL,
		req.RegistryType,
		req.Username,
		req.Credentials,
		req.AuthType,
		userID,
	)

	if err != nil {
		h.logger.Error("Failed to add registry", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to add registry",
		})
	}

	return c.Status(fiber.StatusCreated).JSON(registry)
}

// GetRegistry handles GET /api/v1/container-registries/:id
func (h *RegistryHandler) GetRegistry(c *fiber.Ctx) error {
	registryID := c.Params("id")

	registry, err := h.service.GetContainerRegistry(c.Context(), registryID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Registry not found",
		})
	}

	return c.JSON(registry)
}

// ListRegistries handles GET /api/v1/container-registries
func (h *RegistryHandler) ListRegistries(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Unauthorized",
		})
	}

	// Optional project_id filter
	var projectID *string
	if pid := c.Query("project_id"); pid != "" {
		projectID = &pid
	}

	// Pagination
	page, _ := strconv.Atoi(c.Query("page", "1"))
	pageSize, _ := strconv.Atoi(c.Query("page_size", "20"))

	registries, totalCount, err := h.service.ListContainerRegistries(
		c.Context(),
		userID,
		projectID,
		int32(page),
		int32(pageSize),
	)

	if err != nil {
		h.logger.Error("Failed to list registries", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to list registries",
		})
	}

	return c.JSON(fiber.Map{
		"registries":  registries,
		"total_count": totalCount,
		"page":        page,
		"page_size":   pageSize,
	})
}

// UpdateRegistry handles PUT /api/v1/container-registries/:id
func (h *RegistryHandler) UpdateRegistry(c *fiber.Ctx) error {
	registryID := c.Params("id")

	var req UpdateRegistryRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	registry, err := h.service.UpdateContainerRegistry(
		c.Context(),
		registryID,
		req.Name,
		req.Username,
		req.Credentials,
	)

	if err != nil {
		h.logger.Error("Failed to update registry", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to update registry",
		})
	}

	return c.JSON(registry)
}

// DeleteRegistry handles DELETE /api/v1/container-registries/:id
func (h *RegistryHandler) DeleteRegistry(c *fiber.Ctx) error {
	registryID := c.Params("id")

	err := h.service.DeleteContainerRegistry(c.Context(), registryID)
	if err != nil {
		h.logger.Error("Failed to delete registry", zap.Error(err))
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Registry not found",
		})
	}

	return c.Status(fiber.StatusNoContent).Send(nil)
}

// TestRegistry handles POST /api/v1/container-registries/:id/test
func (h *RegistryHandler) TestRegistry(c *fiber.Ctx) error {
	registryID := c.Params("id")

	success, message, err := h.service.TestRegistryConnection(c.Context(), registryID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"success": success,
		"message": message,
	})
}

// SyncImages handles POST /api/v1/container-registries/:id/sync
func (h *RegistryHandler) SyncImages(c *fiber.Ctx) error {
	registryID := c.Params("id")

	images, err := h.service.SyncRegistryImages(c.Context(), registryID)
	if err != nil {
		h.logger.Error("Failed to sync images", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to sync images from registry",
		})
	}

	// Return images as structured JSON
	type ImageResponse struct {
		Name     string   `json:"name"`
		Tags     []string `json:"tags"`
		TagCount int      `json:"tag_count"`
	}

	var response []ImageResponse
	for _, img := range images {
		response = append(response, ImageResponse{
			Name:     img.Name,
			Tags:     img.Tags,
			TagCount: len(img.Tags),
		})
	}

	return c.JSON(fiber.Map{
		"images":      response,
		"image_count": len(response),
	})
}
