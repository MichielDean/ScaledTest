package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"go.uber.org/zap"

	"github.com/MichielDean/ScaledTest/backend/internal/services"
)

// TestImageHandler handles test image HTTP requests.
// All dependencies are injected for testability.
type TestImageHandler struct {
	service     services.TestImageManager
	discoverySvc services.TestDiscoverer
	logger      *zap.Logger
}

// NewTestImageHandler creates a new test image handler with injected dependencies.
func NewTestImageHandler(service services.TestImageManager, discoverySvc services.TestDiscoverer, logger *zap.Logger) *TestImageHandler {
	return &TestImageHandler{
		service:      service,
		discoverySvc: discoverySvc,
		logger:       logger,
	}
}

// AddTestImageRequest represents a request to add a test image
type AddTestImageRequest struct {
	RegistryID string  `json:"registry_id" validate:"required,uuid"`
	ImagePath  string  `json:"image_path" validate:"required"`
	ImageTag   string  `json:"image_tag" validate:"required"`
	ProjectID  *string `json:"project_id" validate:"omitempty,uuid"`
}

// AddTestImageResponse represents a response after adding a test image
type AddTestImageResponse struct {
	ID        string  `json:"id"`
	RegistryID string `json:"registry_id"`
	ImagePath string  `json:"image_path"`
	ImageTag  string  `json:"image_tag"`
	ProjectID *string `json:"project_id,omitempty"`
	CreatedBy string  `json:"created_by"`
}

// AddTestImage adds a new test image
func (h *TestImageHandler) AddTestImage(c *fiber.Ctx) error {
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		h.logger.Warn("User ID not found in context")
		return c.Status(http.StatusUnauthorized).JSON(fiber.Map{
			"error": "Unauthorized",
		})
	}

	var req AddTestImageRequest
	if err := c.BodyParser(&req); err != nil {
		h.logger.Error("Failed to parse request body", zap.Error(err))
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	ctx := context.Background()
	image, err := h.service.AddTestImage(ctx, req.RegistryID, req.ImagePath, req.ImageTag, userID, req.ProjectID)
	if err != nil {
		h.logger.Error("Failed to add test image",
			zap.Error(err),
			zap.String("user_id", userID),
			zap.String("registry_id", req.RegistryID),
		)
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to add test image",
		})
	}

	h.logger.Info("Test image added",
		zap.String("image_id", image.ID),
		zap.String("user_id", userID),
	)

	return c.Status(http.StatusCreated).JSON(AddTestImageResponse{
		ID:         image.ID,
		RegistryID: req.RegistryID,
		ImagePath:  req.ImagePath,
		ImageTag:   req.ImageTag,
		ProjectID:  req.ProjectID,
		CreatedBy:  userID,
	})
}

// ListTestImages lists test images with optional filters
func (h *TestImageHandler) ListTestImages(c *fiber.Ctx) error {
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		h.logger.Warn("User ID not found in context")
		return c.Status(http.StatusUnauthorized).JSON(fiber.Map{
			"error": "Unauthorized",
		})
	}

	// Parse query parameters
	registryID := c.Query("registry_id")
	projectID := c.Query("project_id")
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "10"))

	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 10
	}

	var registryIDPtr, projectIDPtr *string
	if registryID != "" {
		registryIDPtr = &registryID
	}
	if projectID != "" {
		projectIDPtr = &projectID
	}

	ctx := context.Background()
	images, totalCount, err := h.service.ListTestImages(ctx, userID, registryIDPtr, projectIDPtr, int32(page), int32(limit))
	if err != nil {
		h.logger.Error("Failed to list test images",
			zap.Error(err),
			zap.String("user_id", userID),
		)
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to list test images",
		})
	}

	totalPages := (int(totalCount) + limit - 1) / limit

	return c.JSON(fiber.Map{
		"data": images,
		"pagination": fiber.Map{
			"page":        page,
			"limit":       limit,
			"total_count": int(totalCount),
			"total_pages": totalPages,
		},
	})
}

