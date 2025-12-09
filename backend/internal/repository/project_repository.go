package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/MichielDean/ScaledTest/backend/internal/database"
	"github.com/MichielDean/ScaledTest/backend/internal/models"
	"github.com/google/uuid"
)

// PostgresProjectRepository handles persistence for projects using PostgreSQL.
// It implements the ProjectRepository interface.
type PostgresProjectRepository struct {
	db database.Executor
}

// NewPostgresProjectRepository creates a new PostgreSQL project repository.
func NewPostgresProjectRepository(db database.Executor) *PostgresProjectRepository {
	return &PostgresProjectRepository{db: db}
}

// Create inserts a new project and returns it with generated ID and timestamps
func (r *PostgresProjectRepository) Create(ctx context.Context, project *models.Project) (*models.Project, error) {
	if project.ID == "" {
		project.ID = uuid.New().String()
	}
	now := time.Now()
	project.CreatedAt = now
	project.UpdatedAt = now

	settingsJSON, err := json.Marshal(project.Settings)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal settings: %w", err)
	}
	if project.Settings == nil {
		settingsJSON = []byte("{}")
	}

	query := `
		INSERT INTO public.projects (
			id, name, description, git_repository_url, created_by, 
			organization_id, settings, default_test_environment, setup_completed,
			created_at, updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)
		RETURNING id, created_at, updated_at
	`

	err = r.db.QueryRow(ctx, query,
		project.ID,
		project.Name,
		project.Description,
		project.GitRepositoryURL,
		project.CreatedBy,
		project.OrganizationID,
		settingsJSON,
		project.DefaultTestEnvironment,
		project.SetupCompleted,
		project.CreatedAt,
		project.UpdatedAt,
	).Scan(&project.ID, &project.CreatedAt, &project.UpdatedAt)

	if err != nil {
		return nil, fmt.Errorf("failed to create project: %w", err)
	}

	return project, nil
}

// GetByID retrieves a project by its ID
func (r *PostgresProjectRepository) GetByID(ctx context.Context, id string) (*models.Project, error) {
	query := `
		SELECT id, name, description, git_repository_url, created_by,
		       organization_id, settings, default_test_environment, setup_completed,
		       created_at, updated_at
		FROM public.projects
		WHERE id = $1
	`

	project := &models.Project{}
	var settingsJSON []byte

	err := r.db.QueryRow(ctx, query, id).Scan(
		&project.ID,
		&project.Name,
		&project.Description,
		&project.GitRepositoryURL,
		&project.CreatedBy,
		&project.OrganizationID,
		&settingsJSON,
		&project.DefaultTestEnvironment,
		&project.SetupCompleted,
		&project.CreatedAt,
		&project.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("project not found: %w", err)
	}

	if len(settingsJSON) > 0 {
		if err := json.Unmarshal(settingsJSON, &project.Settings); err != nil {
			project.Settings = make(map[string]string)
		}
	}

	return project, nil
}

// ListByUser retrieves all projects for a user with pagination
func (r *PostgresProjectRepository) ListByUser(ctx context.Context, userID string, page, pageSize int32) ([]*models.Project, int32, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	// Get total count
	var totalCount int32
	countQuery := `SELECT COUNT(*) FROM public.projects WHERE created_by = $1`
	if err := r.db.QueryRow(ctx, countQuery, userID).Scan(&totalCount); err != nil {
		return nil, 0, fmt.Errorf("failed to count projects: %w", err)
	}

	// Get projects
	query := `
		SELECT id, name, description, git_repository_url, created_by,
		       organization_id, settings, default_test_environment, setup_completed,
		       created_at, updated_at
		FROM public.projects
		WHERE created_by = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.db.Query(ctx, query, userID, pageSize, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list projects: %w", err)
	}
	defer rows.Close()

	var projects []*models.Project
	for rows.Next() {
		project := &models.Project{}
		var settingsJSON []byte

		err := rows.Scan(
			&project.ID,
			&project.Name,
			&project.Description,
			&project.GitRepositoryURL,
			&project.CreatedBy,
			&project.OrganizationID,
			&settingsJSON,
			&project.DefaultTestEnvironment,
			&project.SetupCompleted,
			&project.CreatedAt,
			&project.UpdatedAt,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan project: %w", err)
		}

		if len(settingsJSON) > 0 {
			json.Unmarshal(settingsJSON, &project.Settings)
		}
		projects = append(projects, project)
	}

	if err = rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("error iterating projects: %w", err)
	}

	return projects, totalCount, nil
}

// Update updates an existing project
func (r *PostgresProjectRepository) Update(ctx context.Context, project *models.Project) error {
	project.UpdatedAt = time.Now()

	settingsJSON, err := json.Marshal(project.Settings)
	if err != nil {
		return fmt.Errorf("failed to marshal settings: %w", err)
	}

	query := `
		UPDATE public.projects
		SET name = $2, description = $3, git_repository_url = $4,
		    settings = $5::jsonb, default_test_environment = $6,
		    setup_completed = $7, updated_at = $8
		WHERE id = $1
	`

	result, err := r.db.Exec(ctx, query,
		project.ID,
		project.Name,
		project.Description,
		project.GitRepositoryURL,
		settingsJSON,
		project.DefaultTestEnvironment,
		project.SetupCompleted,
		project.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to update project: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("project not found: %s", project.ID)
	}

	return nil
}

// Delete removes a project by ID
func (r *PostgresProjectRepository) Delete(ctx context.Context, id string) error {
	result, err := r.db.Exec(ctx, "DELETE FROM public.projects WHERE id = $1", id)
	if err != nil {
		return fmt.Errorf("failed to delete project: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("project not found: %s", id)
	}

	return nil
}
