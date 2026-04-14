package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/rs/zerolog/log"

	"github.com/scaledtest/scaledtest/internal/auth"
	"github.com/scaledtest/scaledtest/internal/db"
	"github.com/scaledtest/scaledtest/internal/k8s"
	"github.com/scaledtest/scaledtest/internal/model"
	"github.com/scaledtest/scaledtest/internal/sanitize"
	"github.com/scaledtest/scaledtest/internal/store"
	"github.com/scaledtest/scaledtest/internal/webhook"
	"github.com/scaledtest/scaledtest/internal/ws"
)

// ExecutionsHandler handles test execution endpoints.
type ExecutionsHandler struct {
	DB          *db.Pool
	ExecStore   executionsStore
	Hub         *ws.Hub           // WebSocket hub for real-time broadcasting (optional)
	AuditStore  *store.AuditStore // optional; nil means no audit logging
	K8s         *k8s.Client       // optional; nil means K8s job launch is disabled
	WorkerImage string            // default container image for test workers
	WorkerToken string            // auth token workers use to report back
	APIBaseURL  string            // base URL workers use to call the API
	Webhooks    *webhook.Notifier // optional; nil means no webhook dispatch

	// ownsExecFunc overrides ownsExecution for testing. If nil, the DB-based
	// implementation is used. Callers must not set this outside of tests.
	ownsExecFunc func(ctx context.Context, executionID, teamID string) (bool, error)
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

	if h.DB == nil && h.ExecStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	// Pagination
	limit, offset := parsePagination(r)

	rows, err := h.DB.Query(r.Context(),
		`SELECT id, team_id, status, command, config, report_id, k8s_job_name, k8s_pod_name,
		        error_msg, started_at, finished_at, created_at, updated_at
		 FROM test_executions
		 WHERE team_id = $1
		 ORDER BY created_at DESC
		 LIMIT $2 OFFSET $3`,
		claims.TeamID, limit, offset)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to query executions")
		return
	}
	defer rows.Close()

	executions := []model.TestExecution{}
	for rows.Next() {
		var e model.TestExecution
		if err := rows.Scan(
			&e.ID, &e.TeamID, &e.Status, &e.Command, &e.Config, &e.ReportID,
			&e.K8sJobName, &e.K8sPodName, &e.ErrorMsg, &e.StartedAt,
			&e.FinishedAt, &e.CreatedAt, &e.UpdatedAt,
		); err != nil {
			Error(w, http.StatusInternalServerError, "failed to scan execution")
			return
		}
		executions = append(executions, e)
	}
	if err := rows.Err(); err != nil {
		Error(w, http.StatusInternalServerError, "failed to iterate executions")
		return
	}

	// Get total count for pagination
	var total int
	err = h.DB.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM test_executions WHERE team_id = $1`,
		claims.TeamID).Scan(&total)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to count executions")
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

	if h.DB == nil && h.ExecStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	// Sanitize user-provided strings
	req.Command = sanitize.String(req.Command)
	req.Image = sanitize.String(req.Image)
	req.EnvVars = sanitize.StringMap(req.EnvVars)

	// Build config JSON from image and env vars
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

	id := uuid.New().String()
	now := time.Now()

	_, err := h.DB.Exec(r.Context(),
		`INSERT INTO test_executions (id, team_id, status, command, config, created_at, updated_at)
		 VALUES ($1, $2, 'pending', $3, $4, $5, $5)`,
		id, claims.TeamID, req.Command, configJSON, now)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to create execution")
		return
	}

	// Launch K8s job if client is configured
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
			h.DB.Exec(r.Context(),
				`UPDATE test_executions SET status = 'failed', error_msg = $1, updated_at = $2 WHERE id = $3`,
				"job launch failed: "+err.Error(), time.Now(), id)
			Error(w, http.StatusInternalServerError, "execution created but job launch failed")
			return
		}
		// Store K8s job name on the execution record
		h.DB.Exec(r.Context(),
			`UPDATE test_executions SET k8s_job_name = $1, updated_at = $2 WHERE id = $3`,
			jobName, time.Now(), id)
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

	if h.DB == nil && h.ExecStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	e, err := getExecution(r.Context(), h.DB, executionID, claims.TeamID)
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

	if h.DB == nil && h.ExecStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	now := time.Now()
	tag, err := h.DB.Exec(r.Context(),
		`UPDATE test_executions
		 SET status = 'cancelled', finished_at = $1, updated_at = $1
		 WHERE id = $2 AND team_id = $3 AND status IN ('pending', 'running')`,
		now, executionID, claims.TeamID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to cancel execution")
		return
	}
	if tag.RowsAffected() == 0 {
		Error(w, http.StatusNotFound, "execution not found or not cancellable")
		return
	}

	// Clean up the K8s job if one was launched
	if h.K8s != nil {
		var jobName *string
		_ = h.DB.QueryRow(r.Context(),
			`SELECT k8s_job_name FROM test_executions WHERE id = $1`, executionID).Scan(&jobName)
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

	if h.DB == nil && h.ExecStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	// Sanitize user-provided strings
	req.ErrorMsg = sanitize.String(req.ErrorMsg)

	now := time.Now()

	// Build dynamic update
	query := `UPDATE test_executions SET status = $1, updated_at = $2`
	args := []interface{}{req.Status, now}
	argIdx := 3

	if req.Status == "running" {
		query += `, started_at = COALESCE(started_at, $` + strconv.Itoa(argIdx) + `)`
		args = append(args, now)
		argIdx++
	}

	if req.Status == "completed" || req.Status == "failed" || req.Status == "cancelled" {
		query += `, finished_at = $` + strconv.Itoa(argIdx)
		args = append(args, now)
		argIdx++
	}

	if req.ErrorMsg != "" {
		query += `, error_msg = $` + strconv.Itoa(argIdx)
		args = append(args, req.ErrorMsg)
		argIdx++
	}

	query += ` WHERE id = $` + strconv.Itoa(argIdx) + ` AND team_id = $` + strconv.Itoa(argIdx+1)
	args = append(args, executionID, claims.TeamID)

	tag, err := h.DB.Exec(r.Context(), query, args...)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to update execution status")
		return
	}
	if tag.RowsAffected() == 0 {
		Error(w, http.StatusNotFound, "execution not found")
		return
	}

	// Broadcast status change via WebSocket
	if h.Hub != nil {
		h.Hub.BroadcastExecutionStatus(executionID, req.Status, map[string]interface{}{
			"error_msg": req.ErrorMsg,
		})
	}

	// Audit terminal state transitions (completed/failed).
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

	// Fire webhooks for terminal execution states.
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

// getExecution fetches a single execution by ID, scoped to team.
func getExecution(ctx context.Context, pool *db.Pool, id, teamID string) (*model.TestExecution, error) {
	var e model.TestExecution
	err := pool.QueryRow(ctx,
		`SELECT id, team_id, status, command, config, report_id, k8s_job_name, k8s_pod_name,
		        error_msg, started_at, finished_at, created_at, updated_at
		 FROM test_executions
		 WHERE id = $1 AND team_id = $2`,
		id, teamID).Scan(
		&e.ID, &e.TeamID, &e.Status, &e.Command, &e.Config, &e.ReportID,
		&e.K8sJobName, &e.K8sPodName, &e.ErrorMsg, &e.StartedAt,
		&e.FinishedAt, &e.CreatedAt, &e.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &e, nil
}

// ownsExecution checks whether the given execution belongs to the specified team.
// Returns (false, nil) if the execution does not belong to the team,
// (false, err) on database errors (distinguishing 404 from 500),
// and (true, nil) if the execution belongs to the team.
func (h *ExecutionsHandler) ownsExecution(ctx context.Context, executionID, teamID string) (bool, error) {
	if h.ownsExecFunc != nil {
		return h.ownsExecFunc(ctx, executionID, teamID)
	}
	var exists bool
	err := h.DB.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM test_executions WHERE id = $1 AND team_id = $2)`,
		executionID, teamID).Scan(&exists)
	if err != nil {
		return false, err
	}
	return exists, nil
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

	if h.DB == nil && h.ExecStore == nil {
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

	// Broadcast progress via WebSocket
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

	// Broadcast individual test result via WebSocket
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

	// Broadcast worker status via WebSocket
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
