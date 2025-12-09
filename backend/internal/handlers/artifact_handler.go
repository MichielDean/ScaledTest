package handlers

import (
	"time"

	"github.com/MichielDean/ScaledTest/backend/internal/models"
	"github.com/MichielDean/ScaledTest/backend/internal/services"
	"github.com/gofiber/fiber/v2"
	"go.uber.org/zap"
)

// ArtifactHandler handles HTTP requests for artifact operations.
type ArtifactHandler struct {
	service *services.ArtifactService
	logger  *zap.Logger
}

// NewArtifactHandler creates a new ArtifactHandler with injected dependencies.
func NewArtifactHandler(service *services.ArtifactService, logger *zap.Logger) *ArtifactHandler {
	return &ArtifactHandler{
		service: service,
		logger:  logger,
	}
}

// UploadArtifact handles artifact file uploads.
// POST /api/v1/artifacts
func (h *ArtifactHandler) UploadArtifact(c *fiber.Ctx) error {
	// Get file from multipart form
	file, err := c.FormFile("file")
	if err != nil {
		h.logger.Warn("No file in request", zap.Error(err))
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "File is required",
		})
	}

	// Get required fields
	testRunID := c.FormValue("test_run_id")
	if testRunID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "test_run_id is required",
		})
	}

	testJobID := c.FormValue("test_job_id")
	if testJobID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "test_job_id is required",
		})
	}

	// Get optional fields
	artifactType := c.FormValue("artifact_type")
	if artifactType == "" {
		artifactType = string(models.ArtifactTypeOther)
	}

	// Validate artifact type
	validType := models.ArtifactType(artifactType)
	switch validType {
	case models.ArtifactTypeScreenshot, models.ArtifactTypeVideo, models.ArtifactTypeLog,
		models.ArtifactTypeTrace, models.ArtifactTypeReport, models.ArtifactTypeOther:
		// Valid
	default:
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid artifact_type. Must be one of: screenshot, video, log, trace, report, other",
		})
	}

	// Open the file
	src, err := file.Open()
	if err != nil {
		h.logger.Error("Failed to open uploaded file", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to process uploaded file",
		})
	}
	defer src.Close()

	// Determine content type
	contentType := file.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	userID := c.Locals("user_id").(string)

	// Upload artifact
	req := &services.UploadArtifactRequest{
		TestRunID:    testRunID,
		TestJobID:    testJobID,
		ArtifactType: validType,
		Filename:     file.Filename,
		ContentType:  contentType,
		Reader:       src,
		Size:         file.Size,
	}

	result, err := h.service.UploadArtifact(c.Context(), req, userID)
	if err != nil {
		h.logger.Error("Failed to upload artifact",
			zap.String("test_run_id", testRunID),
			zap.String("filename", file.Filename),
			zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to upload artifact",
		})
	}

	return c.Status(fiber.StatusCreated).JSON(result)
}

// GetArtifact retrieves artifact metadata by ID.
// GET /api/v1/artifacts/:id
func (h *ArtifactHandler) GetArtifact(c *fiber.Ctx) error {
	artifactID := c.Params("id")
	if artifactID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Artifact ID is required",
		})
	}

	artifact, err := h.service.GetArtifact(c.Context(), artifactID)
	if err != nil {
		h.logger.Error("Failed to get artifact",
			zap.String("artifact_id", artifactID),
			zap.Error(err))
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Artifact not found",
		})
	}

	return c.JSON(artifact)
}

// DownloadArtifact returns a presigned URL or streams the artifact.
// GET /api/v1/artifacts/:id/download
func (h *ArtifactHandler) DownloadArtifact(c *fiber.Ctx) error {
	artifactID := c.Params("id")
	if artifactID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Artifact ID is required",
		})
	}

	// Check if client wants a redirect to presigned URL
	redirect := c.QueryBool("redirect", true)

	if redirect {
		// Generate presigned URL and redirect
		url, err := h.service.GetArtifactDownloadURL(c.Context(), artifactID, 15*time.Minute)
		if err != nil {
			h.logger.Error("Failed to generate download URL",
				zap.String("artifact_id", artifactID),
				zap.Error(err))
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"error": "Artifact not found",
			})
		}

		return c.Redirect(url, fiber.StatusTemporaryRedirect)
	}

	// Stream the file directly
	reader, artifact, err := h.service.DownloadArtifact(c.Context(), artifactID)
	if err != nil {
		h.logger.Error("Failed to download artifact",
			zap.String("artifact_id", artifactID),
			zap.Error(err))
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Artifact not found",
		})
	}
	defer reader.Close()

	contentType := "application/octet-stream"
	if artifact.ContentType != nil {
		contentType = *artifact.ContentType
	}

	c.Set("Content-Type", contentType)
	c.Set("Content-Disposition", "attachment; filename=\""+artifact.FilePath+"\"")

	return c.SendStream(reader)
}

// ListArtifactsByTestRun lists all artifacts for a test run.
// GET /api/v1/test-runs/:id/artifacts
func (h *ArtifactHandler) ListArtifactsByTestRun(c *fiber.Ctx) error {
	testRunID := c.Params("id")
	if testRunID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Test run ID is required",
		})
	}

	artifacts, err := h.service.ListArtifactsByTestRun(c.Context(), testRunID)
	if err != nil {
		h.logger.Error("Failed to list artifacts",
			zap.String("test_run_id", testRunID),
			zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to list artifacts",
		})
	}

	return c.JSON(fiber.Map{
		"artifacts": artifacts,
		"total":     len(artifacts),
	})
}

// ListArtifactsByTestJob lists all artifacts for a test job.
// GET /api/v1/test-jobs/:id/artifacts
func (h *ArtifactHandler) ListArtifactsByTestJob(c *fiber.Ctx) error {
	testJobID := c.Params("id")
	if testJobID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Test job ID is required",
		})
	}

	artifacts, err := h.service.ListArtifactsByTestJob(c.Context(), testJobID)
	if err != nil {
		h.logger.Error("Failed to list artifacts",
			zap.String("test_job_id", testJobID),
			zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to list artifacts",
		})
	}

	return c.JSON(fiber.Map{
		"artifacts": artifacts,
		"total":     len(artifacts),
	})
}

// DeleteArtifact deletes an artifact by ID.
// DELETE /api/v1/artifacts/:id
func (h *ArtifactHandler) DeleteArtifact(c *fiber.Ctx) error {
	artifactID := c.Params("id")
	if artifactID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Artifact ID is required",
		})
	}

	if err := h.service.DeleteArtifact(c.Context(), artifactID); err != nil {
		h.logger.Error("Failed to delete artifact",
			zap.String("artifact_id", artifactID),
			zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to delete artifact",
		})
	}

	return c.Status(fiber.StatusNoContent).Send(nil)
}
