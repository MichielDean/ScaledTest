package store

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/scaledtest/scaledtest/internal/model"
)

// TriageStore handles LLM triage result persistence.
type TriageStore struct {
	pool *pgxpool.Pool
}

// NewTriageStore creates a new triage store.
func NewTriageStore(pool *pgxpool.Pool) *TriageStore {
	return &TriageStore{pool: pool}
}

// Create inserts a new triage result in pending state for the given report.
func (s *TriageStore) Create(ctx context.Context, teamID, reportID string) (*model.TriageResult, error) {
	var t model.TriageResult
	err := s.pool.QueryRow(ctx,
		`INSERT INTO triage_results (team_id, report_id)
		 VALUES ($1, $2)
		 RETURNING id, team_id, report_id, status, summary, llm_provider, llm_model,
		           input_tokens, output_tokens, cost_usd, error_msg, created_at, updated_at`,
		teamID, reportID).
		Scan(&t.ID, &t.TeamID, &t.ReportID, &t.Status, &t.Summary, &t.LLMProvider, &t.LLMModel,
			&t.InputTokens, &t.OutputTokens, &t.CostUSD, &t.ErrorMsg, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create triage result: %w", err)
	}
	return &t, nil
}

// Get returns a triage result by ID, scoped to team.
func (s *TriageStore) Get(ctx context.Context, teamID, triageID string) (*model.TriageResult, error) {
	var t model.TriageResult
	err := s.pool.QueryRow(ctx,
		`SELECT id, team_id, report_id, status, summary, llm_provider, llm_model,
		        input_tokens, output_tokens, cost_usd, error_msg, created_at, updated_at
		 FROM triage_results WHERE id = $1 AND team_id = $2`,
		triageID, teamID).
		Scan(&t.ID, &t.TeamID, &t.ReportID, &t.Status, &t.Summary, &t.LLMProvider, &t.LLMModel,
			&t.InputTokens, &t.OutputTokens, &t.CostUSD, &t.ErrorMsg, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("get triage result: %w", err)
	}
	return &t, nil
}

// GetByReportID returns the triage result for a specific report, scoped to team.
func (s *TriageStore) GetByReportID(ctx context.Context, teamID, reportID string) (*model.TriageResult, error) {
	var t model.TriageResult
	err := s.pool.QueryRow(ctx,
		`SELECT id, team_id, report_id, status, summary, llm_provider, llm_model,
		        input_tokens, output_tokens, cost_usd, error_msg, created_at, updated_at
		 FROM triage_results WHERE report_id = $1 AND team_id = $2`,
		reportID, teamID).
		Scan(&t.ID, &t.TeamID, &t.ReportID, &t.Status, &t.Summary, &t.LLMProvider, &t.LLMModel,
			&t.InputTokens, &t.OutputTokens, &t.CostUSD, &t.ErrorMsg, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("get triage result by report: %w", err)
	}
	return &t, nil
}

// Complete transitions a triage result to complete status with LLM metadata and token costs.
func (s *TriageStore) Complete(ctx context.Context, teamID, triageID, summary, llmProvider, llmModel string, inputTokens, outputTokens int, costUSD float64) (*model.TriageResult, error) {
	var t model.TriageResult
	err := s.pool.QueryRow(ctx,
		`UPDATE triage_results
		 SET status = 'complete', summary = $2, llm_provider = $3, llm_model = $4,
		     input_tokens = $5, output_tokens = $6, cost_usd = $7, updated_at = now()
		 WHERE id = $1 AND team_id = $8
		 RETURNING id, team_id, report_id, status, summary, llm_provider, llm_model,
		           input_tokens, output_tokens, cost_usd, error_msg, created_at, updated_at`,
		triageID, summary, llmProvider, llmModel, inputTokens, outputTokens, costUSD, teamID).
		Scan(&t.ID, &t.TeamID, &t.ReportID, &t.Status, &t.Summary, &t.LLMProvider, &t.LLMModel,
			&t.InputTokens, &t.OutputTokens, &t.CostUSD, &t.ErrorMsg, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("complete triage result: %w", err)
	}
	return &t, nil
}

