package store

import (
	"context"
	"encoding/json"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/scaledtest/scaledtest/internal/model"
)

type ReportsStore struct {
	pool *pgxpool.Pool
}

func NewReportsStore(pool *pgxpool.Pool) *ReportsStore {
	return &ReportsStore{pool: pool}
}

type ReportListFilter struct {
	TeamID string
	Since  *time.Time
	Until  *time.Time
	Limit  int
	Offset int
}

type ReportListItem struct {
	Report model.TestReport
	Total  int
}

func (s *ReportsStore) List(ctx context.Context, f ReportListFilter) ([]map[string]interface{}, int, error) {
	whereClause := ` WHERE team_id = $1`
	args := []interface{}{f.TeamID}
	argIdx := 2

	if f.Since != nil {
		whereClause += ` AND created_at >= $` + strconv.Itoa(argIdx)
		args = append(args, *f.Since)
		argIdx++
	}
	if f.Until != nil {
		whereClause += ` AND created_at <= $` + strconv.Itoa(argIdx)
		args = append(args, *f.Until)
		argIdx++
	}

	countQuery := `SELECT COUNT(*) FROM test_reports` + whereClause
	var total int
	if err := s.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	query := `SELECT id, team_id, execution_id, tool_name, tool_version, environment, summary, created_at
	          FROM test_reports` + whereClause +
		` ORDER BY created_at DESC LIMIT $` + strconv.Itoa(argIdx) + ` OFFSET $` + strconv.Itoa(argIdx+1)
	dataArgs := append(args, f.Limit, f.Offset)

	rows, err := s.pool.Query(ctx, query, dataArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var reports []map[string]interface{}
	for rows.Next() {
		var rpt model.TestReport
		if err := rows.Scan(
			&rpt.ID, &rpt.TeamID, &rpt.ExecutionID, &rpt.ToolName,
			&rpt.ToolVersion, &rpt.Environment, &rpt.Summary, &rpt.CreatedAt,
		); err != nil {
			return nil, 0, err
		}
		reports = append(reports, flattenReport(rpt))
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	return reports, total, nil
}

func flattenReport(rpt model.TestReport) map[string]interface{} {
	out := map[string]interface{}{
		"id":         rpt.ID,
		"team_id":    rpt.TeamID,
		"tool_name":  rpt.ToolName,
		"summary":    rpt.Summary,
		"created_at": rpt.CreatedAt,
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

type CreateReportParams struct {
	ID                 string
	TeamID             string
	ExecutionID        *string
	ToolName           string
	ToolVersion        string
	Environment        json.RawMessage
	Summary            json.RawMessage
	Raw                json.RawMessage
	CreatedAt          time.Time
	TriageGitHubStatus bool
}

func (s *ReportsStore) Create(ctx context.Context, p CreateReportParams) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO test_reports (id, team_id, execution_id, tool_name, tool_version, environment, summary, raw, created_at, triage_github_status)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		p.ID, p.TeamID, p.ExecutionID,
		p.ToolName, p.ToolVersion,
		p.Environment, p.Summary, p.Raw, p.CreatedAt,
		p.TriageGitHubStatus)
	return err
}

func (s *ReportsStore) CreateWithResults(ctx context.Context, p CreateReportParams, results []model.TestResult) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx,
		`INSERT INTO test_reports (id, team_id, execution_id, tool_name, tool_version, environment, summary, raw, created_at, triage_github_status)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		p.ID, p.TeamID, p.ExecutionID,
		p.ToolName, p.ToolVersion,
		p.Environment, p.Summary, p.Raw, p.CreatedAt,
		p.TriageGitHubStatus)
	if err != nil {
		return err
	}

	batch := &pgx.Batch{}
	for _, res := range results {
		resID := uuid.New().String()
		batch.Queue(
			`INSERT INTO test_results (id, report_id, team_id, name, status, duration_ms, message, trace, file_path, suite, tags, retry, flaky, created_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
			resID, res.ReportID, res.TeamID, res.Name, res.Status,
			res.DurationMs, nullString(res.Message), nullString(res.Trace),
			nullString(res.FilePath), nullString(res.Suite),
			res.Tags, res.Retry, res.Flaky, p.CreatedAt,
		)
	}
	br := tx.SendBatch(ctx, batch)
	for range results {
		if _, err := br.Exec(); err != nil {
			br.Close()
			return err
		}
	}
	br.Close()

	if p.ExecutionID != nil {
		tag, err := tx.Exec(ctx,
			`UPDATE test_executions SET report_id = $1, updated_at = $2
			 WHERE id = $3 AND team_id = $4`,
			p.ID, p.CreatedAt, *p.ExecutionID, p.TeamID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return pgx.ErrNoRows
		}
	}

	return tx.Commit(ctx)
}

