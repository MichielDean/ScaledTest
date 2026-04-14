package handler

import (
	"context"
	"encoding/json"
	"errors"
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

	"github.com/scaledtest/scaledtest/internal/model"
	"github.com/scaledtest/scaledtest/internal/quality"
	"github.com/scaledtest/scaledtest/internal/store"
	"github.com/scaledtest/scaledtest/internal/triage"
	"github.com/scaledtest/scaledtest/internal/webhook"
)

// triageAccessor abstracts the store operations needed by GetTriage and RetryTriage.
type triageAccessor interface {
	GetByReportID(ctx context.Context, teamID, reportID string) (*model.TriageResult, error)
	ListClusters(ctx context.Context, teamID, triageID string) ([]model.TriageCluster, error)
	ListClassifications(ctx context.Context, teamID, triageID string) ([]model.TriageFailureClassification, error)
	ForceReset(ctx context.Context, teamID, reportID string) (*model.TriageResult, error)
}

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
	ReportStore        reportsStore
	AuditStore         *store.AuditStore
	QualityGateStore   qualityGateEvaluator
	Webhooks           *webhook.Notifier
	GitHubStatusPoster githubStatusPoster
	BaseURL            string
	TriageStore        triageAccessor
	TriageEnqueuer     triage.Enqueuer
	AllowBackdate      bool
}

