package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog/log"

	"github.com/scaledtest/scaledtest/internal/analytics"
	"github.com/scaledtest/scaledtest/internal/auth"
	"github.com/scaledtest/scaledtest/internal/ctrf"
	"github.com/scaledtest/scaledtest/internal/db"
	"github.com/scaledtest/scaledtest/internal/model"
	"github.com/scaledtest/scaledtest/internal/quality"
	"github.com/scaledtest/scaledtest/internal/store"
	"github.com/scaledtest/scaledtest/internal/webhook"
)

// qualityGateEvaluator is the subset of store.QualityGateStore used by the
// reports handler for auto-evaluation on report submission.
type qualityGateEvaluator interface {
	ListEnabled(ctx context.Context, teamID string) ([]model.QualityGate, error)
	CreateEvaluation(ctx context.Context, gateID, reportID string, passed bool, details json.RawMessage) (*model.QualityGateEvaluation, error)
}

// githubStatusPoster posts a GitHub commit status.
// Implemented by *github.Client (internal/github).
type githubStatusPoster interface {
	PostStatus(ctx context.Context, owner, repo, sha, state, description, statusContext, targetURL string) error
}

// ReportsHandler handles CTRF report endpoints.
type ReportsHandler struct {
	DB                 *db.Pool
	AuditStore         *store.AuditStore
	QualityGateStore   qualityGateEvaluator
	Webhooks           *webhook.Notifier
	GitHubStatusPoster githubStatusPoster // nil when GitHub integration is disabled
	BaseURL            string             // used to construct target URLs in GitHub statuses
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
		Error(w, http.StatusBadRequest, "invalid CTRF format")
		return
	}

	if err := ctrf.Validate(report); err != nil {
		Error(w, http.StatusBadRequest, "CTRF validation failed")
		return
	}

	// Sanitize all user-controlled string fields to prevent stored XSS
	ctrf.Sanitize(report)

	executionID := r.URL.Query().Get("execution_id")

	if h.DB == nil {
		// Fallback for no-DB mode: accept but don't persist
		resp := map[string]interface{}{
			"message": "report accepted",
			"tool":    report.Results.Tool.Name,
			"tests":   report.Results.Summary.Tests,
		}
		if executionID != "" {
			resp["execution_id"] = executionID
		}
		JSON(w, http.StatusCreated, resp)
		h.maybePostGitHubStatus(r, report.Results.Summary, "", executionID)
		return
	}

	reportID := uuid.New().String()
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

	// Evaluate quality gates for this team
	if h.QualityGateStore != nil {
		gateResult := h.evaluateQualityGates(r, claims.TeamID, reportID, report, results)
		if gateResult != nil {
			resp["qualityGate"] = gateResult
		}
	}

	if h.AuditStore != nil {
		meta := map[string]interface{}{
			"tool":  report.Results.Tool.Name,
			"tests": report.Results.Summary.Tests,
		}
		if executionID != "" {
			meta["execution_id"] = executionID
		}
		h.AuditStore.Log(r.Context(), store.Entry{
			ActorID:      claims.UserID,
			ActorEmail:   claims.Email,
			TeamID:       claims.TeamID,
			Action:       "report.submitted",
			ResourceType: "report",
			ResourceID:   reportID,
			Metadata:     meta,
		})
	}

	// Fire webhook: report.submitted
	h.Webhooks.Notify(claims.TeamID, webhook.EventReportSubmitted, map[string]interface{}{
		"report_id":    reportID,
		"tool":         report.Results.Tool.Name,
		"tool_version": report.Results.Tool.Version,
		"tests":        report.Results.Summary.Tests,
		"passed":       report.Results.Summary.Passed,
		"failed":       report.Results.Summary.Failed,
	})

	// Fire webhook: gate.failed if any quality gate failed
	if gateResult, ok := resp["qualityGate"].(*QualityGateResponse); ok && gateResult != nil && !gateResult.Passed {
		h.Webhooks.Notify(claims.TeamID, webhook.EventGateFailed, map[string]interface{}{
			"report_id": reportID,
			"gates":     gateResult.Gates,
		})
	}

	JSON(w, http.StatusCreated, resp)
	h.maybePostGitHubStatus(r, report.Results.Summary, reportID, executionID)
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

	if h.AuditStore != nil {
		h.AuditStore.Log(r.Context(), store.Entry{
			ActorID:      claims.UserID,
			ActorEmail:   claims.Email,
			TeamID:       claims.TeamID,
			Action:       "report.deleted",
			ResourceType: "report",
			ResourceID:   reportID,
		})
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"id":      reportID,
		"deleted": true,
	})
}

