package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/scaledtest/scaledtest/internal/auth"

	"github.com/scaledtest/scaledtest/internal/model"
	"github.com/scaledtest/scaledtest/internal/quality"
	"github.com/scaledtest/scaledtest/internal/sanitize"
	"github.com/scaledtest/scaledtest/internal/store"
)

// validRuleTypes are the supported quality gate rule types.
var validRuleTypes = map[string]bool{
	"pass_rate":       true,
	"zero_failures":   true,
	"no_new_failures": true,
	"max_duration":    true,
	"max_flaky_count": true,
	"min_test_count":  true,
}

// ruleTypesRequiringParams are rule types that must provide non-null params.
var ruleTypesRequiringParams = map[string]bool{
	"pass_rate":       true,
	"max_duration":    true,
	"max_flaky_count": true,
	"min_test_count":  true,
}

// QualityGateRule is a single rule in the quality gate rules array.
type QualityGateRule struct {
	Type   string          `json:"type"`
	Params json.RawMessage `json:"params"`
}

// qualityGateStore is the data-access interface for quality gate operations.
type qualityGateStore interface {
	List(ctx context.Context, teamID string) ([]model.QualityGate, error)
	Get(ctx context.Context, teamID, gateID string) (*model.QualityGate, error)
	Create(ctx context.Context, teamID, name, description string, rules json.RawMessage) (*model.QualityGate, error)
	Update(ctx context.Context, teamID, gateID, name, description string, rules json.RawMessage, enabled bool) (*model.QualityGate, error)
	Delete(ctx context.Context, teamID, gateID string) error
	CreateEvaluation(ctx context.Context, gateID, reportID string, passed bool, details json.RawMessage) (*model.QualityGateEvaluation, error)
	ListEvaluations(ctx context.Context, gateID string, limit int) ([]model.QualityGateEvaluation, error)
}

// QualityGatesHandler handles quality gate endpoints.
type QualityGatesHandler struct {
	Store       qualityGateStore
	ReportStore reportsStore
	AuditStore  auditLogger
}

// CreateQualityGateRequest is the request body for creating a quality gate.
type CreateQualityGateRequest struct {
	Name        string          `json:"name" validate:"required"`
	Description string          `json:"description"`
	Rules       json.RawMessage `json:"rules" validate:"required"`
}

// UpdateQualityGateRequest is the request body for updating a quality gate.
type UpdateQualityGateRequest struct {
	Name        string          `json:"name" validate:"required"`
	Description string          `json:"description"`
	Rules       json.RawMessage `json:"rules" validate:"required"`
	Enabled     *bool           `json:"enabled"`
}

// validateRules checks that all rules conform to the {type, params} schema.
func validateRules(raw json.RawMessage) error {
	var rules []QualityGateRule
	if err := json.Unmarshal(raw, &rules); err != nil {
		return fmt.Errorf("rules must be a JSON array of {type, params}")
	}
	if len(rules) == 0 {
		return fmt.Errorf("rules array must not be empty")
	}
	for i, rule := range rules {
		if !validRuleTypes[rule.Type] {
			return fmt.Errorf("rule[%d]: unsupported type %q (supported: pass_rate, zero_failures, no_new_failures, max_duration, max_flaky_count, min_test_count)", i, rule.Type)
		}
		if ruleTypesRequiringParams[rule.Type] {
			if len(rule.Params) == 0 || string(rule.Params) == "null" {
				return fmt.Errorf("rule[%d]: type %q requires params", i, rule.Type)
			}
		}
	}
	return nil
}

// requireMaintainer checks that the authenticated user has maintainer or owner role.
// Returns true if the request should continue, false if a 403 was written.
func requireMaintainer(w http.ResponseWriter, claims *auth.Claims) bool {
	if claims.Role != "maintainer" && claims.Role != "owner" {
		Error(w, http.StatusForbidden, "maintainer or owner role required")
		return false
	}
	return true
}

// teamIDFromURL extracts the teamID URL parameter and verifies the caller
// belongs to that team (via JWT claims). Returns the teamID or writes an error.
func teamIDFromURL(w http.ResponseWriter, r *http.Request, claims *auth.Claims) (string, bool) {
	teamID := chi.URLParam(r, "teamID")
	if teamID == "" {
		Error(w, http.StatusBadRequest, "missing team ID")
		return "", false
	}
	if claims.TeamID != teamID {
		Error(w, http.StatusForbidden, "team access denied")
		return "", false
	}
	return teamID, true
}

