package services

import (
	"context"

	"github.com/MichielDean/ScaledTest/backend/internal/models"
	"github.com/MichielDean/ScaledTest/backend/internal/repository"
	"go.uber.org/zap"
)

// ProjectService handles project management operations.
// It implements the ProjectManager interface.
type ProjectService struct {
	repo   repository.ProjectRepository
	logger *zap.Logger
}

// NewProjectService creates a new project service with injected dependencies.
func NewProjectService(repo repository.ProjectRepository, logger *zap.Logger) *ProjectService {
	return &ProjectService{
		repo:   repo,
		logger: logger,
	}
}

// CreateProject creates a new project
func (s *ProjectService) CreateProject(ctx context.Context, name string, description *string, gitRepositoryURL *string, createdBy string, organizationID *string, settings map[string]string) (*models.Project, error) {
	project := &models.Project{
		Name:                   name,
		Description:            description,
		GitRepositoryURL:       gitRepositoryURL,
		CreatedBy:              createdBy,
		OrganizationID:         organizationID,
		Settings:               settings,
		DefaultTestEnvironment: models.EnvironmentDev, // Default to dev environment
	}

	created, err := s.repo.Create(ctx, project)
	if err != nil {
		s.logger.Error("Failed to create project", zap.Error(err), zap.String("name", name))
		return nil, err
	}

	s.logger.Info("Project created", zap.String("id", created.ID), zap.String("name", name))
	return created, nil
}

// GetProject retrieves a project by ID
func (s *ProjectService) GetProject(ctx context.Context, projectID string) (*models.Project, error) {
	project, err := s.repo.GetByID(ctx, projectID)
	if err != nil {
		s.logger.Error("Failed to get project", zap.Error(err), zap.String("id", projectID))
		return nil, err
	}
	return project, nil
}

// ListProjects lists all projects for a user
func (s *ProjectService) ListProjects(ctx context.Context, userID string, page, pageSize int32) ([]*models.Project, int32, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	projects, totalCount, err := s.repo.ListByUser(ctx, userID, page, pageSize)
	if err != nil {
		s.logger.Error("Failed to list projects", zap.Error(err), zap.String("user_id", userID))
		return nil, 0, err
	}

	return projects, totalCount, nil
}

// UpdateProject updates a project
func (s *ProjectService) UpdateProject(ctx context.Context, projectID string, name *string, description *string, gitRepositoryURL *string, settings map[string]string) (*models.Project, error) {
	// Get existing project
	project, err := s.repo.GetByID(ctx, projectID)
	if err != nil {
		return nil, err
	}

	// Apply updates
	if name != nil {
		project.Name = *name
	}
	if description != nil {
		project.Description = description
	}
	if gitRepositoryURL != nil {
		project.GitRepositoryURL = gitRepositoryURL
	}
	if len(settings) > 0 {
		if project.Settings == nil {
			project.Settings = make(map[string]string)
		}
		for k, v := range settings {
			project.Settings[k] = v
		}
	}

	if err := s.repo.Update(ctx, project); err != nil {
		s.logger.Error("Failed to update project", zap.Error(err), zap.String("id", projectID))
		return nil, err
	}

	// Fetch updated project
	return s.repo.GetByID(ctx, projectID)
}

// DeleteProject deletes a project
func (s *ProjectService) DeleteProject(ctx context.Context, projectID string) error {
	if err := s.repo.Delete(ctx, projectID); err != nil {
		s.logger.Error("Failed to delete project", zap.Error(err), zap.String("id", projectID))
		return err
	}

	s.logger.Info("Project deleted", zap.String("id", projectID))
	return nil
}