// List handles GET /api/v1/reports.
func (h *ReportsHandler) List(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// Validate date filters before the store check so malformed params return 400
	// rather than falling through to a store error.
	var sinceTime, untilTime time.Time
	var hasSince, hasUntil bool

	if since := r.URL.Query().Get("since"); since != "" {
		t, err := time.Parse(time.RFC3339, since)
		if err != nil {
			Error(w, http.StatusBadRequest, "invalid since: must be RFC3339 (e.g. 2006-01-02T15:04:05Z)")
			return
		}
		sinceTime = t
		hasSince = true
	}
	if until := r.URL.Query().Get("until"); until != "" {
		t, err := time.Parse(time.RFC3339, until)
		if err != nil {
			Error(w, http.StatusBadRequest, "invalid until: must be RFC3339 (e.g. 2006-01-02T15:04:05Z)")
			return
		}
		untilTime = t
		hasUntil = true
	}

	if h.ReportStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	limit, offset := parsePagination(r)

	var sincePtr, untilPtr *time.Time
	if hasSince {
		sincePtr = &sinceTime
	}
	if hasUntil {
		untilPtr = &untilTime
	}
	reports, total, err := h.ReportStore.List(r.Context(), store.ReportListFilter{
		TeamID: claims.TeamID,
		Since:  sincePtr,
		Until:  untilPtr,
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to query reports")
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

	ctrf.Sanitize(report)

	executionID := r.URL.Query().Get("execution_id")
	triageGitHubStatus := r.URL.Query().Get("triage_github_status") == "true"

	if h.ReportStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	reportID := uuid.New().String()
	now := h.resolveReportTime(r)

	var execIDPtr *string
	if executionID != "" {
		if _, err := uuid.Parse(executionID); err != nil {
			Error(w, http.StatusBadRequest, "invalid execution_id: must be a valid UUID")
			return
		}
		var exists bool
		exists, err = h.ReportStore.ExecutionExists(r.Context(), executionID, claims.TeamID)
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

	summaryJSON, err := ctrf.SummaryJSON(report.Results.Summary)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to marshal summary")
		return
	}

	results := ctrf.Normalize(report, reportID, claims.TeamID)

	rawJSON := json.RawMessage(body)
	params := store.CreateReportParams{
		ID:                 reportID,
		TeamID:             claims.TeamID,
		ExecutionID:        execIDPtr,
		ToolName:           report.Results.Tool.Name,
		ToolVersion:        report.Results.Tool.Version,
		Environment:        report.Results.Environment,
		Summary:            summaryJSON,
		Raw:                rawJSON,
		CreatedAt:          now,
		TriageGitHubStatus: triageGitHubStatus,
	}
	if err := h.ReportStore.CreateWithResults(r.Context(), params, results); err != nil {
		if err == pgx.ErrNoRows {
			Error(w, http.StatusBadRequest, "execution not found or not in team")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to store report")
		return
	}

	if h.TriageEnqueuer != nil {
		h.TriageEnqueuer.Enqueue(claims.TeamID, reportID)
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
	if triageGitHubStatus {
		resp["triage_github_status"] = true
	}

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

	h.Webhooks.Notify(claims.TeamID, webhook.EventReportSubmitted, map[string]interface{}{
		"report_id":    reportID,
		"tool":         report.Results.Tool.Name,
		"tool_version": report.Results.Tool.Version,
		"tests":        report.Results.Summary.Tests,
		"passed":       report.Results.Summary.Passed,
		"failed":       report.Results.Summary.Failed,
	})

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

	if h.ReportStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	rpt, err := h.ReportStore.Get(r.Context(), reportID, claims.TeamID)
	if err == pgx.ErrNoRows {
		Error(w, http.StatusNotFound, "report not found")
		return
	}
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to get report")
		return
	}
	JSON(w, http.StatusOK, buildGetReportResponse(*rpt))
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

	if h.ReportStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	rowsAffected, err := h.ReportStore.Delete(r.Context(), reportID, claims.TeamID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to delete report")
		return
	}
	if rowsAffected == 0 {
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

	if h.ReportStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	var baseReport, headReport *model.TestReport
	var baseResults, headResults map[string]*model.TestResult

	var err error
	baseReport, baseResults, err = h.ReportStore.GetReportAndResults(r.Context(), baseID, claims.TeamID)
	if err == pgx.ErrNoRows {
		Error(w, http.StatusNotFound, "base report not found")
		return
	}
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to fetch base report")
		return
	}
	headReport, headResults, err = h.ReportStore.GetReportAndResults(r.Context(), headID, claims.TeamID)
	if err == pgx.ErrNoRows {
		Error(w, http.StatusNotFound, "head report not found")
		return
	}
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to fetch head report")
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

	for name, headRes := range headResults {
		baseRes, existed := baseResults[name]
		if !existed {
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

// GetTriage handles GET /api/v1/reports/{reportID}/triage.
// It returns the persisted triage result for the report: status, clusters (each
// with root cause, label, and failure classifications), overall summary, and
// metadata (model, generated_at). Returns 202 Accepted while triage is pending.
func (h *ReportsHandler) GetTriage(w http.ResponseWriter, r *http.Request) {
	claims, reportID, ok := h.triagePrecheck(w, r)
	if !ok {
		return
	}

	result, err := h.TriageStore.GetByReportID(r.Context(), claims.TeamID, reportID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "triage not found")
			return
		}
		log.Error().Err(err).Str("report_id", reportID).Msg("failed to get triage result")
		Error(w, http.StatusInternalServerError, "failed to get triage result")
		return
	}

	if result.Status == "pending" {
		writePending(w)
		return
	}

	clusters, err := h.TriageStore.ListClusters(r.Context(), claims.TeamID, result.ID)
	if err != nil {
		log.Error().Err(err).Str("triage_id", result.ID).Msg("failed to list triage clusters")
		Error(w, http.StatusInternalServerError, "failed to get triage clusters")
		return
	}

	classifications, err := h.TriageStore.ListClassifications(r.Context(), claims.TeamID, result.ID)
	if err != nil {
		log.Error().Err(err).Str("triage_id", result.ID).Msg("failed to list triage classifications")
		Error(w, http.StatusInternalServerError, "failed to get triage classifications")
		return
	}

	classByCluster := make(map[string][]map[string]string)
	for _, c := range classifications {
		key := ""
		if c.ClusterID != nil {
			key = *c.ClusterID
		}
		classByCluster[key] = append(classByCluster[key], map[string]string{
			"test_result_id": c.TestResultID,
			"classification": c.Classification,
		})
	}

	clusterResp := make([]map[string]interface{}, 0, len(clusters))
	for _, c := range clusters {
		cr := map[string]interface{}{
			"id":         c.ID,
			"root_cause": c.RootCause,
			"failures":   failuresOrEmpty(classByCluster[c.ID]),
		}
		if c.Label != nil {
			cr["label"] = *c.Label
		}
		clusterResp = append(clusterResp, cr)
	}

	resp := map[string]interface{}{
		"triage_status": result.Status,
		"clusters":      clusterResp,
	}
	if unclustered := classByCluster[""]; len(unclustered) > 0 {
		resp["unclustered_failures"] = unclustered
	}
	if result.Summary != nil {
		resp["summary"] = *result.Summary
	}
	if result.ErrorMsg != nil {
		resp["error"] = *result.ErrorMsg
	}

	meta := map[string]interface{}{
		"generated_at": result.UpdatedAt,
	}
	if result.LLMModel != nil {
		meta["model"] = *result.LLMModel
	}
	resp["metadata"] = meta

	JSON(w, http.StatusOK, resp)
}

// RetryTriage handles POST /api/v1/reports/{reportID}/triage/retry.
// It re-triggers LLM triage for a report whose triage has already completed or
// failed. Returns 202 Accepted while the new job is queued. Returns 404 if no
// triage record exists for the report. Returns 202 immediately if triage is
// already pending (idempotent).
func (h *ReportsHandler) RetryTriage(w http.ResponseWriter, r *http.Request) {
	claims, reportID, ok := h.triagePrecheck(w, r)
	if !ok {
		return
	}

	existing, err := h.TriageStore.GetByReportID(r.Context(), claims.TeamID, reportID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "triage not found")
			return
		}
		log.Error().Err(err).Str("report_id", reportID).Msg("failed to get triage result for retry")
		Error(w, http.StatusInternalServerError, "failed to get triage result")
		return
	}

	// Triage is already in-flight — return accepted without re-enqueuing.
	if existing.Status == "pending" {
		writePending(w)
		return
	}

	if h.TriageEnqueuer == nil {
		Error(w, http.StatusServiceUnavailable, "triage not available")
		return
	}

	resetResult, err := h.TriageStore.ForceReset(r.Context(), claims.TeamID, reportID)
	if err != nil {
		log.Error().Err(err).Str("report_id", reportID).Msg("failed to reset triage for retry")
		Error(w, http.StatusInternalServerError, "failed to reset triage")
		return
	}

	// ForceReset returns (nil, nil) when the row is already pending or absent
	// (e.g. a concurrent retry already won the race). Return 202 without
	// re-enqueuing — the in-flight job is sufficient.
	if resetResult == nil {
		writePending(w)
		return
	}

	h.TriageEnqueuer.Enqueue(claims.TeamID, reportID)
	writePending(w)
}

// failuresOrEmpty returns the slice if non-nil, otherwise an empty slice, so
// JSON output always contains an array rather than null.
func failuresOrEmpty(failures []map[string]string) []map[string]string {
	if failures == nil {
		return []map[string]string{}
	}
	return failures
}

// triagePrecheck validates auth, reportID, and store availability for triage
// endpoints. Returns ok=false (with the error already written to w) if any
// check fails.
func (h *ReportsHandler) triagePrecheck(w http.ResponseWriter, r *http.Request) (claims *auth.Claims, reportID string, ok bool) {
	claims = auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return nil, "", false
	}
	reportID = chi.URLParam(r, "reportID")
	if reportID == "" {
		Error(w, http.StatusBadRequest, "missing report ID")
		return nil, "", false
	}
	if h.TriageStore == nil {
		Error(w, http.StatusServiceUnavailable, "triage not available")
		return nil, "", false
	}
	return claims, reportID, true
}

// writePending writes a 202 Accepted response with triage_status=pending.
func writePending(w http.ResponseWriter) {
	JSON(w, http.StatusAccepted, map[string]interface{}{"triage_status": "pending"})
}

// computeReportName derives a display name for a report.
// If toolName is set, it returns "toolName" or "toolName vX.Y.Z" when
// toolVersion is also set. If toolName is empty it falls back to
// "Report <short-id>" using the first 8 characters of the report ID.
func computeReportName(id, toolName, toolVersion string) string {
	if toolName != "" {
		if toolVersion != "" {
			return toolName + " v" + toolVersion
		}
		return toolName
	}
	short := id
	if len(id) > 8 {
		short = id[:8]
	}
	return "Report " + short
}

// flattenReportForList returns a map representation of a TestReport with
// summary count fields (tests, passed, failed, skipped, pending) promoted to
// the top level alongside the raw summary blob, for the ListReports API response.
// If the summary cannot be parsed the count fields are omitted rather than
// returning zero values that could mask the underlying issue.
func flattenReportForList(rpt model.TestReport) map[string]interface{} {
	out := buildGetReportResponse(rpt)
	var s model.ReportSummary
	if err := json.Unmarshal(rpt.Summary, &s); err == nil {
		out["test_count"] = s.Tests
		out["passed"] = s.Passed
		out["failed"] = s.Failed
		out["skipped"] = s.Skipped
		out["pending"] = s.Pending
	}
	return out
}

// buildGetReportResponse returns the JSON map for the GetReport API response.
// Optional fields (tool_version, execution_id, environment) are omitted when empty,
// matching the omitempty contract of the original struct serialization.
func buildGetReportResponse(rpt model.TestReport) map[string]interface{} {
	out := map[string]interface{}{
		"id":         rpt.ID,
		"team_id":    rpt.TeamID,
		"tool_name":  rpt.ToolName,
		"summary":    rpt.Summary,
		"created_at": rpt.CreatedAt,
		"name":       computeReportName(rpt.ID, rpt.ToolName, rpt.ToolVersion),
	}
	if rpt.ToolVersion != "" {
		out["tool_version"] = rpt.ToolVersion
	}
	if rpt.ExecutionID != nil {
		out["execution_id"] = *rpt.ExecutionID
	}
	if len(rpt.Environment) > 0 {
		out["environment"] = rpt.Environment
	}
	return out
}

// resolveReportTime returns the timestamp to use for a new report.
// When h.AllowBackdate is true and the request contains a valid RFC3339
// created_at query parameter, that time is used instead of time.Now().
// An invalid or absent parameter always falls back to time.Now().
func (h *ReportsHandler) resolveReportTime(r *http.Request) time.Time {
	if h.AllowBackdate {
		if raw := r.URL.Query().Get("created_at"); raw != "" {
			if t, err := time.Parse(time.RFC3339, raw); err == nil {
				return t
			}
		}
	}
	return time.Now()
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
	Passed bool                `json:"passed"`
	Gates  []QualityGateDetail `json:"gates"`
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

	previousFailed, prevErr := h.getPreviousFailedTests(r.Context(), teamID, reportID)
	if prevErr != nil {
		log.Warn().Err(prevErr).Str("team_id", teamID).Str("report_id", reportID).
			Msg("failed to fetch previous failures for quality gate evaluation; skipping gate evaluation")
		return nil
	}
	data := buildReportData(report, results, previousFailed)

	gateResp := &QualityGateResponse{Passed: true}
	for _, gate := range gates {
		evalResult, err := quality.Evaluate(gate.Rules, data)
		if err != nil {
			log.Error().Err(err).Str("gate_id", gate.ID).Msg("failed to evaluate quality gate")
			continue
		}

		detailsJSON, _ := json.Marshal(evalResult.Results)
		_, storeErr := h.QualityGateStore.CreateEvaluation(
			r.Context(), gate.ID, reportID, evalResult.Passed, detailsJSON,
		)
		if storeErr != nil {
			log.Error().Err(storeErr).Str("gate_id", gate.ID).Msg("failed to store gate evaluation")
		}

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

func (h *ReportsHandler) getPreviousFailedTests(ctx context.Context, teamID, currentReportID string) (map[string]bool, error) {
	if h.ReportStore == nil {
		return nil, nil
	}
	return h.ReportStore.GetPreviousFailedTests(ctx, teamID, currentReportID)
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
