package services_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/MichielDean/ScaledTest/backend/api/proto"
	"github.com/MichielDean/ScaledTest/backend/internal/mocks"
	"github.com/MichielDean/ScaledTest/backend/internal/models"
	"github.com/MichielDean/ScaledTest/backend/internal/repository"
	"github.com/MichielDean/ScaledTest/backend/internal/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"go.uber.org/zap"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// TestUserService_GetUserProfile tests user profile retrieval with mocked repository.
func TestUserService_GetUserProfile(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	ctx := context.Background()

	t.Run("Success - Get user profile", func(t *testing.T) {
		// Arrange
		mockRepo := mocks.NewMockUserRepository(t)
		service := services.NewUserService(mockRepo, logger)

		expectedUser := &models.User{
			ID:            "user-123",
			Email:         "test@example.com",
			Name:          "Test User",
			Role:          models.UserRoleUser,
			EmailVerified: true,
			CreatedAt:     time.Now(),
			UpdatedAt:     time.Now(),
		}

		mockRepo.EXPECT().
			GetUserWithRole(ctx, "user-123").
			Return(expectedUser, nil)

		// Act
		req := &proto.GetUserProfileRequest{UserId: "user-123"}
		resp, err := service.GetUserProfile(ctx, req)

		// Assert
		assert.NoError(t, err)
		assert.NotNil(t, resp)
		assert.Equal(t, "user-123", resp.Id)
		assert.Equal(t, "test@example.com", resp.Email)
		assert.Equal(t, "Test User", resp.Name)
		assert.Equal(t, "user", resp.Role)
		mockRepo.AssertExpectations(t)
	})

	t.Run("Error - User not found", func(t *testing.T) {
		// Arrange
		mockRepo := mocks.NewMockUserRepository(t)
		service := services.NewUserService(mockRepo, logger)

		mockRepo.EXPECT().
			GetUserWithRole(ctx, "nonexistent").
			Return(nil, errors.New("user not found: nonexistent"))

		// Act
		req := &proto.GetUserProfileRequest{UserId: "nonexistent"}
		resp, err := service.GetUserProfile(ctx, req)

		// Assert
		assert.Error(t, err)
		assert.Nil(t, resp)

		st, ok := status.FromError(err)
		assert.True(t, ok)
		assert.Equal(t, codes.NotFound, st.Code())
		mockRepo.AssertExpectations(t)
	})

	t.Run("Error - Missing user ID", func(t *testing.T) {
		// Arrange
		mockRepo := mocks.NewMockUserRepository(t)
		service := services.NewUserService(mockRepo, logger)

		// Act - repo should not be called for invalid request
		req := &proto.GetUserProfileRequest{UserId: ""}
		resp, err := service.GetUserProfile(ctx, req)

		// Assert
		assert.Error(t, err)
		assert.Nil(t, resp)

		st, ok := status.FromError(err)
		assert.True(t, ok)
		assert.Equal(t, codes.InvalidArgument, st.Code())
		// Repo should not be called
		mockRepo.AssertNotCalled(t, "GetUserWithRole", mock.Anything, mock.Anything)
	})
}

// TestUserService_UpdateUserProfile tests user profile updates with mocked repository.
func TestUserService_UpdateUserProfile(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	ctx := context.Background()

	t.Run("Success - Update user name", func(t *testing.T) {
		// Arrange
		mockRepo := mocks.NewMockUserRepository(t)
		service := services.NewUserService(mockRepo, logger)

		existingProfile := &models.Profile{
			ID:        "user-123",
			Email:     "test@example.com",
			Name:      "Old Name",
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}

		updatedUser := &models.User{
			ID:            "user-123",
			Email:         "test@example.com",
			Name:          "Updated Name",
			Role:          models.UserRoleUser,
			EmailVerified: true,
			CreatedAt:     time.Now(),
			UpdatedAt:     time.Now(),
		}

		// Expect GetProfileByID to fetch existing profile
		mockRepo.EXPECT().
			GetProfileByID(ctx, "user-123").
			Return(existingProfile, nil)

		// Expect UpdateProfile to be called with updated name
		mockRepo.EXPECT().
			UpdateProfile(ctx, mock.MatchedBy(func(p *models.Profile) bool {
				return p.ID == "user-123" && p.Name == "Updated Name"
			})).
			Return(nil)

		// Expect GetUserWithRole for the response
		mockRepo.EXPECT().
			GetUserWithRole(ctx, "user-123").
			Return(updatedUser, nil)

		// Act
		name := "Updated Name"
		req := &proto.UpdateUserProfileRequest{
			UserId: "user-123",
			Name:   &name,
		}
		resp, err := service.UpdateUserProfile(ctx, req)

		// Assert
		assert.NoError(t, err)
		assert.NotNil(t, resp)
		assert.Equal(t, "Updated Name", resp.Name)
		mockRepo.AssertExpectations(t)
	})

	t.Run("Error - Missing user ID", func(t *testing.T) {
		// Arrange
		mockRepo := mocks.NewMockUserRepository(t)
		service := services.NewUserService(mockRepo, logger)

		// Act
		name := "Updated Name"
		req := &proto.UpdateUserProfileRequest{
			UserId: "",
			Name:   &name,
		}
		resp, err := service.UpdateUserProfile(ctx, req)

		// Assert
		assert.Error(t, err)
		assert.Nil(t, resp)

		st, ok := status.FromError(err)
		assert.True(t, ok)
		assert.Equal(t, codes.InvalidArgument, st.Code())
	})
}

