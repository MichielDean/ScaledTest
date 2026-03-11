package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/scaledtest/scaledtest/internal/auth"
	"github.com/scaledtest/scaledtest/internal/sanitize"
	"github.com/scaledtest/scaledtest/internal/store"
)

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
	Active      *bool           `json:"active"`
}

// List handles GET /api/v1/quality-gates.
func (h *QualityGatesHandler) List(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if h.Store == nil {
		JSON(w, http.StatusOK, map[string]interface{}{
			"quality_gates": []interface{}{},
			"total":         0,
		})
		return
	}

	gates, err := h.Store.List(r.Context(), claims.TeamID)
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

// Create handles POST /api/v1/quality-gates.
func (h *QualityGatesHandler) Create(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req CreateQualityGateRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}

	if h.Store == nil {
		Error(w, http.StatusNotImplemented, "create quality gate requires database connection")
		return
	}

	// Sanitize user-provided strings
	req.Name = sanitize.String(req.Name)
	req.Description = sanitize.String(req.Description)

	gate, err := h.Store.Create(r.Context(), claims.TeamID, req.Name, req.Description, req.Rules)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to create quality gate")
		return
	}

	JSON(w, http.StatusCreated, gate)
}

// Get handles GET /api/v1/quality-gates/{gateID}.
func (h *QualityGatesHandler) Get(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
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

	gate, err := h.Store.Get(r.Context(), claims.TeamID, gateID)
	if err != nil {
		Error(w, http.StatusNotFound, "quality gate not found")
		return
	}

	JSON(w, http.StatusOK, gate)
}

// Update handles PUT /api/v1/quality-gates/{gateID}.
func (h *QualityGatesHandler) Update(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
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

	if h.Store == nil {
		Error(w, http.StatusNotImplemented, "update quality gate requires database connection")
		return
	}

	// Sanitize user-provided strings
	req.Name = sanitize.String(req.Name)
	req.Description = sanitize.String(req.Description)

	active := true
	if req.Active != nil {
		active = *req.Active
	}

	gate, err := h.Store.Update(r.Context(), claims.TeamID, gateID, req.Name, req.Description, req.Rules, active)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to update quality gate")
		return
	}

	JSON(w, http.StatusOK, gate)
}

// Delete handles DELETE /api/v1/quality-gates/{gateID}.
func (h *QualityGatesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
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

	if err := h.Store.Delete(r.Context(), claims.TeamID, gateID); err != nil {
		Error(w, http.StatusNotFound, "quality gate not found")
		return
	}

	JSON(w, http.StatusOK, map[string]string{"message": "quality gate deleted"})
}

// Evaluate handles POST /api/v1/quality-gates/{gateID}/evaluate.
func (h *QualityGatesHandler) Evaluate(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
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
	gate, err := h.Store.Get(r.Context(), claims.TeamID, gateID)
	if err != nil {
		Error(w, http.StatusNotFound, "quality gate not found")
		return
	}

	// TODO: Load actual report data from DB. For now return a stub evaluation.
	_ = gate
	Error(w, http.StatusNotImplemented, "evaluate requires report data from database")
}

// ListEvaluations handles GET /api/v1/quality-gates/{gateID}/evaluations.
func (h *QualityGatesHandler) ListEvaluations(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
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
	if _, err := h.Store.Get(r.Context(), claims.TeamID, gateID); err != nil {
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
