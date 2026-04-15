package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
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

// rowScanner is satisfied by pgx.Row (returned by QueryRow).
type rowScanner interface {
	Scan(dest ...any) error
}

func scanTriageResult(row rowScanner, t *model.TriageResult) error {
	return row.Scan(
		&t.ID, &t.TeamID, &t.ReportID, &t.Status, &t.Summary, &t.LLMProvider, &t.LLMModel,
		&t.InputTokens, &t.OutputTokens, &t.CostUSD, &t.ErrorMsg, &t.CreatedAt, &t.UpdatedAt,
	)
}

// CreateOrReset inserts a new pending triage result for the report, or resets
// a failed result back to pending so the job can be retried.
//
// Returns (result, nil) when a pending slot is successfully claimed — either a
// fresh insert or a reset from 'failed'.
//
// Returns (nil, nil) when the row already exists in 'pending' or 'complete'
// state; the caller should skip the job.
//
// Returns (nil, err) on any database error.
func (s *TriageStore) CreateOrReset(ctx context.Context, teamID, reportID string) (*model.TriageResult, error) {
	var t model.TriageResult
	err := scanTriageResult(s.pool.QueryRow(ctx,
		`INSERT INTO triage_results (team_id, report_id)
		 VALUES ($1, $2)
		 ON CONFLICT (report_id) DO UPDATE
		   SET status = 'pending', error_msg = NULL, summary = NULL, updated_at = now()
		   WHERE triage_results.status = 'failed'
		 RETURNING id, team_id, report_id, status, summary, llm_provider, llm_model,
		           input_tokens, output_tokens, cost_usd, error_msg, created_at, updated_at`,
		teamID, reportID), &t)
	if errors.Is(err, pgx.ErrNoRows) {
		// Row already exists in pending or complete state — no work to claim.
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("acquire triage slot: %w", err)
	}
	return &t, nil
}

// Create inserts a new triage result in pending state for the given report.
func (s *TriageStore) Create(ctx context.Context, teamID, reportID string) (*model.TriageResult, error) {
	var t model.TriageResult
	if err := scanTriageResult(s.pool.QueryRow(ctx,
		`INSERT INTO triage_results (team_id, report_id)
		 VALUES ($1, $2)
		 RETURNING id, team_id, report_id, status, summary, llm_provider, llm_model,
		           input_tokens, output_tokens, cost_usd, error_msg, created_at, updated_at`,
		teamID, reportID), &t); err != nil {
		return nil, fmt.Errorf("create triage result: %w", err)
	}
	return &t, nil
}

// Get returns a triage result by ID, scoped to team.
func (s *TriageStore) Get(ctx context.Context, teamID, triageID string) (*model.TriageResult, error) {
	var t model.TriageResult
	if err := scanTriageResult(s.pool.QueryRow(ctx,
		`SELECT id, team_id, report_id, status, summary, llm_provider, llm_model,
		        input_tokens, output_tokens, cost_usd, error_msg, created_at, updated_at
		 FROM triage_results WHERE id = $1 AND team_id = $2`,
		triageID, teamID), &t); err != nil {
		return nil, fmt.Errorf("get triage result: %w", err)
	}
	return &t, nil
}

// GetByReportID returns the triage result for a specific report, scoped to team.
func (s *TriageStore) GetByReportID(ctx context.Context, teamID, reportID string) (*model.TriageResult, error) {
	var t model.TriageResult
	if err := scanTriageResult(s.pool.QueryRow(ctx,
		`SELECT id, team_id, report_id, status, summary, llm_provider, llm_model,
		        input_tokens, output_tokens, cost_usd, error_msg, created_at, updated_at
		 FROM triage_results WHERE report_id = $1 AND team_id = $2`,
		reportID, teamID), &t); err != nil {
		return nil, fmt.Errorf("get triage result by report: %w", err)
	}
	return &t, nil
}

// Complete transitions a triage result to complete status with LLM metadata and token costs.
func (s *TriageStore) Complete(ctx context.Context, teamID, triageID, summary, llmProvider, llmModel string, inputTokens, outputTokens int, costUSD float64) (*model.TriageResult, error) {
	var t model.TriageResult
	if err := scanTriageResult(s.pool.QueryRow(ctx,
		`UPDATE triage_results
		 SET status = 'complete', summary = $3, llm_provider = $4, llm_model = $5,
		     input_tokens = $6, output_tokens = $7, cost_usd = $8, updated_at = now()
		 WHERE id = $1 AND team_id = $2 AND status = 'pending'
		 RETURNING id, team_id, report_id, status, summary, llm_provider, llm_model,
		           input_tokens, output_tokens, cost_usd, error_msg, created_at, updated_at`,
		triageID, teamID, summary, llmProvider, llmModel, inputTokens, outputTokens, costUSD), &t); err != nil {
		return nil, fmt.Errorf("complete triage result: %w", err)
	}
	return &t, nil
}