// TestUserService_ListUsers tests user listing with mocked repository.
func TestUserService_ListUsers(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	ctx := context.Background()

	t.Run("Success - List users with pagination", func(t *testing.T) {
		// Arrange
		mockRepo := mocks.NewMockUserRepository(t)
		service := services.NewUserService(mockRepo, logger)

		expectedUsers := []*models.User{
			{ID: "user-1", Email: "user1@example.com", Name: "User One", Role: models.UserRoleUser},
			{ID: "user-2", Email: "user2@example.com", Name: "User Two", Role: models.UserRoleAdmin},
		}

		mockRepo.EXPECT().
			ListUsers(ctx, repository.ListUsersOptions{
				Page:     1,
				PageSize: 20,
			}).
			Return(expectedUsers, int32(2), nil)

		// Act
		req := &proto.ListUsersRequest{
			Page:     1,
			PageSize: 20,
		}
		resp, err := service.ListUsers(ctx, req)

		// Assert
		assert.NoError(t, err)
		assert.NotNil(t, resp)
		assert.Len(t, resp.Users, 2)
		assert.Equal(t, int32(2), resp.TotalCount)
		assert.Equal(t, "user-1", resp.Users[0].Id)
		assert.Equal(t, "user-2", resp.Users[1].Id)
		mockRepo.AssertExpectations(t)
	})

	t.Run("Success - List users with search filter", func(t *testing.T) {
		// Arrange
		mockRepo := mocks.NewMockUserRepository(t)
		service := services.NewUserService(mockRepo, logger)

		expectedUsers := []*models.User{
			{ID: "user-1", Email: "john@example.com", Name: "John Doe", Role: models.UserRoleUser},
		}

		mockRepo.EXPECT().
			ListUsers(ctx, repository.ListUsersOptions{
				Page:     1,
				PageSize: 20,
				Search:   "john",
			}).
			Return(expectedUsers, int32(1), nil)

		// Act
		search := "john"
		req := &proto.ListUsersRequest{
			Page:     1,
			PageSize: 20,
			Search:   &search,
		}
		resp, err := service.ListUsers(ctx, req)

		// Assert
		assert.NoError(t, err)
		assert.NotNil(t, resp)
		assert.Len(t, resp.Users, 1)
		assert.Equal(t, "john@example.com", resp.Users[0].Email)
		mockRepo.AssertExpectations(t)
	})

	t.Run("Normalize pagination defaults", func(t *testing.T) {
		// Arrange
		mockRepo := mocks.NewMockUserRepository(t)
		service := services.NewUserService(mockRepo, logger)

		mockRepo.EXPECT().
			ListUsers(ctx, repository.ListUsersOptions{
				Page:     1,
				PageSize: 20,
			}).
			Return([]*models.User{}, int32(0), nil)

		// Act - pass invalid page (0) and pageSize (0) which should be normalized
		req := &proto.ListUsersRequest{
			Page:     0,
			PageSize: 0,
		}
		resp, err := service.ListUsers(ctx, req)

		// Assert
		assert.NoError(t, err)
		assert.NotNil(t, resp)
		assert.Equal(t, int32(1), resp.Page)
		assert.Equal(t, int32(20), resp.PageSize)
		mockRepo.AssertExpectations(t)
	})
}