// Compare handles GET /api/v1/reports/compare?base=<id>&head=<id>.
// It computes a diff between two CTRF reports: new failures, fixed tests,
// and duration regressions.
func (h *ReportsHandler) Compare(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	baseID := r.URL.Query().Get("base")
	headID := r.URL.Query().Get("head")
	if baseID == "" || headID == "" {
		Error(w, http.StatusBadRequest, "base and head report IDs are required")
		return
	}
	if baseID == headID {
		Error(w, http.StatusBadRequest, "base and head must be different reports")
		return
	}

	if h.DB == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	// Fetch both report metadata in parallel (sequential for simplicity, both must belong to team)
	fetchReport := func(id string) (*model.TestReport, error) {
		var rpt model.TestReport
		err := h.DB.QueryRow(r.Context(),
			`SELECT id, team_id, execution_id, tool_name, tool_version, environment, summary, created_at
			 FROM test_reports WHERE id = $1 AND team_id = $2`,
			id, claims.TeamID).Scan(
			&rpt.ID, &rpt.TeamID, &rpt.ExecutionID, &rpt.ToolName,
			&rpt.ToolVersion, &rpt.Environment, &rpt.Summary, &rpt.CreatedAt,
		)
		return &rpt, err
	}

	baseReport, err := fetchReport(baseID)
	if err == pgx.ErrNoRows {
		Error(w, http.StatusNotFound, "base report not found")
		return
	}
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to fetch base report")
		return
	}

	headReport, err := fetchReport(headID)
	if err == pgx.ErrNoRows {
		Error(w, http.StatusNotFound, "head report not found")
		return
	}
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to fetch head report")
		return
	}

	// Fetch test results for both reports
	fetchResults := func(reportID string) (map[string]*model.TestResult, error) {
		rows, err := h.DB.Query(r.Context(),
			`SELECT id, report_id, team_id, name, status, duration_ms, message, trace, file_path, suite, tags, retry, flaky, created_at
			 FROM test_results WHERE report_id = $1 AND team_id = $2`,
			reportID, claims.TeamID)
		if err != nil {
			return nil, err
		}
		defer rows.Close()

		results := make(map[string]*model.TestResult)
		for rows.Next() {
			var res model.TestResult
			if err := rows.Scan(
				&res.ID, &res.ReportID, &res.TeamID, &res.Name, &res.Status,
				&res.DurationMs, &res.Message, &res.Trace, &res.FilePath,
				&res.Suite, &res.Tags, &res.Retry, &res.Flaky, &res.CreatedAt,
			); err != nil {
				return nil, err
			}
			results[res.Name] = &res
		}
		return results, rows.Err()
	}

	baseResults, err := fetchResults(baseID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to fetch base test results")
		return
	}

	headResults, err := fetchResults(headID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to fetch head test results")
		return
	}

	// Compute diff
	type TestDiff struct {
		Name           string  `json:"name"`
		Suite          string  `json:"suite,omitempty"`
		FilePath       string  `json:"file_path,omitempty"`
		BaseStatus     string  `json:"base_status,omitempty"`
		HeadStatus     string  `json:"head_status,omitempty"`
		BaseDurationMs int64   `json:"base_duration_ms,omitempty"`
		HeadDurationMs int64   `json:"head_duration_ms,omitempty"`
		DurationDelta  int64   `json:"duration_delta_ms,omitempty"`
		DurationPct    float64 `json:"duration_delta_pct,omitempty"`
		Message        string  `json:"message,omitempty"`
	}

	var newFailures []TestDiff
	var fixed []TestDiff
	var durationRegressions []TestDiff

	// Tests in head: compare against base
	for name, headRes := range headResults {
		baseRes, existed := baseResults[name]
		if !existed {
			// New test — only flag if it failed
			if headRes.Status == "failed" {
				newFailures = append(newFailures, TestDiff{
					Name:           name,
					Suite:          headRes.Suite,
					FilePath:       headRes.FilePath,
					HeadStatus:     headRes.Status,
					HeadDurationMs: headRes.DurationMs,
					Message:        headRes.Message,
				})
			}
			continue
		}

		// Status changes
		if baseRes.Status != "failed" && headRes.Status == "failed" {
			newFailures = append(newFailures, TestDiff{
				Name:           name,
				Suite:          headRes.Suite,
				FilePath:       headRes.FilePath,
				BaseStatus:     baseRes.Status,
				HeadStatus:     headRes.Status,
				BaseDurationMs: baseRes.DurationMs,
				HeadDurationMs: headRes.DurationMs,
				Message:        headRes.Message,
			})
		} else if baseRes.Status == "failed" && headRes.Status == "passed" {
			fixed = append(fixed, TestDiff{
				Name:           name,
				Suite:          headRes.Suite,
				FilePath:       headRes.FilePath,
				BaseStatus:     baseRes.Status,
				HeadStatus:     headRes.Status,
				BaseDurationMs: baseRes.DurationMs,
				HeadDurationMs: headRes.DurationMs,
			})
		}

		// Duration regression: >20% slower AND at least 100ms longer
		if baseRes.DurationMs > 0 {
			delta := headRes.DurationMs - baseRes.DurationMs
			pct := float64(delta) / float64(baseRes.DurationMs) * 100
			if delta >= 100 && pct >= 20 {
				durationRegressions = append(durationRegressions, TestDiff{
					Name:           name,
					Suite:          headRes.Suite,
					FilePath:       headRes.FilePath,
					BaseStatus:     baseRes.Status,
					HeadStatus:     headRes.Status,
					BaseDurationMs: baseRes.DurationMs,
					HeadDurationMs: headRes.DurationMs,
					DurationDelta:  delta,
					DurationPct:    pct,
				})
			}
		}
	}

	// Tests that existed in base but are gone from head (treat as removed, not failure)
	// No action needed per spec — just track new failures / fixed.

	type DiffSummary struct {
		BaseTests           int `json:"base_tests"`
		HeadTests           int `json:"head_tests"`
		NewFailures         int `json:"new_failures"`
		Fixed               int `json:"fixed"`
		DurationRegressions int `json:"duration_regressions"`
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"base": baseReport,
		"head": headReport,
		"diff": map[string]interface{}{
			"new_failures":         newFailures,
			"fixed":                fixed,
			"duration_regressions": durationRegressions,
			"summary": DiffSummary{
				BaseTests:           len(baseResults),
				HeadTests:           len(headResults),
				NewFailures:         len(newFailures),
				Fixed:               len(fixed),
				DurationRegressions: len(durationRegressions),
			},
		},
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

// QualityGateRuleResult is a single rule evaluation for the API response.
type QualityGateRuleResult struct {
	Metric    string      `json:"metric"`
	Threshold interface{} `json:"threshold"`
	Actual    interface{} `json:"actual"`
	Passed    bool        `json:"passed"`
	Message   string      `json:"message"`
}

// QualityGateResponse is the quality gate section of the report submission response.
type QualityGateResponse struct {
	Passed bool                    `json:"passed"`
	Gates  []QualityGateDetail     `json:"gates"`
}

// QualityGateDetail is a single gate's evaluation in the response.
type QualityGateDetail struct {
	ID     string                  `json:"id"`
	Name   string                  `json:"name"`
	Passed bool                    `json:"passed"`
	Rules  []QualityGateRuleResult `json:"rules"`
}

// evaluateQualityGates evaluates all enabled quality gates for the team against
// the submitted report and stores evaluation results. Returns the gate result
// for inclusion in the response, or nil if there are no enabled gates.
func (h *ReportsHandler) evaluateQualityGates(
	r *http.Request,
	teamID, reportID string,
	report *ctrf.Report,
	results []model.TestResult,
) *QualityGateResponse {
	gates, err := h.QualityGateStore.ListEnabled(r.Context(), teamID)
	if err != nil {
		log.Error().Err(err).Str("team_id", teamID).Msg("failed to list enabled quality gates")
		return nil
	}
	if len(gates) == 0 {
		return nil
	}

	previousFailed := fetchPreviousFailedTests(r.Context(), h.DB, teamID, reportID)
	data := buildReportData(report, results, previousFailed)

	gateResp := &QualityGateResponse{Passed: true}
	for _, gate := range gates {
		evalResult, err := quality.Evaluate(gate.Rules, data)
		if err != nil {
			log.Error().Err(err).Str("gate_id", gate.ID).Msg("failed to evaluate quality gate")
			continue
		}

		// Store evaluation in DB
		detailsJSON, _ := json.Marshal(evalResult.Results)
		_, storeErr := h.QualityGateStore.CreateEvaluation(
			r.Context(), gate.ID, reportID, evalResult.Passed, detailsJSON,
		)
		if storeErr != nil {
			log.Error().Err(storeErr).Str("gate_id", gate.ID).Msg("failed to store gate evaluation")
		}

		// Build response detail
		rules := make([]QualityGateRuleResult, len(evalResult.Results))
		for i, rr := range evalResult.Results {
			rules[i] = QualityGateRuleResult{
				Metric:    string(rr.Type),
				Threshold: rr.Threshold,
				Actual:    rr.Actual,
				Passed:    rr.Passed,
				Message:   rr.Message,
			}
		}

		gateResp.Gates = append(gateResp.Gates, QualityGateDetail{
			ID:     gate.ID,
			Name:   gate.Name,
			Passed: evalResult.Passed,
			Rules:  rules,
		})

		if !evalResult.Passed {
			gateResp.Passed = false
		}
	}

	return gateResp
}

// fetchPreviousFailedTests returns the set of failed test names from the most
// recent prior report for the given team (excluding currentReportID). Returns
// nil if the DB is unavailable, no prior report exists, or it had no failures.
func fetchPreviousFailedTests(ctx context.Context, pool *db.Pool, teamID, currentReportID string) map[string]bool {
	if pool == nil {
		return nil
	}

	var prevReportID string
	err := pool.QueryRow(ctx,
		`SELECT id FROM test_reports WHERE team_id = $1 AND id != $2 ORDER BY created_at DESC LIMIT 1`,
		teamID, currentReportID,
	).Scan(&prevReportID)
	if err != nil {
		return nil
	}

	rows, err := pool.Query(ctx,
		`SELECT name FROM test_results WHERE report_id = $1 AND status = 'failed'`,
		prevReportID,
	)
	if err != nil {
		return nil
	}
	defer rows.Close()

	failed := make(map[string]bool)
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			continue
		}
		failed[name] = true
	}
	if err := rows.Err(); err != nil {
		return nil
	}
	if len(failed) == 0 {
		return nil
	}
	return failed
}

