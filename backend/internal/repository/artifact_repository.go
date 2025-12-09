package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/MichielDean/ScaledTest/backend/internal/database"
	"github.com/MichielDean/ScaledTest/backend/internal/models"
)

// PostgresArtifactRepository handles persistence for test artifacts using PostgreSQL.
// It implements the ArtifactRepository interface.
type PostgresArtifactRepository struct {
	db database.Executor
}

// NewPostgresArtifactRepository creates a new PostgreSQL artifact repository.
func NewPostgresArtifactRepository(db database.Executor) *PostgresArtifactRepository {
	return &PostgresArtifactRepository{db: db}
}

// Create inserts a new artifact metadata record.
func (r *PostgresArtifactRepository) Create(ctx context.Context, artifact *models.TestArtifact) error {
	query := `
		INSERT INTO public.test_artifacts (
			id, test_job_id, ctrf_report_id, ctrf_test_id, artifact_type,
			file_path, absolute_path, content_type, size_bytes, metadata, created_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`

	_, err := r.db.Exec(ctx, query,
		artifact.ID,
		artifact.TestJobID,
		artifact.CTRFReportID,
		artifact.CTRFTestID,
		artifact.ArtifactType,
		artifact.FilePath,
		artifact.AbsolutePath,
		artifact.ContentType,
		artifact.SizeBytes,
		artifact.Metadata,
		artifact.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("insert artifact: %w", err)
	}

	return nil
}

// GetByID retrieves an artifact by ID.
func (r *PostgresArtifactRepository) GetByID(ctx context.Context, id string) (*models.TestArtifact, error) {
	query := `
		SELECT id, test_job_id, ctrf_report_id, ctrf_test_id, artifact_type,
		       file_path, absolute_path, content_type, size_bytes, metadata, created_at
		FROM public.test_artifacts
		WHERE id = $1
	`

	artifact := &models.TestArtifact{}
	err := r.db.QueryRow(ctx, query, id).Scan(
		&artifact.ID,
		&artifact.TestJobID,
		&artifact.CTRFReportID,
		&artifact.CTRFTestID,
		&artifact.ArtifactType,
		&artifact.FilePath,
		&artifact.AbsolutePath,
		&artifact.ContentType,
		&artifact.SizeBytes,
		&artifact.Metadata,
		&artifact.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("get artifact: %w", err)
	}

	return artifact, nil
}

// ListByTestRunID retrieves all artifacts for a test run.
func (r *PostgresArtifactRepository) ListByTestRunID(ctx context.Context, testRunID string) ([]*models.TestArtifact, error) {
	query := `
		SELECT a.id, a.test_job_id, a.ctrf_report_id, a.ctrf_test_id, a.artifact_type,
		       a.file_path, a.absolute_path, a.content_type, a.size_bytes, a.metadata, a.created_at
		FROM public.test_artifacts a
		JOIN public.test_jobs j ON j.id = a.test_job_id
		WHERE j.test_run_id = $1
		ORDER BY a.created_at DESC
	`

	rows, err := r.db.Query(ctx, query, testRunID)
	if err != nil {
		return nil, fmt.Errorf("list artifacts by test run: %w", err)
	}
	defer rows.Close()

	var artifacts []*models.TestArtifact
	for rows.Next() {
		artifact := &models.TestArtifact{}
		err := rows.Scan(
			&artifact.ID,
			&artifact.TestJobID,
			&artifact.CTRFReportID,
			&artifact.CTRFTestID,
			&artifact.ArtifactType,
			&artifact.FilePath,
			&artifact.AbsolutePath,
			&artifact.ContentType,
			&artifact.SizeBytes,
			&artifact.Metadata,
			&artifact.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan artifact: %w", err)
		}
		artifacts = append(artifacts, artifact)
	}

	return artifacts, nil
}

// ListByTestJobID retrieves all artifacts for a test job.
func (r *PostgresArtifactRepository) ListByTestJobID(ctx context.Context, testJobID string) ([]*models.TestArtifact, error) {
	query := `
		SELECT id, test_job_id, ctrf_report_id, ctrf_test_id, artifact_type,
		       file_path, absolute_path, content_type, size_bytes, metadata, created_at
		FROM public.test_artifacts
		WHERE test_job_id = $1
		ORDER BY created_at DESC
	`

	rows, err := r.db.Query(ctx, query, testJobID)
	if err != nil {
		return nil, fmt.Errorf("list artifacts by test job: %w", err)
	}
	defer rows.Close()

	var artifacts []*models.TestArtifact
	for rows.Next() {
		artifact := &models.TestArtifact{}
		err := rows.Scan(
			&artifact.ID,
			&artifact.TestJobID,
			&artifact.CTRFReportID,
			&artifact.CTRFTestID,
			&artifact.ArtifactType,
			&artifact.FilePath,
			&artifact.AbsolutePath,
			&artifact.ContentType,
			&artifact.SizeBytes,
			&artifact.Metadata,
			&artifact.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan artifact: %w", err)
		}
		artifacts = append(artifacts, artifact)
	}

	return artifacts, nil
}

// ListOlderThan retrieves artifacts older than a given time.
func (r *PostgresArtifactRepository) ListOlderThan(ctx context.Context, cutoff time.Time) ([]*models.TestArtifact, error) {
	query := `
		SELECT id, test_job_id, ctrf_report_id, ctrf_test_id, artifact_type,
		       file_path, absolute_path, content_type, size_bytes, metadata, created_at
		FROM public.test_artifacts
		WHERE created_at < $1
		ORDER BY created_at ASC
		LIMIT 1000
	`

	rows, err := r.db.Query(ctx, query, cutoff)
	if err != nil {
		return nil, fmt.Errorf("list old artifacts: %w", err)
	}
	defer rows.Close()

	var artifacts []*models.TestArtifact
	for rows.Next() {
		artifact := &models.TestArtifact{}
		err := rows.Scan(
			&artifact.ID,
			&artifact.TestJobID,
			&artifact.CTRFReportID,
			&artifact.CTRFTestID,
			&artifact.ArtifactType,
			&artifact.FilePath,
			&artifact.AbsolutePath,
			&artifact.ContentType,
			&artifact.SizeBytes,
			&artifact.Metadata,
			&artifact.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan artifact: %w", err)
		}
		artifacts = append(artifacts, artifact)
	}

	return artifacts, nil
}

// Delete removes an artifact by ID.
func (r *PostgresArtifactRepository) Delete(ctx context.Context, id string) error {
	query := `DELETE FROM public.test_artifacts WHERE id = $1`

	_, err := r.db.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("delete artifact: %w", err)
	}

	return nil
}

// DeleteByTestRunID removes all artifacts for a test run.
func (r *PostgresArtifactRepository) DeleteByTestRunID(ctx context.Context, testRunID string) (int, error) {
	query := `
		DELETE FROM public.test_artifacts a
		USING public.test_jobs j
		WHERE j.id = a.test_job_id AND j.test_run_id = $1
	`

	result, err := r.db.Exec(ctx, query, testRunID)
	if err != nil {
		return 0, fmt.Errorf("delete artifacts by test run: %w", err)
	}

	return int(result.RowsAffected()), nil
}
