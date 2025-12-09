package handlers

import (
	"github.com/MichielDean/ScaledTest/backend/internal/k8s"
	"github.com/MichielDean/ScaledTest/backend/internal/services"
	"github.com/gofiber/fiber/v2"
	"go.uber.org/zap"
)

// TestJobRESTHandler handles REST API requests for test job management.
// All dependencies are injected for testability.
type TestJobRESTHandler struct {
	executionSvc services.TestExecutor
	imageSvc     services.TestImageManager
	logger       *zap.Logger
}

// NewTestJobRESTHandler creates a new test job REST handler with injected dependencies.
func NewTestJobRESTHandler(
	executionSvc services.TestExecutor,
	imageSvc services.TestImageManager,
	logger *zap.Logger,
) *TestJobRESTHandler {
	return &TestJobRESTHandler{
		executionSvc: executionSvc,
		imageSvc:     imageSvc,
		logger:       logger,
	}
}

// TriggerTestJobsRequest represents the request body for triggering test jobs
type TriggerTestJobsRequest struct {
	ProjectID      string            `json:"project_id"`
	TestImageID    string            `json:"test_image_id"`
	TestIDs        []string          `json:"test_ids"`
	BaseUrl        string            `json:"base_url,omitempty"`        // Override default BASE_URL for this run
	Environment    map[string]string `json:"environment,omitempty"`
	Resources      *ResourceRequest  `json:"resources,omitempty"`
	TimeoutSeconds int32             `json:"timeout_seconds,omitempty"`
	Parallelism    int32             `json:"parallelism,omitempty"`
}

// ResourceRequest represents resource requirements
type ResourceRequest struct {
	CPURequest    string `json:"cpu_request,omitempty"`
	CPULimit      string `json:"cpu_limit,omitempty"`
	MemoryRequest string `json:"memory_request,omitempty"`
	MemoryLimit   string `json:"memory_limit,omitempty"`
}

// TriggerTestJobsResponse represents the response for triggering test jobs
type TriggerTestJobsResponse struct {
	Success    bool     `json:"success"`
	Message    string   `json:"message"`
	K8sJobName string   `json:"k8s_job_name,omitempty"`
	TestRunID  string   `json:"test_run_id,omitempty"`
	JobIDs     []string `json:"job_ids,omitempty"`
	TotalTests int      `json:"total_tests"`
}

// TriggerTestJobs triggers test execution via K8s
// POST /api/v1/test-jobs/trigger
func (h *TestJobRESTHandler) TriggerTestJobs(c *fiber.Ctx) error {
	// Get user ID from context (set by auth middleware)
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "User authentication required",
		})
	}

	var req TriggerTestJobsRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	// Validate required fields
	if req.ProjectID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "project_id is required",
		})
	}

	if req.TestImageID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "test_image_id is required",
		})
	}

	if len(req.TestIDs) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "test_ids is required and must not be empty",
		})
	}

	// Convert resources
	var resources *k8s.ResourceRequirements
	if req.Resources != nil {
		resources = &k8s.ResourceRequirements{
			CPURequest:    req.Resources.CPURequest,
			CPULimit:      req.Resources.CPULimit,
			MemoryRequest: req.Resources.MemoryRequest,
			MemoryLimit:   req.Resources.MemoryLimit,
		}
	}

	// Trigger the test jobs
	k8sJobName, testRunID, jobIDs, err := h.executionSvc.TriggerTestJobs(
		c.Context(),
		req.ProjectID,
		req.TestImageID,
		userID,
		req.TestIDs,
		req.BaseUrl, // Pass base URL override
		req.Environment,
		resources,
		req.TimeoutSeconds,
		req.Parallelism,
	)

	if err != nil {
		h.logger.Error("Failed to trigger test jobs", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(TriggerTestJobsResponse{
			Success:    false,
			Message:    err.Error(),
			TotalTests: len(req.TestIDs),
		})
	}

	h.logger.Info("Test jobs triggered via REST API",
		zap.String("k8s_job_name", k8sJobName),
		zap.String("test_run_id", testRunID),
		zap.Int("test_count", len(req.TestIDs)))

	return c.Status(fiber.StatusCreated).JSON(TriggerTestJobsResponse{
		Success:    true,
		Message:    "Test jobs triggered successfully",
		K8sJobName: k8sJobName,
		TestRunID:  testRunID,
		JobIDs:     jobIDs,
		TotalTests: len(req.TestIDs),
	})
}