// List handles GET /api/v1/teams/:teamID/quality-gates.
func (h *QualityGatesHandler) List(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	teamID, ok := teamIDFromURL(w, r, claims)
	if !ok {
		return
	}

	if h.Store == nil {
		JSON(w, http.StatusOK, map[string]interface{}{
			"quality_gates": []interface{}{},
			"total":         0,
		})
		return
	}

	gates, err := h.Store.List(r.Context(), teamID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list quality gates")
		return
	}

	// Ensure non-null JSON array
	result := make([]interface{}, len(gates))
	for i := range gates {
		result[i] = gates[i]
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"quality_gates": result,
		"total":         len(result),
	})
}

// Create handles POST /api/v1/teams/:teamID/quality-gates.
func (h *QualityGatesHandler) Create(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	teamID, ok := teamIDFromURL(w, r, claims)
	if !ok {
		return
	}

	if !requireMaintainer(w, claims) {
		return
	}

	var req CreateQualityGateRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}

	if err := validateRules(req.Rules); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}

	if h.Store == nil {
		Error(w, http.StatusNotImplemented, "create quality gate requires database connection")
		return
	}

	// Sanitize user-provided strings
	req.Name = sanitize.String(req.Name)
	req.Description = sanitize.String(req.Description)

	gate, err := h.Store.Create(r.Context(), teamID, req.Name, req.Description, req.Rules)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to create quality gate")
		return
	}

	logAudit(r.Context(), h.AuditStore, store.Entry{
		ActorID:      claims.UserID,
		ActorEmail:   claims.Email,
		TeamID:       teamID,
		Action:       "quality_gate.created",
		ResourceType: "quality_gate",
		ResourceID:   gate.ID,
		Metadata:     map[string]interface{}{"name": gate.Name},
	})

	JSON(w, http.StatusCreated, gate)
}

// Get handles GET /api/v1/teams/:teamID/quality-gates/:gateID.
func (h *QualityGatesHandler) Get(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	teamID, ok := teamIDFromURL(w, r, claims)
	if !ok {
		return
	}

	gateID := chi.URLParam(r, "gateID")
	if gateID == "" {
		Error(w, http.StatusBadRequest, "missing gate ID")
		return
	}

	if h.Store == nil {
		Error(w, http.StatusNotImplemented, "get quality gate requires database connection")
		return
	}

	gate, err := h.Store.Get(r.Context(), teamID, gateID)
	if err != nil {
		Error(w, http.StatusNotFound, "quality gate not found")
		return
	}

	JSON(w, http.StatusOK, gate)
}

// Update handles PUT /api/v1/teams/:teamID/quality-gates/:gateID.
func (h *QualityGatesHandler) Update(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	teamID, ok := teamIDFromURL(w, r, claims)
	if !ok {
		return
	}

	if !requireMaintainer(w, claims) {
		return
	}

	gateID := chi.URLParam(r, "gateID")
	if gateID == "" {
		Error(w, http.StatusBadRequest, "missing gate ID")
		return
	}

	var req UpdateQualityGateRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}

	if err := validateRules(req.Rules); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}

	if h.Store == nil {
		Error(w, http.StatusNotImplemented, "update quality gate requires database connection")
		return
	}

	// Sanitize user-provided strings
	req.Name = sanitize.String(req.Name)
	req.Description = sanitize.String(req.Description)

	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	gate, err := h.Store.Update(r.Context(), teamID, gateID, req.Name, req.Description, req.Rules, enabled)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to update quality gate")
		return
	}

	logAudit(r.Context(), h.AuditStore, store.Entry{
		ActorID:      claims.UserID,
		ActorEmail:   claims.Email,
		TeamID:       teamID,
		Action:       "quality_gate.updated",
		ResourceType: "quality_gate",
		ResourceID:   gateID,
		Metadata:     map[string]interface{}{"name": req.Name},
	})

	JSON(w, http.StatusOK, gate)
}

// Delete handles DELETE /api/v1/teams/:teamID/quality-gates/:gateID.
func (h *QualityGatesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	teamID, ok := teamIDFromURL(w, r, claims)
	if !ok {
		return
	}

	if !requireMaintainer(w, claims) {
		return
	}

	gateID := chi.URLParam(r, "gateID")
	if gateID == "" {
		Error(w, http.StatusBadRequest, "missing gate ID")
		return
	}

	if h.Store == nil {
		Error(w, http.StatusNotImplemented, "delete quality gate requires database connection")
		return
	}

	if err := h.Store.Delete(r.Context(), teamID, gateID); err != nil {
		Error(w, http.StatusNotFound, "quality gate not found")
		return
	}

	logAudit(r.Context(), h.AuditStore, store.Entry{
		ActorID:      claims.UserID,
		ActorEmail:   claims.Email,
		TeamID:       teamID,
		Action:       "quality_gate.deleted",
		ResourceType: "quality_gate",
		ResourceID:   gateID,
	})

	JSON(w, http.StatusOK, map[string]string{"message": "quality gate deleted"})
}

