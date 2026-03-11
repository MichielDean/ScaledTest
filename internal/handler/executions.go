package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/scaledtest/scaledtest/internal/auth"
)

// ExecutionsHandler handles test execution endpoints.
type ExecutionsHandler struct{}

// CreateExecutionRequest is the request body for creating a test execution.
type CreateExecutionRequest struct {
	Command string            `json:"command" validate:"required"`
	Image   string            `json:"image,omitempty"`
	EnvVars map[string]string `json:"env_vars,omitempty"`
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

	// TODO: Cancel K8s Job, update execution status
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
