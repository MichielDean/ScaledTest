package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/rs/zerolog/log"

	"github.com/scaledtest/scaledtest/internal/auth"
	"github.com/scaledtest/scaledtest/internal/k8s"
	"github.com/scaledtest/scaledtest/internal/sanitize"
	"github.com/scaledtest/scaledtest/internal/store"
	"github.com/scaledtest/scaledtest/internal/webhook"
	"github.com/scaledtest/scaledtest/internal/ws"
)

// ExecutionsHandler handles test execution endpoints.
type ExecutionsHandler struct {
	ExecStore   executionsStore
	Hub         *ws.Hub
	AuditStore  *store.AuditStore
	K8s         *k8s.Client
	WorkerImage string
	WorkerToken string
	APIBaseURL  string
	Webhooks    *webhook.Notifier
}

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

	if h.ExecStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	limit, offset := parsePagination(r)

	executions, total, err := h.ExecStore.List(r.Context(), claims.TeamID, limit, offset)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to query executions")
		return
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"executions": executions,
		"total":      total,
	})
}

// Create handles POST /api/v1/executions.
func (h *ExecutionsHandler) Create(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req CreateExecutionRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}

	if h.ExecStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	req.Command = sanitize.String(req.Command)
	req.Image = sanitize.String(req.Image)
	req.EnvVars = sanitize.StringMap(req.EnvVars)

	var configJSON []byte
	if req.Image != "" || len(req.EnvVars) > 0 {
		cfg := map[string]interface{}{}
		if req.Image != "" {
			cfg["image"] = req.Image
		}
		if len(req.EnvVars) > 0 {
			cfg["env_vars"] = req.EnvVars
		}
		var err error
		configJSON, err = json.Marshal(cfg)
		if err != nil {
			Error(w, http.StatusInternalServerError, "failed to marshal config")
			return
		}
	}

	id, err := h.ExecStore.Create(r.Context(), claims.TeamID, req.Command, configJSON)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to create execution")
		return
	}

	if h.K8s != nil {
		image := req.Image
		if image == "" {
			image = h.WorkerImage
		}
		jobName := "st-exec-" + id
		jobCfg := k8s.JobConfig{
			Name:        jobName,
			Image:       image,
			Command:     req.Command,
			EnvVars:     req.EnvVars,
			WorkerToken: h.WorkerToken,
			APIBaseURL:  h.APIBaseURL,
			ExecutionID: id,
		}
		if _, err := h.K8s.CreateJob(r.Context(), jobCfg); err != nil {
			log.Error().Err(err).Str("execution_id", id).Msg("failed to launch k8s job")
			_ = h.ExecStore.MarkFailed(r.Context(), id, "job launch failed: "+err.Error(), time.Now())
			Error(w, http.StatusInternalServerError, "execution created but job launch failed")
			return
		}
		if err := h.ExecStore.SetK8sJobName(r.Context(), id, jobName, time.Now()); err != nil {
			log.Error().Err(err).Str("execution_id", id).Msg("failed to store k8s job name")
		}
	}

	if h.AuditStore != nil {
		h.AuditStore.Log(r.Context(), store.Entry{
			ActorID:      claims.UserID,
			ActorEmail:   claims.Email,
			TeamID:       claims.TeamID,
			Action:       "execution.created",
			ResourceType: "execution",
			ResourceID:   id,
			Metadata:     map[string]interface{}{"command": req.Command},
		})
	}

	JSON(w, http.StatusCreated, map[string]interface{}{
		"id":      id,
		"status":  "pending",
		"command": req.Command,
	})
}

// Get handles GET /api/v1/executions/{executionID}.
func (h *ExecutionsHandler) Get(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	executionID := chi.URLParam(r, "executionID")
	if executionID == "" {
		Error(w, http.StatusBadRequest, "missing execution ID")
		return
	}

	if h.ExecStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	e, err := h.ExecStore.Get(r.Context(), executionID, claims.TeamID)
	if err == pgx.ErrNoRows {
		Error(w, http.StatusNotFound, "execution not found")
		return
	}
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to get execution")
		return
	}

	JSON(w, http.StatusOK, e)
}