// EvaluateRequest is the request body for evaluating a quality gate against a report.
type EvaluateRequest struct {
	ReportID string `json:"report_id" validate:"required"`
}

// Evaluate handles POST /api/v1/teams/:teamID/quality-gates/:gateID/evaluate.
func (h *QualityGatesHandler) Evaluate(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	teamID, ok := teamIDFromURL(w, r, claims)
	if !ok {
		return
	}

	gateID := chi.URLParam(r, "gateID")
	if gateID == "" {
		Error(w, http.StatusBadRequest, "missing gate ID")
		return
	}

	if h.Store == nil || h.ReportStore == nil {
		Error(w, http.StatusNotImplemented, "evaluate requires database connection")
		return
	}

	var req EvaluateRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}
	if req.ReportID == "" {
		Error(w, http.StatusBadRequest, "report_id is required")
		return
	}

	gate, err := h.Store.Get(r.Context(), teamID, gateID)
	if err != nil {
		Error(w, http.StatusNotFound, "quality gate not found")
		return
	}

	rpt, testResults, err := h.ReportStore.GetReportAndResults(r.Context(), req.ReportID, teamID)
	if err != nil {
		Error(w, http.StatusNotFound, "report not found")
		return
	}

	var summary struct {
		Tests   int `json:"tests"`
		Passed  int `json:"passed"`
		Failed  int `json:"failed"`
		Skipped int `json:"skipped"`
	}
	if err := json.Unmarshal(rpt.Summary, &summary); err != nil {
		Error(w, http.StatusInternalServerError, "failed to parse report summary")
		return
	}

	var totalDurationMs int64
	currentFailed := make(map[string]bool)
	var flakyTests []struct {
		name, suite, filePath string
	}

	for _, res := range testResults {
		totalDurationMs += res.DurationMs
		if res.Status == "failed" {
			currentFailed[res.Name] = true
		}
		if res.Flaky {
			flakyTests = append(flakyTests, struct {
				name, suite, filePath string
			}{res.Name, res.Suite, res.FilePath})
		}
	}

	previousFailed, err := h.ReportStore.GetPreviousFailedTests(r.Context(), teamID, req.ReportID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to fetch previous failures")
		return
	}

	// Build report data for evaluation
	data := &quality.ReportData{
		TotalTests:          summary.Tests,
		PassedTests:         summary.Passed,
		FailedTests:         summary.Failed,
		SkippedTests:        summary.Skipped,
		TotalDurationMs:     totalDurationMs,
		CurrentFailedTests:  currentFailed,
		PreviousFailedTests: previousFailed,
	}

	evalResult, err := quality.Evaluate(gate.Rules, data)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to evaluate gate: "+err.Error())
		return
	}

	// Store evaluation result
	detailsJSON, _ := json.Marshal(evalResult.Results)
	eval, err := h.Store.CreateEvaluation(r.Context(), gateID, req.ReportID, evalResult.Passed, detailsJSON)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to store evaluation")
		return
	}

	// Build response
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

	JSON(w, http.StatusOK, map[string]interface{}{
		"id":        eval.ID,
		"gate_id":   gateID,
		"report_id": req.ReportID,
		"passed":    evalResult.Passed,
		"rules":     rules,
	})
}

// ListEvaluations handles GET /api/v1/teams/:teamID/quality-gates/:gateID/evaluations.
func (h *QualityGatesHandler) ListEvaluations(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	teamID, ok := teamIDFromURL(w, r, claims)
	if !ok {
		return
	}

	gateID := chi.URLParam(r, "gateID")
	if gateID == "" {
		Error(w, http.StatusBadRequest, "missing gate ID")
		return
	}

	if h.Store == nil {
		JSON(w, http.StatusOK, map[string]interface{}{
			"evaluations": []interface{}{},
			"total":       0,
		})
		return
	}

	// Verify gate belongs to team
	if _, err := h.Store.Get(r.Context(), teamID, gateID); err != nil {
		Error(w, http.StatusNotFound, "quality gate not found")
		return
	}

	limit := 20
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}

	evals, err := h.Store.ListEvaluations(r.Context(), gateID, limit)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list evaluations")
		return
	}

	result := make([]interface{}, len(evals))
	for i := range evals {
		result[i] = evals[i]
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"evaluations": result,
		"total":       len(result),
	})
}
