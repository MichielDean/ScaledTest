package handlers

import (
	"context"

	"github.com/MichielDean/ScaledTest/backend/internal/models"
	"github.com/MichielDean/ScaledTest/backend/internal/services"
	"github.com/gofiber/fiber/v2"
	"go.uber.org/zap"
)

// ProjectHandler handles HTTP requests for projects.
// It depends on the ProjectManager interface for testability.
type ProjectHandler struct {
	service services.ProjectManager
	logger  *zap.Logger
}

// NewProjectHandler creates a new project handler with injected dependencies.
func NewProjectHandler(service services.ProjectManager, logger *zap.Logger) *ProjectHandler {
	return &ProjectHandler{
		service: service,
		logger:  logger,
	}
}

type CreateProjectRequest struct {
	Name              string            `json:"name"`
	Description       *string           `json:"description"`
	GitRepositoryURL  *string           `json:"git_repository_url"`
	OrganizationID    *string           `json:"organization_id"`
	Settings          map[string]string `json:"settings"`
}

type UpdateProjectRequest struct {
	Name              *string           `json:"name"`
	Description       *string           `json:"description"`
	GitRepositoryURL  *string           `json:"git_repository_url"`
	Settings          map[string]string `json:"settings"`
}

type ProjectResponse struct {
	ID               string            `json:"id"`
	Name             string            `json:"name"`
	Description      *string           `json:"description"`
	GitRepositoryURL *string           `json:"git_repository_url"`
	CreatedBy        string            `json:"created_by"`
	OrganizationID   *string           `json:"organization_id"`
	Settings         map[string]string `json:"settings"`
	CreatedAt        string            `json:"created_at"`
	UpdatedAt        string            `json:"updated_at"`
}

type ListProjectsResponse struct {
	Projects   []ProjectResponse `json:"projects"`
	TotalCount int32             `json:"total_count"`
	Page       int32             `json:"page"`
	PageSize   int32             `json:"page_size"`
}

// CreateProject creates a new project
func (h *ProjectHandler) CreateProject(c *fiber.Ctx) error {
	var req CreateProjectRequest
	if err := c.BodyParser(&req); err != nil {
		h.logger.Warn("Invalid request body", zap.Error(err))
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	if req.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Project name is required",
		})
	}

	// Get authenticated user ID
	userID, ok := c.Locals("user_id").(string)
	if !ok {
		h.logger.Error("User ID not found in context")
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Unauthorized",
		})
	}

	ctx := context.Background()
	project, err := h.service.CreateProject(
		ctx,
		req.Name,
		req.Description,
		req.GitRepositoryURL,
		userID,
		req.OrganizationID,
		req.Settings,
	)

	if err != nil {
		h.logger.Error("Failed to create project", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to create project",
		})
	}

	return c.Status(fiber.StatusCreated).JSON(toProjectResponse(project))
}

// GetProject retrieves a project by ID
func (h *ProjectHandler) GetProject(c *fiber.Ctx) error {
	projectID := c.Params("id")
	if projectID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Project ID is required",
		})
	}

	ctx := context.Background()
	project, err := h.service.GetProject(ctx, projectID)

	if err != nil {
		if err.Error() == "project not found: "+projectID {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"error": "Project not found",
			})
		}
		h.logger.Error("Failed to get project", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to get project",
		})
	}

	return c.JSON(toProjectResponse(project))
}

// ListProjects lists all projects for the authenticated user
func (h *ProjectHandler) ListProjects(c *fiber.Ctx) error {
	// Get authenticated user ID
	userID, ok := c.Locals("user_id").(string)
	if !ok {
		h.logger.Error("User ID not found in context")
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Unauthorized",
		})
	}

	page := c.QueryInt("page", 1)
	pageSize := c.QueryInt("page_size", 20)

	ctx := context.Background()
	projects, totalCount, err := h.service.ListProjects(ctx, userID, int32(page), int32(pageSize))

	if err != nil {
		h.logger.Error("Failed to list projects", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to list projects",
		})
	}

	response := ListProjectsResponse{
		Projects:   make([]ProjectResponse, len(projects)),
		TotalCount: totalCount,
		Page:       int32(page),
		PageSize:   int32(pageSize),
	}

	for i, project := range projects {
		response.Projects[i] = toProjectResponse(project)
	}

	return c.JSON(response)
}

// UpdateProject updates a project
func (h *ProjectHandler) UpdateProject(c *fiber.Ctx) error {
	projectID := c.Params("id")
	if projectID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Project ID is required",
		})
	}

	var req UpdateProjectRequest
	if err := c.BodyParser(&req); err != nil {
		h.logger.Warn("Invalid request body", zap.Error(err))
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	ctx := context.Background()
	project, err := h.service.UpdateProject(ctx, projectID, req.Name, req.Description, req.GitRepositoryURL, req.Settings)

	if err != nil {
		if err.Error() == "project not found: "+projectID {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"error": "Project not found",
			})
		}
		h.logger.Error("Failed to update project", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to update project",
		})
	}

	return c.JSON(toProjectResponse(project))
}

// DeleteProject deletes a project
func (h *ProjectHandler) DeleteProject(c *fiber.Ctx) error {
	projectID := c.Params("id")
	if projectID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Project ID is required",
		})
	}

	ctx := context.Background()
	err := h.service.DeleteProject(ctx, projectID)

	if err != nil {
		if err.Error() == "project not found: "+projectID {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"error": "Project not found",
			})
		}
		h.logger.Error("Failed to delete project", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to delete project",
		})
	}

	return c.Status(fiber.StatusNoContent).Send(nil)
}

// Helper function to convert service Project to ProjectResponse
func toProjectResponse(project *models.Project) ProjectResponse {
	return ProjectResponse{
		ID:               project.ID,
		Name:             project.Name,
		Description:      project.Description,
		GitRepositoryURL: project.GitRepositoryURL,
		CreatedBy:        project.CreatedBy,
		OrganizationID:   project.OrganizationID,
		Settings:         project.Settings,
		CreatedAt:        project.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:        project.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}