// Cancel handles DELETE /api/v1/executions/{executionID}.
func (h *ExecutionsHandler) Cancel(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	executionID := chi.URLParam(r, "executionID")
	if executionID == "" {
		Error(w, http.StatusBadRequest, "missing execution ID")
		return
	}

	if h.ExecStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	now := time.Now()
	rowsAffected, err := h.ExecStore.Cancel(r.Context(), executionID, claims.TeamID, now)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to cancel execution")
		return
	}
	if rowsAffected == 0 {
		Error(w, http.StatusNotFound, "execution not found or not cancellable")
		return
	}

	if h.K8s != nil {
		jobName, _ := h.ExecStore.GetK8sJobName(r.Context(), executionID)
		if jobName != nil && *jobName != "" {
			if err := h.K8s.DeleteJob(r.Context(), *jobName); err != nil {
				log.Error().Err(err).Str("job", *jobName).Msg("failed to delete k8s job on cancel")
			}
		}
	}

	if h.AuditStore != nil {
		h.AuditStore.Log(r.Context(), store.Entry{
			ActorID:      claims.UserID,
			ActorEmail:   claims.Email,
			TeamID:       claims.TeamID,
			Action:       "execution.cancelled",
			ResourceType: "execution",
			ResourceID:   executionID,
		})
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"id":     executionID,
		"status": "cancelled",
	})
}

// UpdateStatusRequest is the request body for updating execution status.
type UpdateStatusRequest struct {
	Status   string `json:"status" validate:"required,oneof=running completed failed cancelled"`
	ErrorMsg string `json:"error_msg,omitempty"`
}

// UpdateStatus handles PUT /api/v1/executions/{executionID}/status.
// Called by workers to report execution progress.
func (h *ExecutionsHandler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

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

	if h.ExecStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	req.ErrorMsg = sanitize.String(req.ErrorMsg)

	now := time.Now()
	var errorMsg *string
	if req.ErrorMsg != "" {
		errorMsg = &req.ErrorMsg
	}
	rowsAffected, err := h.ExecStore.UpdateStatus(r.Context(), executionID, claims.TeamID, req.Status, now, errorMsg)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to update execution status")
		return
	}
	if rowsAffected == 0 {
		Error(w, http.StatusNotFound, "execution not found")
		return
	}

	if h.Hub != nil {
		h.Hub.BroadcastExecutionStatus(executionID, req.Status, map[string]interface{}{
			"error_msg": req.ErrorMsg,
		})
	}

	if h.AuditStore != nil && (req.Status == "completed" || req.Status == "failed") {
		meta := map[string]interface{}{"status": req.Status}
		if req.ErrorMsg != "" {
			meta["error_msg"] = req.ErrorMsg
		}
		action := "execution.completed"
		if req.Status == "failed" {
			action = "execution.failed"
		}
		h.AuditStore.Log(r.Context(), store.Entry{
			ActorID:      claims.UserID,
			ActorEmail:   claims.Email,
			TeamID:       claims.TeamID,
			Action:       action,
			ResourceType: "execution",
			ResourceID:   executionID,
			Metadata:     meta,
		})
	}

	if req.Status == "completed" || req.Status == "failed" {
		eventType := webhook.EventExecutionCompleted
		if req.Status == "failed" {
			eventType = webhook.EventExecutionFailed
		}
		data := map[string]interface{}{
			"execution_id": executionID,
			"status":       req.Status,
		}
		if req.ErrorMsg != "" {
			data["error_msg"] = req.ErrorMsg
		}
		h.Webhooks.Notify(claims.TeamID, eventType, data)
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"id":     executionID,
		"status": req.Status,
	})
}

// ownsExecution checks whether the given execution belongs to the specified team.
func (h *ExecutionsHandler) ownsExecution(ctx context.Context, executionID, teamID string) (bool, error) {
	return h.ExecStore.Exists(ctx, executionID, teamID)
}