// Fail transitions a triage result to failed status with an error message.
func (s *TriageStore) Fail(ctx context.Context, teamID, triageID, errorMsg string) (*model.TriageResult, error) {
	var t model.TriageResult
	if err := scanTriageResult(s.pool.QueryRow(ctx,
		`UPDATE triage_results
		 SET status = 'failed', error_msg = $3, updated_at = now()
		 WHERE id = $1 AND team_id = $2 AND status = 'pending'
		 RETURNING id, team_id, report_id, status, summary, llm_provider, llm_model,
		           input_tokens, output_tokens, cost_usd, error_msg, created_at, updated_at`,
		triageID, teamID, errorMsg), &t); err != nil {
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

// ForceReset resets a triage result from any terminal state (complete or failed)
// back to pending so it can be re-run via the retry endpoint.
//
// Returns (result, nil) when the row was successfully reset.
// Returns (nil, nil) when the row is already pending or does not exist for the team.
// Returns (nil, err) on any database error.
//
// The reset runs inside a transaction: old triage_clusters and
// triage_failure_classifications are deleted before the status is updated so
// that a subsequent write does not mix old and new data (ON DELETE CASCADE only
// fires on DELETE, not UPDATE).
func (s *TriageStore) ForceReset(ctx context.Context, teamID, reportID string) (*model.TriageResult, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("force reset triage: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // rollback on early return is intentional

	// Delete old clusters and classifications for this report's triage result,
	// but only when the result is in a terminal state. If the result is pending
	// or absent the subquery returns no rows and the DELETE is a no-op.
	const terminalSubquery = `SELECT id FROM triage_results
	     WHERE report_id = $1 AND team_id = $2 AND status IN ('complete', 'failed')`

	if _, err := tx.Exec(ctx,
		`DELETE FROM triage_clusters WHERE triage_id = (`+terminalSubquery+`)`,
		reportID, teamID); err != nil {
		return nil, fmt.Errorf("force reset triage: delete stale clusters: %w", err)
	}
	if _, err := tx.Exec(ctx,
		`DELETE FROM triage_failure_classifications WHERE triage_id = (`+terminalSubquery+`)`,
		reportID, teamID); err != nil {
		return nil, fmt.Errorf("force reset triage: delete stale classifications: %w", err)
	}

	var t model.TriageResult
	err = scanTriageResult(tx.QueryRow(ctx,
		`UPDATE triage_results
		 SET status = 'pending', error_msg = NULL, summary = NULL,
		     llm_provider = NULL, llm_model = NULL,
		     input_tokens = 0, output_tokens = 0, cost_usd = 0, updated_at = now()
		 WHERE report_id = $1 AND team_id = $2 AND status IN ('complete', 'failed')
		 RETURNING id, team_id, report_id, status, summary, llm_provider, llm_model,
		           input_tokens, output_tokens, cost_usd, error_msg, created_at, updated_at`,
		reportID, teamID), &t)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("force reset triage: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("force reset triage: commit: %w", err)
	}
	return &t, nil
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

// ClusterInput is the data needed to persist a single triage cluster.
type ClusterInput struct {
	RootCause string
	Label     *string
}

// ClassificationInput is the data needed to persist a single failure classification.
type ClassificationInput struct {
	ClusterIndex   int
	TestResultID   string
	Classification string
}

// OutputData holds all clusters and classifications to persist atomically.
type OutputData struct {
	Clusters        []ClusterInput
	Classifications []ClassificationInput
}

// PersistOutput atomically writes all clusters and classifications for a triage
// result in a single database transaction. If any insert fails, all inserts are
// rolled back so the triage record is not left in an inconsistent state.
func (s *TriageStore) PersistOutput(ctx context.Context, teamID, triageID string, output *OutputData) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("persist triage output: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // rollback on early return is intentional

	// Insert clusters and collect their assigned UUIDs for linking classifications.
	clusterIDs := make([]string, len(output.Clusters))
	for i, cluster := range output.Clusters {
		err := tx.QueryRow(ctx,
			`INSERT INTO triage_clusters (triage_id, team_id, root_cause, label)
			 VALUES ($1, $2, $3, $4)
			 RETURNING id`,
			triageID, teamID, cluster.RootCause, cluster.Label,
		).Scan(&clusterIDs[i])
		if err != nil {
			return fmt.Errorf("persist cluster[%d]: %w", i, err)
		}
	}

	// Insert per-failure classifications linked to their cluster.
	for _, cl := range output.Classifications {
		var clusterID *string
		if cl.ClusterIndex >= 0 && cl.ClusterIndex < len(clusterIDs) {
			cid := clusterIDs[cl.ClusterIndex]
			clusterID = &cid
		}
		_, err := tx.Exec(ctx,
			`INSERT INTO triage_failure_classifications (triage_id, cluster_id, test_result_id, team_id, classification)
			 VALUES ($1, $2, $3, $4, $5)`,
			triageID, clusterID, cl.TestResultID, teamID, cl.Classification,
		)
		if err != nil {
			return fmt.Errorf("persist classification for %s: %w", cl.TestResultID, err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("persist triage output: commit: %w", err)
	}
	return nil
}