// buildReportData constructs quality.ReportData from a CTRF report, its
// normalized test results, and an optional set of previously failed test names.
func buildReportData(report *ctrf.Report, results []model.TestResult, previousFailed map[string]bool) *quality.ReportData {
	summary := report.Results.Summary

	var totalDurationMs int64
	currentFailed := make(map[string]bool)
	var flakyTests []analytics.FlakyTest

	for _, res := range results {
		totalDurationMs += res.DurationMs
		if res.Status == "failed" {
			currentFailed[res.Name] = true
		}
		if res.Flaky {
			flakyTests = append(flakyTests, analytics.FlakyTest{
				Name:     res.Name,
				Suite:    res.Suite,
				FilePath: res.FilePath,
			})
		}
	}

	return &quality.ReportData{
		TotalTests:          summary.Tests,
		PassedTests:         summary.Passed,
		FailedTests:         summary.Failed,
		SkippedTests:        summary.Skipped,
		TotalDurationMs:     totalDurationMs,
		FlakyTests:          flakyTests,
		CurrentFailedTests:  currentFailed,
		PreviousFailedTests: previousFailed,
	}
}

// maybePostGitHubStatus fires a GitHub commit status in a background goroutine
// when the request carries github_owner, github_repo, and github_sha query params
// and GitHubStatusPoster is configured. Errors are logged but never propagate to
// the caller — the status post is best-effort.
// When executionID is non-empty the status links to the execution page and
// includes the execution ID in the description for easy navigation.
func (h *ReportsHandler) maybePostGitHubStatus(r *http.Request, summary ctrf.Summary, reportID, executionID string) {
	if h.GitHubStatusPoster == nil {
		return
	}
	owner := r.URL.Query().Get("github_owner")
	repo := r.URL.Query().Get("github_repo")
	sha := r.URL.Query().Get("github_sha")
	if owner == "" || repo == "" || sha == "" {
		return
	}

	state := "success"
	if summary.Failed > 0 {
		state = "failure"
	}
	const statusContext = "scaledtest/e2e"

	description := fmt.Sprintf("%d tests: %d passed, %d failed",
		summary.Tests, summary.Passed, summary.Failed)
	var targetURL string
	if executionID != "" {
		description += fmt.Sprintf(" (execution: %s)", executionID)
		if h.BaseURL != "" {
			targetURL = fmt.Sprintf("%s/executions/%s", h.BaseURL, executionID)
		}
	} else if h.BaseURL != "" && reportID != "" {
		targetURL = fmt.Sprintf("%s/reports/%s", h.BaseURL, reportID)
	}

	poster := h.GitHubStatusPoster
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := poster.PostStatus(ctx, owner, repo, sha, state, description, statusContext, targetURL); err != nil {
			log.Error().Err(err).Str("sha", sha).Msg("failed to post GitHub commit status")
		}
	}()
}
