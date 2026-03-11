package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/scaledtest/scaledtest/internal/auth"
	"github.com/scaledtest/scaledtest/internal/model"
	"github.com/scaledtest/scaledtest/internal/parallel"
)

// ExecutionsHandler handles test execution endpoints.
type ExecutionsHandler struct{}

// CreateExecutionRequest is the request body for creating a test execution.
type CreateExecutionRequest struct {
	Command  string                `json:"command" validate:"required"`
	Image    string                `json:"image,omitempty"`
	EnvVars  map[string]string     `json:"env_vars,omitempty"`
	Parallel *model.ParallelConfig `json:"parallel,omitempty"`
}

// List handles GET /api/v1/executions.
func (h *ExecutionsHandler) List(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"executions": []interface{}{},
		"total":      0,
	})
}

// Create handles POST /api/v1/executions.
func (h *ExecutionsHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req CreateExecutionRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}

	// Validate parallel config if provided
	if req.Parallel != nil {
		if req.Parallel.Workers < 1 || req.Parallel.Workers > 64 {
			Error(w, http.StatusBadRequest, "parallel.workers must be between 1 and 64")
			return
		}
		validStrategies := map[string]bool{
			"round-robin": true, "by-file": true, "by-duration": true,
		}
		if !validStrategies[req.Parallel.SplitStrategy] {
			Error(w, http.StatusBadRequest, "parallel.split_strategy must be one of: round-robin, by-file, by-duration")
			return
		}
		if len(req.Parallel.TestFiles) == 0 && req.Parallel.FilePattern == "" {
			Error(w, http.StatusBadRequest, "parallel execution requires test_files or file_pattern")
			return
		}

		// Split test files across workers
		files := req.Parallel.TestFiles
		buckets, err := parallel.Split(
			req.Parallel.SplitStrategy,
			files,
			req.Parallel.Workers,
			req.Parallel.DurationData,
		)
		if err != nil {
			Error(w, http.StatusBadRequest, "split error: "+err.Error())
			return
		}

		// Return the planned split for now (DB + K8s dispatch is TODO)
		workers := make([]map[string]interface{}, len(buckets))
		for i, bucket := range buckets {
			workers[i] = map[string]interface{}{
				"worker_index": i,
				"test_files":   bucket,
				"status":       "pending",
			}
		}

		JSON(w, http.StatusAccepted, map[string]interface{}{
			"message":        "parallel execution planned",
			"parallelism":    req.Parallel.Workers,
			"split_strategy": req.Parallel.SplitStrategy,
			"workers":        workers,
		})
		return
	}

	// Single worker execution (original behavior)
	// TODO: Create execution in DB, dispatch K8s Job
	Error(w, http.StatusNotImplemented, "execution creation requires K8s integration")
}

// Get handles GET /api/v1/executions/{executionID}.
func (h *ExecutionsHandler) Get(w http.ResponseWriter, r *http.Request) {
	executionID := chi.URLParam(r, "executionID")
	if executionID == "" {
		Error(w, http.StatusBadRequest, "missing execution ID")
		return
	}

	Error(w, http.StatusNotImplemented, "get execution requires database connection")
}

// Cancel handles DELETE /api/v1/executions/{executionID}.
func (h *ExecutionsHandler) Cancel(w http.ResponseWriter, r *http.Request) {
	executionID := chi.URLParam(r, "executionID")
	if executionID == "" {
		Error(w, http.StatusBadRequest, "missing execution ID")
		return
	}

	// TODO: Cancel K8s Job(s), update execution status
	Error(w, http.StatusNotImplemented, "cancel execution requires K8s integration")
}

// UpdateStatusRequest is the request body for updating execution status.
type UpdateStatusRequest struct {
	Status   string `json:"status" validate:"required,oneof=running completed failed cancelled"`
	ErrorMsg string `json:"error_msg,omitempty"`
}

// UpdateStatus handles PUT /api/v1/executions/{executionID}/status.
// Called by workers to report execution progress.
func (h *ExecutionsHandler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	executionID := chi.URLParam(r, "executionID")
	if executionID == "" {
		Error(w, http.StatusBadRequest, "missing execution ID")
		return
	}

	var req UpdateStatusRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}

	// TODO: Update execution status in DB
	JSON(w, http.StatusOK, map[string]interface{}{
		"execution_id": executionID,
		"status":       req.Status,
	})
}

// Workers handles GET /api/v1/executions/{executionID}/workers.
// Returns the status of all workers in a parallel execution.
func (h *ExecutionsHandler) Workers(w http.ResponseWriter, r *http.Request) {
	executionID := chi.URLParam(r, "executionID")
	if executionID == "" {
		Error(w, http.StatusBadRequest, "missing execution ID")
		return
	}

	// TODO: Fetch worker executions from DB
	Error(w, http.StatusNotImplemented, "worker status requires database connection")
}

// UpdateWorkerStatus handles PUT /api/v1/executions/{executionID}/workers/{workerIndex}/status.
// Called by individual workers in a parallel execution to report their progress.
func (h *ExecutionsHandler) UpdateWorkerStatus(w http.ResponseWriter, r *http.Request) {
	executionID := chi.URLParam(r, "executionID")
	if executionID == "" {
		Error(w, http.StatusBadRequest, "missing execution ID")
		return
	}

	workerIndex := chi.URLParam(r, "workerIndex")
	if workerIndex == "" {
		Error(w, http.StatusBadRequest, "missing worker index")
		return
	}

	var req UpdateStatusRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}

	// TODO: Update worker status in DB, check if all workers done for aggregation
	JSON(w, http.StatusOK, map[string]interface{}{
		"execution_id": executionID,
		"worker_index": workerIndex,
		"status":       req.Status,
	})
}
