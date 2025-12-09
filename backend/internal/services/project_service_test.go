package services_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/MichielDean/ScaledTest/backend/internal/mocks"
	"github.com/MichielDean/ScaledTest/backend/internal/models"
	"github.com/MichielDean/ScaledTest/backend/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"go.uber.org/zap"
)

// TestProjectService_CreateProject tests project creation with mocked repository.
func TestProjectService_CreateProject(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	ctx := context.Background()

	t.Run("Success - Create project", func(t *testing.T) {
		// Arrange
		mockRepo := mocks.NewMockProjectRepository(t)
		service := services.NewProjectService(mockRepo, logger)

		expectedProject := &models.Project{
			ID:               "project-123",
			Name:             "Test Project",
			Description:      nil,
			GitRepositoryURL: nil,
			CreatedBy:        "user-123",
			OrganizationID:   nil,
			Settings:         map[string]string{"key": "value"},
			CreatedAt:        time.Now(),
			UpdatedAt:        time.Now(),
		}

		// Mock the Create method - use mock.MatchedBy for flexible matching
		mockRepo.EXPECT().
			Create(ctx, mock.MatchedBy(func(p *models.Project) bool {
				return p.Name == "Test Project" && p.CreatedBy == "user-123"
			})).
			Return(expectedProject, nil)

		// Act
		settings := map[string]string{"key": "value"}
		result, err := service.CreateProject(ctx, "Test Project", nil, nil, "user-123", nil, settings)

		// Assert
		assert.NoError(t, err)
		assert.NotNil(t, result)
		assert.Equal(t, "project-123", result.ID)
		assert.Equal(t, "Test Project", result.Name)
		mockRepo.AssertExpectations(t)
	})

	t.Run("Error - Repository failure", func(t *testing.T) {
		// Arrange
		mockRepo := mocks.NewMockProjectRepository(t)
		service := services.NewProjectService(mockRepo, logger)

		mockRepo.EXPECT().
			Create(ctx, mock.Anything).
			Return(nil, errors.New("database error"))

		// Act
		result, err := service.CreateProject(ctx, "Test Project", nil, nil, "user-123", nil, nil)

		// Assert
		assert.Error(t, err)
		assert.Nil(t, result)
		assert.Contains(t, err.Error(), "database error")
		mockRepo.AssertExpectations(t)
	})
}

// TestProjectService_GetProject tests project retrieval with mocked repository.
func TestProjectService_GetProject(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	ctx := context.Background()

	t.Run("Success - Get existing project", func(t *testing.T) {
		// Arrange
		mockRepo := mocks.NewMockProjectRepository(t)
		service := services.NewProjectService(mockRepo, logger)

		expectedProject := &models.Project{
			ID:        "project-123",
			Name:      "Test Project",
			CreatedBy: "user-123",
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}

		mockRepo.EXPECT().
			GetByID(ctx, "project-123").
			Return(expectedProject, nil)

		// Act
		result, err := service.GetProject(ctx, "project-123")

		// Assert
		assert.NoError(t, err)
		assert.NotNil(t, result)
		assert.Equal(t, "project-123", result.ID)
		assert.Equal(t, "Test Project", result.Name)
		mockRepo.AssertExpectations(t)
	})

	t.Run("Error - Project not found", func(t *testing.T) {
		// Arrange
		mockRepo := mocks.NewMockProjectRepository(t)
		service := services.NewProjectService(mockRepo, logger)

		mockRepo.EXPECT().
			GetByID(ctx, "nonexistent").
			Return(nil, errors.New("project not found: nonexistent"))

		// Act
		result, err := service.GetProject(ctx, "nonexistent")

		// Assert
		assert.Error(t, err)
		assert.Nil(t, result)
		assert.Contains(t, err.Error(), "not found")
		mockRepo.AssertExpectations(t)
	})
}