func (s *ReportsStore) Get(ctx context.Context, id, teamID string) (*model.TestReport, error) {
	var rpt model.TestReport
	err := s.pool.QueryRow(ctx,
		`SELECT id, team_id, execution_id, tool_name, tool_version, environment, summary, created_at
		 FROM test_reports
		 WHERE id = $1 AND team_id = $2`,
		id, teamID).Scan(
		&rpt.ID, &rpt.TeamID, &rpt.ExecutionID, &rpt.ToolName,
		&rpt.ToolVersion, &rpt.Environment, &rpt.Summary, &rpt.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &rpt, nil
}

func (s *ReportsStore) Delete(ctx context.Context, id, teamID string) (int64, error) {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM test_reports WHERE id = $1 AND team_id = $2`,
		id, teamID)
	return tag.RowsAffected(), err
}

func (s *ReportsStore) ExecutionExists(ctx context.Context, executionID, teamID string) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM test_executions WHERE id = $1 AND team_id = $2)`,
		executionID, teamID).Scan(&exists)
	return exists, err
}

type ReportSummaryData struct {
	Report *model.TestReport
	Tests  map[string]*model.TestResult
}

func (s *ReportsStore) GetReportAndResults(ctx context.Context, id, teamID string) (*model.TestReport, map[string]*model.TestResult, error) {
	var rpt model.TestReport
	err := s.pool.QueryRow(ctx,
		`SELECT id, team_id, execution_id, tool_name, tool_version, summary, created_at
		 FROM test_reports WHERE id = $1 AND team_id = $2`,
		id, teamID).Scan(
		&rpt.ID, &rpt.TeamID, &rpt.ExecutionID, &rpt.ToolName,
		&rpt.ToolVersion, &rpt.Summary, &rpt.CreatedAt,
	)
	if err != nil {
		return nil, nil, err
	}

	rows, err := s.pool.Query(ctx,
		`SELECT id, report_id, team_id, name, status, duration_ms,
		        COALESCE(message, ''), COALESCE(trace, ''), COALESCE(file_path, ''), COALESCE(suite, ''),
		        tags, retry, flaky, created_at
		 FROM test_results WHERE report_id = $1 AND team_id = $2`,
		id, teamID)
	if err != nil {
		return nil, nil, err
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
			return nil, nil, err
		}
		results[res.Name] = &res
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}

	return &rpt, results, nil
}

func (s *ReportsStore) GetPreviousFailedTests(ctx context.Context, teamID, currentReportID string) (map[string]bool, error) {
	var prevReportID string
	err := s.pool.QueryRow(ctx,
		`SELECT id FROM test_reports WHERE team_id = $1 AND id != $2 ORDER BY created_at DESC LIMIT 1`,
		teamID, currentReportID,
	).Scan(&prevReportID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	rows, err := s.pool.Query(ctx,
		`SELECT name FROM test_results WHERE report_id = $1 AND status = 'failed'`,
		prevReportID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	failed := make(map[string]bool)
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		failed[name] = true
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(failed) == 0 {
		return nil, nil
	}
	return failed, nil
}