// GetTestImage retrieves a single test image by ID
func (h *TestImageHandler) GetTestImage(c *fiber.Ctx) error {
	imageID := c.Params("id")
	if imageID == "" {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{
			"error": "Image ID is required",
		})
	}

	ctx := context.Background()
	image, err := h.service.GetTestImage(ctx, imageID)
	if err != nil {
		if err.Error() == fmt.Sprintf("test image not found: %s", imageID) {
			return c.Status(http.StatusNotFound).JSON(fiber.Map{
				"error": "Test image not found",
			})
		}
		h.logger.Error("Failed to get test image",
			zap.Error(err),
			zap.String("image_id", imageID),
		)
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to retrieve test image",
		})
	}

	return c.JSON(image)
}

// DiscoverTestsRequest represents a request to discover tests
type DiscoverTestsRequest struct {
	Force bool `json:"force"` // Force rediscovery even if already discovered
}

// DiscoverTests triggers test discovery for an image
func (h *TestImageHandler) DiscoverTests(c *fiber.Ctx) error {
	imageID := c.Params("id")
	if imageID == "" {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{
			"error": "Image ID is required",
		})
	}

	var req DiscoverTestsRequest
	if err := c.BodyParser(&req); err != nil {
		// Default to non-forced discovery if body parsing fails
		req.Force = false
	}

	ctx := context.Background()

	// Check if image exists
	image, err := h.service.GetTestImage(ctx, imageID)
	if err != nil {
		if err.Error() == fmt.Sprintf("test image not found: %s", imageID) {
			return c.Status(http.StatusNotFound).JSON(fiber.Map{
				"error": "Test image not found",
			})
		}
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to retrieve test image",
		})
	}

	// Check if already discovered (unless forced)
	if !req.Force && image.DiscoveryStatus == "discovered" && image.TotalTestCount > 0 {
		return c.Status(http.StatusConflict).JSON(fiber.Map{
			"error":   "Tests already discovered. Use 'force: true' to rediscover.",
			"message": fmt.Sprintf("Image has %d tests discovered", image.TotalTestCount),
		})
	}

	// Update status to "discovering"
	if err := h.service.UpdateTestImageDiscoveryStatus(ctx, imageID, "discovering", nil); err != nil {
		h.logger.Error("Failed to update discovery status",
			zap.Error(err),
			zap.String("image_id", imageID),
		)
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to start test discovery",
		})
	}

	// Start discovery in background
	go func() {
		bgCtx := context.Background()
		if err := h.discoverySvc.DiscoverTests(bgCtx, imageID); err != nil {
			h.logger.Error("Test discovery failed",
				zap.Error(err),
				zap.String("image_id", imageID),
			)
		}
	}()

	// TODO: Implement actual test discovery logic in Phase 9
	h.logger.Info("Test discovery started",
		zap.String("image_id", imageID),
		zap.Bool("force", req.Force),
	)

	return c.Status(http.StatusAccepted).JSON(fiber.Map{
		"message":    "Test discovery started",
		"image_id":   imageID,
		"status":     "discovering",
		"image_path": fmt.Sprintf("%s:%s", image.ImagePath, image.ImageTag),
	})
}

// DeleteTestImage deletes a test image
func (h *TestImageHandler) DeleteTestImage(c *fiber.Ctx) error {
	imageID := c.Params("id")
	if imageID == "" {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{
			"error": "Image ID is required",
		})
	}

	ctx := context.Background()
	if err := h.service.DeleteTestImage(ctx, imageID); err != nil {
		if err.Error() == fmt.Sprintf("test image not found: %s", imageID) {
			return c.Status(http.StatusNotFound).JSON(fiber.Map{
				"error": "Test image not found",
			})
		}
		h.logger.Error("Failed to delete test image",
			zap.Error(err),
			zap.String("image_id", imageID),
		)
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to delete test image",
		})
	}

	h.logger.Info("Test image deleted", zap.String("image_id", imageID))

	return c.Status(http.StatusNoContent).Send(nil)
}
