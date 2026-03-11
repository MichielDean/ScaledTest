package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/scaledtest/scaledtest/internal/auth"
	"github.com/scaledtest/scaledtest/internal/db"
	"github.com/scaledtest/scaledtest/internal/model"
	"github.com/scaledtest/scaledtest/internal/quality"
)

// QualityGatesHandler handles quality gate endpoints.
type QualityGatesHandler struct {
	DB *db.Pool
}

// CreateQualityGateRequest is the request body for creating a quality gate.
type CreateQualityGateRequest struct {
	Name        string          `json:"name" validate:"required"`
	Description string          `json:"description"`
	Rules       json.RawMessage `json:"rules" validate:"required"`
}

// UpdateQualityGateRequest is the request body for updating a quality gate.
type UpdateQualityGateRequest struct {
	Name        *string          `json:"name"`
	Description *string          `json:"description"`
	Rules       *json.RawMessage `json:"rules"`
	Active      *bool            `json:"active"`
}

// EvaluateRequest is the request body for evaluating a quality gate.
type EvaluateRequest struct {
	ReportID string `json:"report_id" validate:"required"`
}

// List handles GET /api/v1/quality-gates.
func (h *QualityGatesHandler) List(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if h.DB == nil {
		JSON(w, http.StatusOK, map[string]interface{}{
			"quality_gates": []interface{}{},
			"total":         0,
		})
		return
	}

	rows, err := h.DB.Query(r.Context(),
		`SELECT id, team_id, name, description, rules, active, created_at, updated_at
		 FROM quality_gates
		 WHERE team_id = $1
		 ORDER BY name`, claims.TeamID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list quality gates")
		return
	}
	defer rows.Close()

	var gates []model.QualityGate
	for rows.Next() {
		var g model.QualityGate
		if err := rows.Scan(&g.ID, &g.TeamID, &g.Name, &g.Description,
			&g.Rules, &g.Active, &g.CreatedAt, &g.UpdatedAt); err != nil {
			Error(w, http.StatusInternalServerError, "failed to scan quality gate")
			return
		}
		gates = append(gates, g)
	}
	if gates == nil {
		gates = []model.QualityGate{}
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"quality_gates": gates,
		"total":         len(gates),
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

	// Validate rules DSL by attempting to parse them
	if err := validateRules(req.Rules); err != nil {
		Error(w, http.StatusBadRequest, "invalid rules: "+err.Error())
		return
	}

	if h.DB == nil {
		Error(w, http.StatusNotImplemented, "create quality gate requires database connection")
		return
	}

	var gate model.QualityGate
	err := h.DB.QueryRow(r.Context(),
		`INSERT INTO quality_gates (team_id, name, description, rules)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, team_id, name, description, rules, active, created_at, updated_at`,
		claims.TeamID, req.Name, req.Description, req.Rules).
		Scan(&gate.ID, &gate.TeamID, &gate.Name, &gate.Description,
			&gate.Rules, &gate.Active, &gate.CreatedAt, &gate.UpdatedAt)
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

	if h.DB == nil {
		Error(w, http.StatusNotImplemented, "get quality gate requires database connection")
		return
	}

	var gate model.QualityGate
	err := h.DB.QueryRow(r.Context(),
		`SELECT id, team_id, name, description, rules, active, created_at, updated_at
		 FROM quality_gates
		 WHERE id = $1 AND team_id = $2`, gateID, claims.TeamID).
		Scan(&gate.ID, &gate.TeamID, &gate.Name, &gate.Description,
			&gate.Rules, &gate.Active, &gate.CreatedAt, &gate.UpdatedAt)
	if err == pgx.ErrNoRows {
		Error(w, http.StatusNotFound, "quality gate not found")
		return
	}
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to get quality gate")
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
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}

	if req.Rules != nil {
		if err := validateRules(*req.Rules); err != nil {
			Error(w, http.StatusBadRequest, "invalid rules: "+err.Error())
			return
		}
	}

	if h.DB == nil {
		Error(w, http.StatusNotImplemented, "update quality gate requires database connection")
		return
	}

	// First verify it exists and belongs to this team
	var exists bool
	err := h.DB.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM quality_gates WHERE id = $1 AND team_id = $2)`,
		gateID, claims.TeamID).Scan(&exists)
	if err != nil || !exists {
		Error(w, http.StatusNotFound, "quality gate not found")
		return
	}

	// Build dynamic update
	var gate model.QualityGate
	err = h.DB.QueryRow(r.Context(),
		`UPDATE quality_gates SET
			name = COALESCE($3, name),
			description = COALESCE($4, description),
			rules = COALESCE($5, rules),
			active = COALESCE($6, active),
			updated_at = now()
		 WHERE id = $1 AND team_id = $2
		 RETURNING id, team_id, name, description, rules, active, created_at, updated_at`,
		gateID, claims.TeamID, req.Name, req.Description, req.Rules, req.Active).
		Scan(&gate.ID, &gate.TeamID, &gate.Name, &gate.Description,
			&gate.Rules, &gate.Active, &gate.CreatedAt, &gate.UpdatedAt)
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

	if h.DB == nil {
		Error(w, http.StatusNotImplemented, "delete quality gate requires database connection")
		return
	}

	tag, err := h.DB.Exec(r.Context(),
		`DELETE FROM quality_gates WHERE id = $1 AND team_id = $2`, gateID, claims.TeamID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to delete quality gate")
		return
	}
	if tag.RowsAffected() == 0 {
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

	var req EvaluateRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}

	if h.DB == nil {
		Error(w, http.StatusNotImplemented, "evaluate requires database connection")
		return
	}

	// Load quality gate rules
	var gate model.QualityGate
	err := h.DB.QueryRow(r.Context(),
		`SELECT id, team_id, name, rules, active
		 FROM quality_gates
		 WHERE id = $1 AND team_id = $2`, gateID, claims.TeamID).
		Scan(&gate.ID, &gate.TeamID, &gate.Name, &gate.Rules, &gate.Active)
	if err == pgx.ErrNoRows {
		Error(w, http.StatusNotFound, "quality gate not found")
		return
	}
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to load quality gate")
		return
	}

	if !gate.Active {
		Error(w, http.StatusBadRequest, "quality gate is not active")
		return
	}

	// Load report summary
	var summary json.RawMessage
	err = h.DB.QueryRow(r.Context(),
		`SELECT summary FROM test_reports WHERE id = $1 AND team_id = $2`,
		req.ReportID, claims.TeamID).Scan(&summary)
	if err == pgx.ErrNoRows {
		Error(w, http.StatusNotFound, "report not found")
		return
	}
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to load report")
		return
	}

	// Parse summary into ReportData
	var rs model.ReportSummary
	if err := json.Unmarshal(summary, &rs); err != nil {
		Error(w, http.StatusInternalServerError, "failed to parse report summary")
		return
	}

	var totalDurationMs int64
	if rs.Stop > 0 && rs.Start > 0 {
		totalDurationMs = rs.Stop - rs.Start
	}

	reportData := &quality.ReportData{
		TotalTests:      rs.Tests,
		PassedTests:     rs.Passed,
		FailedTests:     rs.Failed,
		SkippedTests:    rs.Skipped,
		TotalDurationMs: totalDurationMs,
	}

	// Run evaluation
	evalResult, err := quality.Evaluate(gate.Rules, reportData)
	if err != nil {
		Error(w, http.StatusBadRequest, "evaluation failed: "+err.Error())
		return
	}

	// Store evaluation result
	detailsJSON, err := json.Marshal(evalResult.Results)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to serialize evaluation results")
		return
	}
	var eval model.QualityGateEvaluation
	err = h.DB.QueryRow(r.Context(),
		`INSERT INTO quality_gate_evaluations (gate_id, report_id, passed, details)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, gate_id, report_id, passed, details, created_at`,
		gateID, req.ReportID, evalResult.Passed, detailsJSON).
		Scan(&eval.ID, &eval.GateID, &eval.ReportID, &eval.Passed,
			&eval.Details, &eval.CreatedAt)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to store evaluation")
		return
	}

	JSON(w, http.StatusCreated, map[string]interface{}{
		"evaluation": eval,
		"passed":     evalResult.Passed,
		"results":    evalResult.Results,
	})
}

// validateRules validates that the rules JSON is a valid array of quality gate rules.
func validateRules(rulesJSON json.RawMessage) error {
	var rules []quality.Rule
	if err := json.Unmarshal(rulesJSON, &rules); err != nil {
		return err
	}
	if len(rules) == 0 {
		return fmt.Errorf("rules array must not be empty")
	}
	for _, rule := range rules {
		switch rule.Type {
		case quality.RulePassRate, quality.RuleZeroFailures, quality.RuleNoNewFailures,
			quality.RuleMaxDuration, quality.RuleMaxFlakyCount, quality.RuleMinTestCount:
			// valid
		default:
			return fmt.Errorf("unknown rule type: %s", rule.Type)
		}
	}
	return nil
}