// ListTestJobsResponse represents the response for listing test jobs
type ListTestJobsResponse struct {
	Jobs       []TestJobResponse `json:"jobs"`
	TotalCount int32             `json:"total_count"`
	Stats      *JobStatsResponse `json:"stats,omitempty"`
}

// TestJobResponse represents a test job in the response
type TestJobResponse struct {
	ID          string  `json:"id"`
	ProjectID   string  `json:"project_id"`
	TestImageID string  `json:"test_image_id"`
	TestRunID   *string `json:"test_run_id,omitempty"`
	K8sJobName  string  `json:"k8s_job_name"`
	TestID      string  `json:"test_id"`
	JobIndex    int32   `json:"job_index"`
	Status      string  `json:"status"`
	ExitCode    *int32  `json:"exit_code,omitempty"`
	PodName     *string `json:"pod_name,omitempty"`
	StartedAt   *string `json:"started_at,omitempty"`
	CompletedAt *string `json:"completed_at,omitempty"`
	DurationMs  *int64  `json:"duration_ms,omitempty"`
	CreatedAt   string  `json:"created_at"`
}

// JobStatsResponse represents job statistics
type JobStatsResponse struct {
	Pending   int32 `json:"pending"`
	Running   int32 `json:"running"`
	Succeeded int32 `json:"succeeded"`
	Failed    int32 `json:"failed"`
	Cancelled int32 `json:"cancelled"`
}

// ListTestJobs lists test jobs for a project
// GET /api/v1/test-jobs?project_id=xxx
func (h *TestJobRESTHandler) ListTestJobs(c *fiber.Ctx) error {
	projectID := c.Query("project_id")
	if projectID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "project_id query parameter is required",
		})
	}

	page := int32(c.QueryInt("page", 1))
	pageSize := int32(c.QueryInt("page_size", 20))

	var status, testImageID, k8sJobName *string
	if s := c.Query("status"); s != "" {
		status = &s
	}
	if id := c.Query("test_image_id"); id != "" {
		testImageID = &id
	}
	if name := c.Query("k8s_job_name"); name != "" {
		k8sJobName = &name
	}

	jobs, totalCount, stats, err := h.executionSvc.ListTestJobs(
		c.Context(),
		projectID,
		page,
		pageSize,
		status,
		testImageID,
		k8sJobName,
	)

	if err != nil {
		h.logger.Error("Failed to list test jobs", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to list test jobs",
		})
	}

	jobResponses := make([]TestJobResponse, len(jobs))
	for i, job := range jobs {
		jobResponses[i] = TestJobResponse{
			ID:          job.ID,
			ProjectID:   job.ProjectID,
			TestImageID: job.TestImageID,
			TestRunID:   job.TestRunID,
			K8sJobName:  job.K8sJobName,
			TestID:      job.TestID,
			JobIndex:    job.JobIndex,
			Status:      job.Status,
			ExitCode:    job.ExitCode,
			PodName:     job.PodName,
			CreatedAt:   job.CreatedAt.Format("2006-01-02T15:04:05Z"),
		}
		if job.StartedAt != nil {
			s := job.StartedAt.Format("2006-01-02T15:04:05Z")
			jobResponses[i].StartedAt = &s
		}
		if job.CompletedAt != nil {
			s := job.CompletedAt.Format("2006-01-02T15:04:05Z")
			jobResponses[i].CompletedAt = &s
		}
		jobResponses[i].DurationMs = job.DurationMs
	}

	var statsResponse *JobStatsResponse
	if stats != nil {
		statsResponse = &JobStatsResponse{
			Pending:   stats.Pending,
			Running:   stats.Running,
			Succeeded: stats.Succeeded,
			Failed:    stats.Failed,
			Cancelled: stats.Cancelled,
		}
	}

	return c.JSON(ListTestJobsResponse{
		Jobs:       jobResponses,
		TotalCount: totalCount,
		Stats:      statsResponse,
	})
}

