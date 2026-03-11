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

	"github.com/scaledtest/scaledtest/internal/auth"
	"github.com/scaledtest/scaledtest/internal/db"
	"github.com/scaledtest/scaledtest/internal/model"
)

// ExecutionsHandler handles test execution endpoints.
type ExecutionsHandler struct {
	DB *db.Pool
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

	if h.DB == nil {
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

	if h.DB == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

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

	if h.DB == nil {
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

	if h.DB == nil {
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

	if h.DB == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

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