func (h *ExecutionsHandler) requireWorkerCallback(w http.ResponseWriter, r *http.Request) (*auth.Claims, string, bool) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return nil, "", false
	}

	executionID := chi.URLParam(r, "executionID")
	if executionID == "" {
		Error(w, http.StatusBadRequest, "missing execution ID")
		return nil, "", false
	}

	if h.ExecStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return nil, "", false
	}

	owned, err := h.ownsExecution(r.Context(), executionID, claims.TeamID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "database error")
		return nil, "", false
	}
	if !owned {
		Error(w, http.StatusNotFound, "execution not found")
		return nil, "", false
	}

	return claims, executionID, true
}

// ProgressRequest is the request body for reporting test progress.
type ProgressRequest struct {
	Passed       int     `json:"passed"`
	Failed       int     `json:"failed"`
	Skipped      int     `json:"skipped"`
	Total        int     `json:"total" validate:"required,min=1"`
	DurationMs   int64   `json:"duration_ms"`
	EstimatedETA float64 `json:"estimated_eta_seconds,omitempty"`
}

// ReportProgress handles POST /api/v1/executions/{executionID}/progress.
// Called by workers to stream live test counters.
func (h *ExecutionsHandler) ReportProgress(w http.ResponseWriter, r *http.Request) {
	_, executionID, ok := h.requireWorkerCallback(w, r)
	if !ok {
		return
	}

	var req ProgressRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}

	if h.Hub != nil {
		h.Hub.BroadcastProgress(executionID, map[string]interface{}{
			"passed":                req.Passed,
			"failed":                req.Failed,
			"skipped":               req.Skipped,
			"total":                 req.Total,
			"completed":             req.Passed + req.Failed + req.Skipped,
			"duration_ms":           req.DurationMs,
			"estimated_eta_seconds": req.EstimatedETA,
		})
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"execution_id": executionID,
		"received":     true,
	})
}

// TestResultEvent is the request body for streaming individual test results.
type TestResultEvent struct {
	Name       string `json:"name" validate:"required"`
	Status     string `json:"status" validate:"required,oneof=passed failed skipped pending other"`
	DurationMs int64  `json:"duration_ms"`
	Message    string `json:"message,omitempty"`
	Suite      string `json:"suite,omitempty"`
	WorkerID   string `json:"worker_id,omitempty"`
}

// ReportTestResult handles POST /api/v1/executions/{executionID}/test-result.
// Called by workers to stream individual test results as they complete.
func (h *ExecutionsHandler) ReportTestResult(w http.ResponseWriter, r *http.Request) {
	_, executionID, ok := h.requireWorkerCallback(w, r)
	if !ok {
		return
	}

	var req TestResultEvent
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}

	if h.Hub != nil {
		h.Hub.BroadcastTestResult(executionID, map[string]interface{}{
			"name":        req.Name,
			"status":      req.Status,
			"duration_ms": req.DurationMs,
			"message":     req.Message,
			"suite":       req.Suite,
			"worker_id":   req.WorkerID,
		})
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"execution_id": executionID,
		"received":     true,
	})
}

// WorkerStatusEvent is the request body for worker health updates.
type WorkerStatusEvent struct {
	WorkerID string `json:"worker_id" validate:"required"`
	Status   string `json:"status" validate:"required,oneof=starting running idle completed failed"`
	Message  string `json:"message,omitempty"`
	Tests    int    `json:"tests_assigned,omitempty"`
	Progress int    `json:"tests_completed,omitempty"`
}

// ReportWorkerStatus handles POST /api/v1/executions/{executionID}/worker-status.
// Called by workers to report their health and progress.
func (h *ExecutionsHandler) ReportWorkerStatus(w http.ResponseWriter, r *http.Request) {
	_, executionID, ok := h.requireWorkerCallback(w, r)
	if !ok {
		return
	}

	var req WorkerStatusEvent
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}

	if h.Hub != nil {
		h.Hub.BroadcastWorkerStatus(executionID, map[string]interface{}{
			"worker_id":       req.WorkerID,
			"status":          req.Status,
			"message":         req.Message,
			"tests_assigned":  req.Tests,
			"tests_completed": req.Progress,
		})
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"execution_id": executionID,
		"received":     true,
	})
}
