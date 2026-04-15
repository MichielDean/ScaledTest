package store

import (
	"context"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/scaledtest/scaledtest/internal/model"
)

type ExecutionsStore struct {
	pool *pgxpool.Pool
}

func NewExecutionsStore(pool *pgxpool.Pool) *ExecutionsStore {
	return &ExecutionsStore{pool: pool}
}

func (s *ExecutionsStore) List(ctx context.Context, teamID string, limit, offset int) ([]model.TestExecution, int, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, team_id, status, command, config, report_id, k8s_job_name, k8s_pod_name,
		        error_msg, started_at, finished_at, created_at, updated_at
		 FROM test_executions
		 WHERE team_id = $1
		 ORDER BY created_at DESC
		 LIMIT $2 OFFSET $3`,
		teamID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var executions []model.TestExecution
	for rows.Next() {
		var e model.TestExecution
		if err := rows.Scan(
			&e.ID, &e.TeamID, &e.Status, &e.Command, &e.Config, &e.ReportID,
			&e.K8sJobName, &e.K8sPodName, &e.ErrorMsg, &e.StartedAt,
			&e.FinishedAt, &e.CreatedAt, &e.UpdatedAt,
		); err != nil {
			return nil, 0, err
		}
		executions = append(executions, e)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	var total int
	err = s.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM test_executions WHERE team_id = $1`,
		teamID).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	return executions, total, nil
}

func (s *ExecutionsStore) Create(ctx context.Context, teamID, command string, configJSON []byte) (string, error) {
	id := uuid.New().String()
	now := time.Now()
	_, err := s.pool.Exec(ctx,
		`INSERT INTO test_executions (id, team_id, status, command, config, created_at, updated_at)
		 VALUES ($1, $2, 'pending', $3, $4, $5, $5)`,
		id, teamID, command, configJSON, now)
	return id, err
}

func (s *ExecutionsStore) Get(ctx context.Context, id, teamID string) (*model.TestExecution, error) {
	var e model.TestExecution
	err := s.pool.QueryRow(ctx,
		`SELECT id, team_id, status, command, config, report_id, k8s_job_name, k8s_pod_name,
		        error_msg, started_at, finished_at, created_at, updated_at
		 FROM test_executions
		 WHERE id = $1 AND team_id = $2`,
		id, teamID).Scan(
		&e.ID, &e.TeamID, &e.Status, &e.Command, &e.Config, &e.ReportID,
		&e.K8sJobName, &e.K8sPodName, &e.ErrorMsg, &e.StartedAt,
		&e.FinishedAt, &e.CreatedAt, &e.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &e, nil
}

func (s *ExecutionsStore) Cancel(ctx context.Context, id, teamID string, now time.Time) (int64, error) {
	tag, err := s.pool.Exec(ctx,
		`UPDATE test_executions
		 SET status = 'cancelled', finished_at = $1, updated_at = $1
		 WHERE id = $2 AND team_id = $3 AND status IN ('pending', 'running')`,
		now, id, teamID)
	return tag.RowsAffected(), err
}

func (s *ExecutionsStore) UpdateStatus(ctx context.Context, id, teamID, status string, now time.Time, errorMsg *string) (int64, error) {
	query := `UPDATE test_executions SET status = $1, updated_at = $2`
	args := []interface{}{status, now}
	argIdx := 3

	if status == "running" {
		query += `, started_at = COALESCE(started_at, $3)`
		args = append(args, now)
		argIdx++
	}

	if status == "completed" || status == "failed" || status == "cancelled" {
		query += `, finished_at = $` + strconv.Itoa(argIdx)
		args = append(args, now)
		argIdx++
	}

	if errorMsg != nil && *errorMsg != "" {
		query += `, error_msg = $` + strconv.Itoa(argIdx)
		args = append(args, *errorMsg)
		argIdx++
	}

	query += ` WHERE id = $` + strconv.Itoa(argIdx) + ` AND team_id = $` + strconv.Itoa(argIdx+1)
	args = append(args, id, teamID)

	tag, err := s.pool.Exec(ctx, query, args...)
	return tag.RowsAffected(), err
}

func (s *ExecutionsStore) Exists(ctx context.Context, id, teamID string) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM test_executions WHERE id = $1 AND team_id = $2)`,
		id, teamID).Scan(&exists)
	return exists, err
}

func (s *ExecutionsStore) GetK8sJobName(ctx context.Context, id string) (*string, error) {
	var jobName *string
	err := s.pool.QueryRow(ctx,
		`SELECT k8s_job_name FROM test_executions WHERE id = $1`, id).Scan(&jobName)
	if err != nil {
		return nil, err
	}
	return jobName, nil
}

func (s *ExecutionsStore) SetK8sJobName(ctx context.Context, id, jobName string, now time.Time) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE test_executions SET k8s_job_name = $1, updated_at = $2 WHERE id = $3`,
		jobName, now, id)
	return err
}

func (s *ExecutionsStore) MarkFailed(ctx context.Context, id, errorMsg string, now time.Time) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE test_executions SET status = 'failed', error_msg = $1, updated_at = $2 WHERE id = $3 AND status = 'running'`,
		errorMsg, now, id)
	return err
}

const defaultListRunningLimit = 1000

func (s *ExecutionsStore) ListRunning(ctx context.Context) ([]model.TestExecution, error) {
	return s.ListRunningLimit(ctx, defaultListRunningLimit)
}

func (s *ExecutionsStore) ListRunningLimit(ctx context.Context, limit int) ([]model.TestExecution, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, team_id, status, command, config, report_id, k8s_job_name, k8s_pod_name,
		        error_msg, started_at, finished_at, created_at, updated_at
		 FROM test_executions
		 WHERE status = 'running'
		 ORDER BY created_at ASC
		 LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var executions []model.TestExecution
	for rows.Next() {
		var e model.TestExecution
		if err := rows.Scan(
			&e.ID, &e.TeamID, &e.Status, &e.Command, &e.Config, &e.ReportID,
			&e.K8sJobName, &e.K8sPodName, &e.ErrorMsg, &e.StartedAt,
			&e.FinishedAt, &e.CreatedAt, &e.UpdatedAt,
		); err != nil {
			return nil, err
		}
		executions = append(executions, e)
	}
	return executions, rows.Err()
}