// GetTestJob gets a specific test job
// GET /api/v1/test-jobs/:id
func (h *TestJobRESTHandler) GetTestJob(c *fiber.Ctx) error {
	jobID := c.Params("id")
	if jobID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Job ID is required",
		})
	}

	job, err := h.executionSvc.GetTestJob(c.Context(), jobID)
	if err != nil {
		h.logger.Error("Failed to get test job", zap.Error(err), zap.String("id", jobID))
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Test job not found",
		})
	}

	response := TestJobResponse{
		ID:          job.ID,
		ProjectID:   job.ProjectID,
		TestImageID: job.TestImageID,
		TestRunID:   job.TestRunID,
		K8sJobName:  job.K8sJobName,
		TestID:      job.TestID,
		JobIndex:    job.JobIndex,
		Status:      job.Status,
		ExitCode:    job.ExitCode,
		PodName:     job.PodName,
		CreatedAt:   job.CreatedAt.Format("2006-01-02T15:04:05Z"),
	}
	if job.StartedAt != nil {
		s := job.StartedAt.Format("2006-01-02T15:04:05Z")
		response.StartedAt = &s
	}
	if job.CompletedAt != nil {
		s := job.CompletedAt.Format("2006-01-02T15:04:05Z")
		response.CompletedAt = &s
	}
	response.DurationMs = job.DurationMs

	return c.JSON(response)
}

// CancelTestJob cancels a running test job
// POST /api/v1/test-jobs/:id/cancel
func (h *TestJobRESTHandler) CancelTestJob(c *fiber.Ctx) error {
	jobID := c.Params("id")
	if jobID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Job ID is required",
		})
	}

	err := h.executionSvc.CancelTestJob(c.Context(), jobID)
	if err != nil {
		h.logger.Error("Failed to cancel test job", zap.Error(err), zap.String("id", jobID))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to cancel test job",
			"details": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Test job cancelled successfully",
	})
}

// GetJobStatus gets the status of all jobs in a K8s job
// GET /api/v1/test-jobs/status/:k8s_job_name
func (h *TestJobRESTHandler) GetJobStatus(c *fiber.Ctx) error {
	k8sJobName := c.Params("k8s_job_name")
	projectID := c.Query("project_id")

	if k8sJobName == "" || projectID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "k8s_job_name and project_id are required",
		})
	}

	// Get database status for individual test jobs
	_, _, stats, err := h.executionSvc.ListTestJobs(
		c.Context(),
		projectID,
		1,
		1000, // Get all jobs for this K8s job
		nil,
		nil,
		&k8sJobName,
	)

	if err != nil {
		h.logger.Error("Failed to get job status from database", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to get job status",
		})
	}

	// Also check K8s job status directly for failure detection
	// This catches cases where pods fail before updating the database
	k8sStatus, k8sErr := h.executionSvc.GetK8sJobStatus(c.Context(), projectID, k8sJobName)
	
	// Determine overall status
	overallStatus := "pending"
	var k8sFailureReason string
	
	// If K8s reports the job as failed/terminated, prioritize that
	if k8sErr == nil && k8sStatus != nil {
		if k8sStatus.IsTerminated && k8sStatus.FailureReason != "" {
			overallStatus = "failed"
			k8sFailureReason = k8sStatus.FailureReason
		} else if k8sStatus.Failed > 0 && k8sStatus.Active == 0 {
			overallStatus = "failed"
		} else if k8sStatus.Active > 0 {
			overallStatus = "running"
		} else if k8sStatus.Succeeded > 0 && k8sStatus.Failed == 0 && k8sStatus.Active == 0 {
			overallStatus = "completed"
		}
	} else if stats != nil {
		// Fall back to database status if K8s query fails
		if stats.Running > 0 {
			overallStatus = "running"
		} else if stats.Failed > 0 {
			overallStatus = "failed"
		} else if stats.Succeeded > 0 && stats.Pending == 0 && stats.Running == 0 {
			overallStatus = "completed"
		}
	}

	// Calculate total from stats (more accurate than len(jobs) which may be paginated)
	totalJobs := int32(0)
	if stats != nil {
		totalJobs = stats.Pending + stats.Running + stats.Succeeded + stats.Failed + stats.Cancelled
	}

	response := fiber.Map{
		"k8s_job_name":   k8sJobName,
		"overall_status": overallStatus,
		"total_jobs":     totalJobs,
		"stats":          stats,
	}

	// Include K8s status details if available
	if k8sErr == nil && k8sStatus != nil {
		response["k8s_status"] = fiber.Map{
			"active":         k8sStatus.Active,
			"succeeded":      k8sStatus.Succeeded,
			"failed":         k8sStatus.Failed,
			"is_terminated":  k8sStatus.IsTerminated,
			"failure_reason": k8sStatus.FailureReason,
		}
	}
	
	if k8sFailureReason != "" {
		response["failure_reason"] = k8sFailureReason
	}

	return c.JSON(response)
}
