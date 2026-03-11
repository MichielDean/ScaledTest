package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/scaledtest/scaledtest/internal/auth"
	"github.com/scaledtest/scaledtest/internal/ctrf"
	"github.com/scaledtest/scaledtest/internal/db"
	"github.com/scaledtest/scaledtest/internal/model"
)

// ReportsHandler handles CTRF report endpoints.
type ReportsHandler struct {
	DB *db.Pool
}

// List handles GET /api/v1/reports.
func (h *ReportsHandler) List(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if h.DB == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	limit, offset := parsePagination(r)

	// Build WHERE clause with optional date filters
	whereClause := ` WHERE team_id = $1`
	args := []interface{}{claims.TeamID}
	argIdx := 2

	if since := r.URL.Query().Get("since"); since != "" {
		if t, err := time.Parse(time.RFC3339, since); err == nil {
			whereClause += ` AND created_at >= $` + strconv.Itoa(argIdx)
			args = append(args, t)
			argIdx++
		}
	}
	if until := r.URL.Query().Get("until"); until != "" {
		if t, err := time.Parse(time.RFC3339, until); err == nil {
			whereClause += ` AND created_at <= $` + strconv.Itoa(argIdx)
			args = append(args, t)
			argIdx++
		}
	}

	// Count query uses the same WHERE clause (including since/until filters)
	countQuery := `SELECT COUNT(*) FROM test_reports` + whereClause
	var total int
	if err := h.DB.QueryRow(r.Context(), countQuery, args...).Scan(&total); err != nil {
		Error(w, http.StatusInternalServerError, "failed to count reports")
		return
	}

	// Data query
	query := `SELECT id, team_id, execution_id, tool_name, tool_version, environment, summary, created_at
	          FROM test_reports` + whereClause +
		` ORDER BY created_at DESC LIMIT $` + strconv.Itoa(argIdx) + ` OFFSET $` + strconv.Itoa(argIdx+1)
	dataArgs := append(args, limit, offset)

	rows, err := h.DB.Query(r.Context(), query, dataArgs...)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to query reports")
		return
	}
	defer rows.Close()

	reports := []model.TestReport{}
	for rows.Next() {
		var rpt model.TestReport
		if err := rows.Scan(
			&rpt.ID, &rpt.TeamID, &rpt.ExecutionID, &rpt.ToolName,
			&rpt.ToolVersion, &rpt.Environment, &rpt.Summary, &rpt.CreatedAt,
		); err != nil {
			Error(w, http.StatusInternalServerError, "failed to scan report")
			return
		}
		reports = append(reports, rpt)
	}
	if err := rows.Err(); err != nil {
		Error(w, http.StatusInternalServerError, "failed to iterate reports")
		return
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"reports": reports,
		"total":   total,
	})
}