// TestProjectService_ListProjects tests project listing with mocked repository.
func TestProjectService_ListProjects(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	ctx := context.Background()

	t.Run("Success - List projects with pagination", func(t *testing.T) {
		// Arrange
		mockRepo := mocks.NewMockProjectRepository(t)
		service := services.NewProjectService(mockRepo, logger)

		expectedProjects := []*models.Project{
			{ID: "project-1", Name: "Project One", CreatedBy: "user-123"},
			{ID: "project-2", Name: "Project Two", CreatedBy: "user-123"},
		}

		mockRepo.EXPECT().
			ListByUser(ctx, "user-123", int32(1), int32(20)).
			Return(expectedProjects, int32(2), nil)

		// Act
		results, totalCount, err := service.ListProjects(ctx, "user-123", 1, 20)

		// Assert
		assert.NoError(t, err)
		assert.Len(t, results, 2)
		assert.Equal(t, int32(2), totalCount)
		assert.Equal(t, "project-1", results[0].ID)
		assert.Equal(t, "project-2", results[1].ID)
		mockRepo.AssertExpectations(t)
	})

	t.Run("Normalize pagination defaults", func(t *testing.T) {
		// Arrange
		mockRepo := mocks.NewMockProjectRepository(t)
		service := services.NewProjectService(mockRepo, logger)

		mockRepo.EXPECT().
			ListByUser(ctx, "user-123", int32(1), int32(20)). // Service normalizes page=0 to page=1
			Return([]*models.Project{}, int32(0), nil)

		// Act - pass invalid page (0) which should be normalized to 1
		_, _, err := service.ListProjects(ctx, "user-123", 0, 0)

		// Assert
		assert.NoError(t, err)
		mockRepo.AssertExpectations(t)
	})
}

// TestProjectService_UpdateProject tests project update with mocked repository.
func TestProjectService_UpdateProject(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	ctx := context.Background()

	t.Run("Success - Update project name", func(t *testing.T) {
		// Arrange
		mockRepo := mocks.NewMockProjectRepository(t)
		service := services.NewProjectService(mockRepo, logger)

		existingProject := &models.Project{
			ID:        "project-123",
			Name:      "Old Name",
			CreatedBy: "user-123",
		}

		updatedProject := &models.Project{
			ID:        "project-123",
			Name:      "New Name",
			CreatedBy: "user-123",
		}

		// Expect GetByID to fetch existing project
		mockRepo.EXPECT().
			GetByID(ctx, "project-123").
			Return(existingProject, nil).
			Once()

		// Expect Update to save changes
		mockRepo.EXPECT().
			Update(ctx, mock.MatchedBy(func(p *models.Project) bool {
				return p.ID == "project-123" && p.Name == "New Name"
			})).
			Return(nil)

		// Expect GetByID again to return updated project
		mockRepo.EXPECT().
			GetByID(ctx, "project-123").
			Return(updatedProject, nil).
			Once()

		// Act
		newName := "New Name"
		result, err := service.UpdateProject(ctx, "project-123", &newName, nil, nil, nil)

		// Assert
		assert.NoError(t, err)
		assert.NotNil(t, result)
		assert.Equal(t, "New Name", result.Name)
		mockRepo.AssertExpectations(t)
	})
}

// TestProjectService_DeleteProject tests project deletion with mocked repository.
func TestProjectService_DeleteProject(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	ctx := context.Background()

	t.Run("Success - Delete existing project", func(t *testing.T) {
		// Arrange
		mockRepo := mocks.NewMockProjectRepository(t)
		service := services.NewProjectService(mockRepo, logger)

		mockRepo.EXPECT().
			Delete(ctx, "project-123").
			Return(nil)

		// Act
		err := service.DeleteProject(ctx, "project-123")

		// Assert
		assert.NoError(t, err)
		mockRepo.AssertExpectations(t)
	})

	t.Run("Error - Project not found", func(t *testing.T) {
		// Arrange
		mockRepo := mocks.NewMockProjectRepository(t)
		service := services.NewProjectService(mockRepo, logger)

		mockRepo.EXPECT().
			Delete(ctx, "nonexistent").
			Return(errors.New("project not found: nonexistent"))

		// Act
		err := service.DeleteProject(ctx, "nonexistent")

		// Assert
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "not found")
		mockRepo.AssertExpectations(t)
	})
}
