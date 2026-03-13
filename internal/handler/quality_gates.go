package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/scaledtest/scaledtest/internal/auth"
	"github.com/scaledtest/scaledtest/internal/sanitize"
	"github.com/scaledtest/scaledtest/internal/store"
)

// Supported quality gate rule metrics.
var validMetrics = map[string]bool{
	"pass_rate":    true,
	"failed_count": true,
	"flaky_count":  true,
	"duration_p95": true,
}

// Supported quality gate rule operators.
var validOperators = map[string]bool{
	"gte": true,
	"lte": true,
	"eq":  true,
}

// QualityGateRule is a single rule in the quality gate rules array.
type QualityGateRule struct {
	Metric    string  `json:"metric"`
	Operator  string  `json:"operator"`
	Threshold float64 `json:"threshold"`
}

// QualityGatesHandler handles quality gate endpoints.
type QualityGatesHandler struct {
	Store *store.QualityGateStore
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

// validateRules checks that all rules conform to the {metric, operator, threshold} schema.
func validateRules(raw json.RawMessage) error {
	var rules []QualityGateRule
	if err := json.Unmarshal(raw, &rules); err != nil {
		return fmt.Errorf("rules must be a JSON array of {metric, operator, threshold}")
	}
	if len(rules) == 0 {
		return fmt.Errorf("rules array must not be empty")
	}
	for i, rule := range rules {
		if !validMetrics[rule.Metric] {
			return fmt.Errorf("rule[%d]: unsupported metric %q (supported: pass_rate, failed_count, flaky_count, duration_p95)", i, rule.Metric)
		}
		if !validOperators[rule.Operator] {
			return fmt.Errorf("rule[%d]: unsupported operator %q (supported: gte, lte, eq)", i, rule.Operator)
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

	JSON(w, http.StatusOK, map[string]string{"message": "quality gate deleted"})
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

	if h.Store == nil {
		Error(w, http.StatusNotImplemented, "evaluate requires database connection")
		return
	}

	// Get the gate to access its rules
	gate, err := h.Store.Get(r.Context(), teamID, gateID)
	if err != nil {
		Error(w, http.StatusNotFound, "quality gate not found")
		return
	}

	// TODO: Load actual report data from DB. For now return a stub evaluation.
	_ = gate
	Error(w, http.StatusNotImplemented, "evaluate requires report data from database")
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
