package handlers

import (
	"encoding/json"
	"strconv"
	"strings"

	"github.com/MichielDean/ScaledTest/backend/internal/models"
	"github.com/MichielDean/ScaledTest/backend/internal/services"
	"github.com/gofiber/fiber/v2"
	"go.uber.org/zap"
)

// TestResultHandler handles HTTP requests for CTRF test result operations.
type TestResultHandler struct {
	service services.TestResultManager
	logger  *zap.Logger
}

// NewTestResultHandler creates a new TestResultHandler with injected dependencies.
func NewTestResultHandler(service services.TestResultManager, logger *zap.Logger) *TestResultHandler {
	return &TestResultHandler{
		service: service,
		logger:  logger,
	}
}

// UploadTestResults uploads CTRF test results
func (h *TestResultHandler) UploadTestResults(c *fiber.Ctx) error {
	var ctrfReport models.CtrfSchemaJson
	if err := c.BodyParser(&ctrfReport); err != nil {
		h.logger.Error("Failed to parse CTRF report", zap.Error(err))
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid CTRF report format",
		})
	}

	if ctrfReport.ReportFormat != models.CtrfSchemaJsonReportFormatCTRF {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid reportFormat, must be 'CTRF'",
		})
	}

	userID := c.Locals("user_id").(string)

	result, err := h.service.UploadCtrfReport(c.Context(), &ctrfReport, userID)
	if err != nil {
		h.logger.Error("Failed to upload CTRF report", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to upload test results",
		})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"id":        result.ID,
		"report_id": result.ReportID,
		"message":   result.Message,
	})
}

// UpsertTestResultsByRunID uploads CTRF results and aggregates by test_run_id
func (h *TestResultHandler) UpsertTestResultsByRunID(c *fiber.Ctx) error {
	var ctrfReport models.CtrfSchemaJson
	if err := c.BodyParser(&ctrfReport); err != nil {
		h.logger.Error("Failed to parse CTRF report", zap.Error(err))
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid CTRF report format",
		})
	}

	if ctrfReport.ReportFormat != models.CtrfSchemaJsonReportFormatCTRF {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid reportFormat, must be 'CTRF'",
		})
	}

	// Extract test_run_id
	testRunID := c.Query("test_run_id")
	if testRunID == "" {
		if ctrfReport.Extra != nil {
			if rid, ok := ctrfReport.Extra["testRunId"].(string); ok {
				testRunID = rid
			}
		}
	}
	if testRunID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "test_run_id required (as query param or in extra field)",
		})
	}

	// Extract job_completion_index
	jobCompletionIndex := 0
	if ctrfReport.Extra != nil {
		switch idx := ctrfReport.Extra["jobCompletionIndex"].(type) {
		case string:
			if parsed, err := strconv.Atoi(idx); err == nil {
				jobCompletionIndex = parsed
			}
		case float64:
			jobCompletionIndex = int(idx)
		case json.Number:
			if parsed, err := idx.Int64(); err == nil {
				jobCompletionIndex = int(parsed)
			}
		}
	}

	userID := c.Locals("user_id").(string)

	result, err := h.service.UpsertCtrfReportByRunID(c.Context(), &ctrfReport, testRunID, jobCompletionIndex, userID)
	if err != nil {
		if strings.Contains(err.Error(), "invalid") {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": err.Error(),
			})
		}
		h.logger.Error("Failed to upsert CTRF report", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to upload test results",
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"id":                   result.ID,
		"test_run_id":          result.TestRunID,
		"job_completion_index": result.JobCompletionIndex,
		"job_status":           result.JobStatus,
		"message":              result.Message,
	})
}

// GetTestResults retrieves a CTRF test report by ID
func (h *TestResultHandler) GetTestResults(c *fiber.Ctx) error {
	reportID := c.Params("id")

	report, err := h.service.GetCtrfReport(c.Context(), reportID)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"error": "Test report not found",
			})
		}
		if strings.Contains(err.Error(), "invalid") {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": err.Error(),
			})
		}
		h.logger.Error("Failed to get CTRF report", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to retrieve test results",
		})
	}

	return c.JSON(report)
}

// ListTestResults lists all CTRF test reports
func (h *TestResultHandler) ListTestResults(c *fiber.Ctx) error {
	page := c.QueryInt("page", 1)
	pageSize := c.QueryInt("page_size", 20)

	result, err := h.service.ListCtrfReports(c.Context(), page, pageSize)
	if err != nil {
		h.logger.Error("Failed to list CTRF reports", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to list test results",
		})
	}

	return c.JSON(fiber.Map{
		"reports":     result.Reports,
		"total_count": result.TotalCount,
		"page":        result.Page,
		"page_size":   result.PageSize,
	})
}

// GetTestStatistics retrieves aggregated CTRF test statistics
func (h *TestResultHandler) GetTestStatistics(c *fiber.Ctx) error {
	stats, err := h.service.GetCtrfStatistics(c.Context())
	if err != nil {
		h.logger.Error("Failed to get CTRF statistics", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to retrieve test statistics",
		})
	}

	return c.JSON(stats)
}