// Fail transitions a triage result to failed status with an error message.
func (s *TriageStore) Fail(ctx context.Context, teamID, triageID, errorMsg string) (*model.TriageResult, error) {
	var t model.TriageResult
	err := s.pool.QueryRow(ctx,
		`UPDATE triage_results
		 SET status = 'failed', error_msg = $2, updated_at = now()
		 WHERE id = $1 AND team_id = $3
		 RETURNING id, team_id, report_id, status, summary, llm_provider, llm_model,
		           input_tokens, output_tokens, cost_usd, error_msg, created_at, updated_at`,
		triageID, errorMsg, teamID).
		Scan(&t.ID, &t.TeamID, &t.ReportID, &t.Status, &t.Summary, &t.LLMProvider, &t.LLMModel,
			&t.InputTokens, &t.OutputTokens, &t.CostUSD, &t.ErrorMsg, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("fail triage result: %w", err)
	}
	return &t, nil
}

// CreateCluster inserts a failure cluster for a triage result.
func (s *TriageStore) CreateCluster(ctx context.Context, triageID, teamID, rootCause string, label *string) (*model.TriageCluster, error) {
	var c model.TriageCluster
	err := s.pool.QueryRow(ctx,
		`INSERT INTO triage_clusters (triage_id, team_id, root_cause, label)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, triage_id, team_id, root_cause, label, created_at`,
		triageID, teamID, rootCause, label).
		Scan(&c.ID, &c.TriageID, &c.TeamID, &c.RootCause, &c.Label, &c.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create triage cluster: %w", err)
	}
	return &c, nil
}

// ListClusters returns all clusters for a triage result, ordered by creation time.
func (s *TriageStore) ListClusters(ctx context.Context, teamID, triageID string) ([]model.TriageCluster, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, triage_id, team_id, root_cause, label, created_at
		 FROM triage_clusters WHERE triage_id = $1 AND team_id = $2 ORDER BY created_at ASC`, triageID, teamID)
	if err != nil {
		return nil, fmt.Errorf("list triage clusters: %w", err)
	}
	defer rows.Close()

	var clusters []model.TriageCluster
	for rows.Next() {
		var c model.TriageCluster
		if err := rows.Scan(&c.ID, &c.TriageID, &c.TeamID, &c.RootCause, &c.Label, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan triage cluster: %w", err)
		}
		clusters = append(clusters, c)
	}
	return clusters, rows.Err()
}

// CreateClassification inserts a failure classification for a single test result.
func (s *TriageStore) CreateClassification(ctx context.Context, triageID string, clusterID *string, testResultID, teamID, classification string) (*model.TriageFailureClassification, error) {
	var c model.TriageFailureClassification
	err := s.pool.QueryRow(ctx,
		`INSERT INTO triage_failure_classifications (triage_id, cluster_id, test_result_id, team_id, classification)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, triage_id, cluster_id, test_result_id, team_id, classification, created_at`,
		triageID, clusterID, testResultID, teamID, classification).
		Scan(&c.ID, &c.TriageID, &c.ClusterID, &c.TestResultID, &c.TeamID, &c.Classification, &c.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create triage failure classification: %w", err)
	}
	return &c, nil
}

// ListClassifications returns all failure classifications for a triage result, ordered by creation time.
func (s *TriageStore) ListClassifications(ctx context.Context, teamID, triageID string) ([]model.TriageFailureClassification, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, triage_id, cluster_id, test_result_id, team_id, classification, created_at
		 FROM triage_failure_classifications WHERE triage_id = $1 AND team_id = $2 ORDER BY created_at ASC`, triageID, teamID)
	if err != nil {
		return nil, fmt.Errorf("list triage failure classifications: %w", err)
	}
	defer rows.Close()

	var classifications []model.TriageFailureClassification
	for rows.Next() {
		var c model.TriageFailureClassification
		if err := rows.Scan(&c.ID, &c.TriageID, &c.ClusterID, &c.TestResultID, &c.TeamID, &c.Classification, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan triage failure classification: %w", err)
		}
		classifications = append(classifications, c)
	}
	return classifications, rows.Err()
}