// Create handles POST /api/v1/reports — ingests a CTRF report.
func (h *ReportsHandler) Create(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 10<<20)) // 10MB limit
	if err != nil {
		Error(w, http.StatusBadRequest, "failed to read body")
		return
	}

	report, err := ctrf.Parse(body)
	if err != nil {
		Error(w, http.StatusBadRequest, "invalid CTRF format: "+err.Error())
		return
	}

	if err := ctrf.Validate(report); err != nil {
		Error(w, http.StatusBadRequest, "CTRF validation failed: "+err.Error())
		return
	}

	if h.DB == nil {
		// Fallback for no-DB mode: accept but don't persist
		resp := map[string]interface{}{
			"message": "report accepted",
			"tool":    report.Results.Tool.Name,
			"tests":   report.Results.Summary.Tests,
		}
		if executionID := r.URL.Query().Get("execution_id"); executionID != "" {
			resp["execution_id"] = executionID
		}
		JSON(w, http.StatusCreated, resp)
		return
	}

	reportID := uuid.New().String()
	executionID := r.URL.Query().Get("execution_id")
	now := time.Now()

	// Validate execution_id as UUID and verify team ownership if provided
	var execIDPtr *string
	if executionID != "" {
		if _, err := uuid.Parse(executionID); err != nil {
			Error(w, http.StatusBadRequest, "invalid execution_id: must be a valid UUID")
			return
		}
		// Verify execution exists and belongs to this team
		var exists bool
		err := h.DB.QueryRow(r.Context(),
			`SELECT EXISTS(SELECT 1 FROM test_executions WHERE id = $1 AND team_id = $2)`,
			executionID, claims.TeamID).Scan(&exists)
		if err != nil {
			Error(w, http.StatusInternalServerError, "failed to verify execution")
			return
		}
		if !exists {
			Error(w, http.StatusBadRequest, "execution not found or not in team")
			return
		}
		execIDPtr = &executionID
	}

	// Build summary JSON
	summaryJSON, err := ctrf.SummaryJSON(report.Results.Summary)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to marshal summary")
		return
	}

	// Store raw CTRF for archival
	rawJSON := json.RawMessage(body)

	// Use a transaction for atomic report ingestion
	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to begin transaction")
		return
	}
	defer tx.Rollback(r.Context())

	// Insert report
	_, err = tx.Exec(r.Context(),
		`INSERT INTO test_reports (id, team_id, execution_id, tool_name, tool_version, environment, summary, raw, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		reportID, claims.TeamID, execIDPtr,
		report.Results.Tool.Name, report.Results.Tool.Version,
		report.Results.Environment, summaryJSON, rawJSON, now)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to store report")
		return
	}

	// Normalize and insert individual test results
	results := ctrf.Normalize(report, reportID, claims.TeamID)
	for _, res := range results {
		resID := uuid.New().String()
		_, err = tx.Exec(r.Context(),
			`INSERT INTO test_results (id, report_id, team_id, name, status, duration_ms, message, trace, file_path, suite, tags, retry, flaky, created_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
			resID, res.ReportID, res.TeamID, res.Name, res.Status,
			res.DurationMs, nullString(res.Message), nullString(res.Trace),
			nullString(res.FilePath), nullString(res.Suite),
			res.Tags, res.Retry, res.Flaky, res.CreatedAt)
		if err != nil {
			Error(w, http.StatusInternalServerError, "failed to store test result")
			return
		}
	}

	// If linked to an execution, update execution with report_id
	if execIDPtr != nil {
		tag, err := tx.Exec(r.Context(),
			`UPDATE test_executions SET report_id = $1, updated_at = $2
			 WHERE id = $3 AND team_id = $4`,
			reportID, now, executionID, claims.TeamID)
		if err != nil {
			Error(w, http.StatusInternalServerError, "failed to link report to execution")
			return
		}
		if tag.RowsAffected() == 0 {
			Error(w, http.StatusBadRequest, "execution not found or not in team")
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		Error(w, http.StatusInternalServerError, "failed to commit report")
		return
	}

	resp := map[string]interface{}{
		"id":      reportID,
		"message": "report accepted",
		"tool":    report.Results.Tool.Name,
		"tests":   report.Results.Summary.Tests,
		"results": len(results),
	}
	if executionID != "" {
		resp["execution_id"] = executionID
	}

	JSON(w, http.StatusCreated, resp)
}

// Get handles GET /api/v1/reports/{reportID}.
func (h *ReportsHandler) Get(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	reportID := chi.URLParam(r, "reportID")
	if reportID == "" {
		Error(w, http.StatusBadRequest, "missing report ID")
		return
	}

	if h.DB == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	var rpt model.TestReport
	err := h.DB.QueryRow(r.Context(),
		`SELECT id, team_id, execution_id, tool_name, tool_version, environment, summary, created_at
		 FROM test_reports
		 WHERE id = $1 AND team_id = $2`,
		reportID, claims.TeamID).Scan(
		&rpt.ID, &rpt.TeamID, &rpt.ExecutionID, &rpt.ToolName,
		&rpt.ToolVersion, &rpt.Environment, &rpt.Summary, &rpt.CreatedAt,
	)
	if err == pgx.ErrNoRows {
		Error(w, http.StatusNotFound, "report not found")
		return
	}
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to get report")
		return
	}

	JSON(w, http.StatusOK, rpt)
}

// Delete handles DELETE /api/v1/reports/{reportID}.
func (h *ReportsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	reportID := chi.URLParam(r, "reportID")
	if reportID == "" {
		Error(w, http.StatusBadRequest, "missing report ID")
		return
	}

	if h.DB == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	tag, err := h.DB.Exec(r.Context(),
		`DELETE FROM test_reports WHERE id = $1 AND team_id = $2`,
		reportID, claims.TeamID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to delete report")
		return
	}
	if tag.RowsAffected() == 0 {
		Error(w, http.StatusNotFound, "report not found")
		return
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"id":      reportID,
		"deleted": true,
	})
}

// nullString returns a *string that is nil for empty strings.
func nullString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// parsePagination extracts limit and offset from query parameters.
func parsePagination(r *http.Request) (int, int) {
	limit := 50
	offset := 0

	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 100 {
			limit = v
		}
	}
	if o := r.URL.Query().Get("offset"); o != "" {
		if v, err := strconv.Atoi(o); err == nil && v >= 0 {
			offset = v
		}
	}

	return limit, offset
}
