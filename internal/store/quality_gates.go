package store

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/scaledtest/scaledtest/internal/model"
)

// QualityGateStore handles quality gate persistence.
type QualityGateStore struct {
	pool *pgxpool.Pool
}

// NewQualityGateStore creates a new quality gate store.
func NewQualityGateStore(pool *pgxpool.Pool) *QualityGateStore {
	return &QualityGateStore{pool: pool}
}

// List returns all quality gates for a team.
func (s *QualityGateStore) List(ctx context.Context, teamID string) ([]model.QualityGate, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, team_id, name, description, rules, enabled, created_at, updated_at
		 FROM quality_gates WHERE team_id = $1 ORDER BY created_at DESC`, teamID)
	if err != nil {
		return nil, fmt.Errorf("query quality gates: %w", err)
	}
	defer rows.Close()

	var gates []model.QualityGate
	for rows.Next() {
		var g model.QualityGate
		var desc *string
		if err := rows.Scan(&g.ID, &g.TeamID, &g.Name, &desc, &g.Rules, &g.Enabled, &g.CreatedAt, &g.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan quality gate: %w", err)
		}
		if desc != nil {
			g.Description = *desc
		}
		gates = append(gates, g)
	}
	return gates, rows.Err()
}

// Get returns a single quality gate by ID, scoped to team.
func (s *QualityGateStore) Get(ctx context.Context, teamID, gateID string) (*model.QualityGate, error) {
	var g model.QualityGate
	var desc *string
	err := s.pool.QueryRow(ctx,
		`SELECT id, team_id, name, description, rules, enabled, created_at, updated_at
		 FROM quality_gates WHERE id = $1 AND team_id = $2`, gateID, teamID).
		Scan(&g.ID, &g.TeamID, &g.Name, &desc, &g.Rules, &g.Enabled, &g.CreatedAt, &g.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("get quality gate: %w", err)
	}
	if desc != nil {
		g.Description = *desc
	}
	return &g, nil
}

// Create inserts a new quality gate.
func (s *QualityGateStore) Create(ctx context.Context, teamID, name, description string, rules json.RawMessage) (*model.QualityGate, error) {
	var g model.QualityGate
	var desc *string
	err := s.pool.QueryRow(ctx,
		`INSERT INTO quality_gates (team_id, name, description, rules)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, team_id, name, description, rules, enabled, created_at, updated_at`,
		teamID, name, description, rules).
		Scan(&g.ID, &g.TeamID, &g.Name, &desc, &g.Rules, &g.Enabled, &g.CreatedAt, &g.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create quality gate: %w", err)
	}
	if desc != nil {
		g.Description = *desc
	}
	return &g, nil
}

// Update modifies an existing quality gate.
func (s *QualityGateStore) Update(ctx context.Context, teamID, gateID, name, description string, rules json.RawMessage, enabled bool) (*model.QualityGate, error) {
	var g model.QualityGate
	var desc *string
	err := s.pool.QueryRow(ctx,
		`UPDATE quality_gates SET name = $3, description = $4, rules = $5, enabled = $6, updated_at = now()
		 WHERE id = $1 AND team_id = $2
		 RETURNING id, team_id, name, description, rules, enabled, created_at, updated_at`,
		gateID, teamID, name, description, rules, enabled).
		Scan(&g.ID, &g.TeamID, &g.Name, &desc, &g.Rules, &g.Enabled, &g.CreatedAt, &g.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("update quality gate: %w", err)
	}
	if desc != nil {
		g.Description = *desc
	}
	return &g, nil
}

// Delete removes a quality gate.
func (s *QualityGateStore) Delete(ctx context.Context, teamID, gateID string) error {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM quality_gates WHERE id = $1 AND team_id = $2`, gateID, teamID)
	if err != nil {
		return fmt.Errorf("delete quality gate: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("quality gate not found")
	}
	return nil
}

// CreateEvaluation stores an evaluation result.
func (s *QualityGateStore) CreateEvaluation(ctx context.Context, gateID, reportID string, passed bool, details json.RawMessage) (*model.QualityGateEvaluation, error) {
	var e model.QualityGateEvaluation
	err := s.pool.QueryRow(ctx,
		`INSERT INTO quality_gate_evaluations (gate_id, report_id, passed, details)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, gate_id, report_id, passed, details, created_at`,
		gateID, reportID, passed, details).
		Scan(&e.ID, &e.GateID, &e.ReportID, &e.Passed, &e.Details, &e.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create evaluation: %w", err)
	}
	return &e, nil
}

// ListEvaluations returns evaluations for a gate, newest first.
func (s *QualityGateStore) ListEvaluations(ctx context.Context, gateID string, limit int) ([]model.QualityGateEvaluation, error) {
	if limit <= 0 {
		limit = 20
	}
	rows, err := s.pool.Query(ctx,
		`SELECT id, gate_id, report_id, passed, details, created_at
		 FROM quality_gate_evaluations WHERE gate_id = $1
		 ORDER BY created_at DESC LIMIT $2`, gateID, limit)
	if err != nil {
		return nil, fmt.Errorf("query evaluations: %w", err)
	}
	defer rows.Close()

	var evals []model.QualityGateEvaluation
	for rows.Next() {
		var e model.QualityGateEvaluation
		if err := rows.Scan(&e.ID, &e.GateID, &e.ReportID, &e.Passed, &e.Details, &e.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan evaluation: %w", err)
		}
		evals = append(evals, e)
	}
	return evals, rows.Err()
}
