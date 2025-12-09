package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"testing"

	"github.com/MichielDean/ScaledTest/backend/api/proto"
	"github.com/MichielDean/ScaledTest/backend/internal/models"
	"github.com/gofiber/fiber/v2"
	"go.uber.org/zap"
)

// MockUserManager implements services.UserManager for testing.
type MockUserManager struct {
	GetUserProfileFunc    func(ctx context.Context, req *proto.GetUserProfileRequest) (*proto.UserProfileResponse, error)
	UpdateUserProfileFunc func(ctx context.Context, req *proto.UpdateUserProfileRequest) (*proto.UserProfileResponse, error)
	ListUsersFunc         func(ctx context.Context, req *proto.ListUsersRequest) (*proto.ListUsersResponse, error)
	GetUserByIDFunc       func(ctx context.Context, userID string) (*models.User, error)
	GetProfileByIDFunc    func(ctx context.Context, userID string) (*models.Profile, error)
	UpdateProfileFunc     func(ctx context.Context, profile *models.Profile) error
	ListUsersRESTFunc     func(ctx context.Context, page, pageSize int32, search, roleFilter string) ([]*models.User, int32, error)
}

func (m *MockUserManager) GetUserProfile(ctx context.Context, req *proto.GetUserProfileRequest) (*proto.UserProfileResponse, error) {
	if m.GetUserProfileFunc != nil {
		return m.GetUserProfileFunc(ctx, req)
	}
	return nil, errors.New("not implemented")
}

func (m *MockUserManager) UpdateUserProfile(ctx context.Context, req *proto.UpdateUserProfileRequest) (*proto.UserProfileResponse, error) {
	if m.UpdateUserProfileFunc != nil {
		return m.UpdateUserProfileFunc(ctx, req)
	}
	return nil, errors.New("not implemented")
}

func (m *MockUserManager) ListUsers(ctx context.Context, req *proto.ListUsersRequest) (*proto.ListUsersResponse, error) {
	if m.ListUsersFunc != nil {
		return m.ListUsersFunc(ctx, req)
	}
	return nil, errors.New("not implemented")
}

func (m *MockUserManager) GetUserByID(ctx context.Context, userID string) (*models.User, error) {
	if m.GetUserByIDFunc != nil {
		return m.GetUserByIDFunc(ctx, userID)
	}
	return nil, errors.New("not implemented")
}

func (m *MockUserManager) GetProfileByID(ctx context.Context, userID string) (*models.Profile, error) {
	if m.GetProfileByIDFunc != nil {
		return m.GetProfileByIDFunc(ctx, userID)
	}
	return nil, errors.New("not implemented")
}

func (m *MockUserManager) UpdateProfile(ctx context.Context, profile *models.Profile) error {
	if m.UpdateProfileFunc != nil {
		return m.UpdateProfileFunc(ctx, profile)
	}
	return errors.New("not implemented")
}

func (m *MockUserManager) ListUsersREST(ctx context.Context, page, pageSize int32, search, roleFilter string) ([]*models.User, int32, error) {
	if m.ListUsersRESTFunc != nil {
		return m.ListUsersRESTFunc(ctx, page, pageSize, search, roleFilter)
	}
	return nil, 0, errors.New("not implemented")
}

func TestUserHandler_GetUserProfile(t *testing.T) {
	logger, _ := zap.NewDevelopment()

	t.Run("Success - Get own profile", func(t *testing.T) {
		mockService := &MockUserManager{
			GetUserByIDFunc: func(ctx context.Context, userID string) (*models.User, error) {
				return &models.User{
					ID:    "user-123",
					Email: "test@example.com",
					Name:  "Test User",
					Role:  models.UserRoleUser,
				}, nil
			},
		}
		handler := NewUserHandler(mockService, logger)
		app := fiber.New()
		app.Get("/users/:id", func(c *fiber.Ctx) error {
			c.Locals("user_id", "user-123")
			c.Locals("user_role", "user")
			return handler.GetUserProfile(c)
		})

		req := httptest.NewRequest("GET", "/users/user-123", nil)

		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatal(err)
		}

		if resp.StatusCode != fiber.StatusOK {
			t.Errorf("Expected status 200, got %d", resp.StatusCode)
		}

		var profile UserProfile
		json.NewDecoder(resp.Body).Decode(&profile)

		if profile.Email != "test@example.com" {
			t.Errorf("Expected email 'test@example.com', got '%s'", profile.Email)
		}
	})

	t.Run("Success - Admin gets other user profile", func(t *testing.T) {
		mockService := &MockUserManager{
			GetUserByIDFunc: func(ctx context.Context, userID string) (*models.User, error) {
				return &models.User{
					ID:    "user-123",
					Email: "test@example.com",
					Name:  "Test User",
					Role:  models.UserRoleUser,
				}, nil
			},
		}
		handler := NewUserHandler(mockService, logger)
		app := fiber.New()
		app.Get("/users/:id", func(c *fiber.Ctx) error {
			c.Locals("user_id", "admin-123")
			c.Locals("user_role", "admin")
			return handler.GetUserProfile(c)
		})

		req := httptest.NewRequest("GET", "/users/user-123", nil)

		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatal(err)
		}

		if resp.StatusCode != fiber.StatusOK {
			t.Errorf("Expected status 200, got %d", resp.StatusCode)
		}
	})

	t.Run("Error - User not found", func(t *testing.T) {
		mockService := &MockUserManager{
			GetUserByIDFunc: func(ctx context.Context, userID string) (*models.User, error) {
				return nil, errors.New("user not found")
			},
		}
		handler := NewUserHandler(mockService, logger)
		app := fiber.New()
		app.Get("/users/:id", func(c *fiber.Ctx) error {
			c.Locals("user_id", "user-123")
			c.Locals("user_role", "user")
			return handler.GetUserProfile(c)
		})

		req := httptest.NewRequest("GET", "/users/user-123", nil)

		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatal(err)
		}

		if resp.StatusCode != fiber.StatusNotFound {
			t.Errorf("Expected status 404, got %d", resp.StatusCode)
		}
	})

	t.Run("Error - Forbidden access to other user", func(t *testing.T) {
		mockService := &MockUserManager{}
		handler := NewUserHandler(mockService, logger)
		app := fiber.New()
		app.Get("/users/:id", func(c *fiber.Ctx) error {
			c.Locals("user_id", "user-123")
			c.Locals("user_role", "user")
			return handler.GetUserProfile(c)
		})

		req := httptest.NewRequest("GET", "/users/other-user", nil)

		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatal(err)
		}

		if resp.StatusCode != fiber.StatusForbidden {
			t.Errorf("Expected status 403, got %d", resp.StatusCode)
		}
	})

	t.Run("Error - Missing user ID", func(t *testing.T) {
		mockService := &MockUserManager{}
		handler := NewUserHandler(mockService, logger)
		app := fiber.New()
		app.Get("/users/:id", func(c *fiber.Ctx) error {
			c.Locals("user_id", "user-123")
			c.Locals("user_role", "user")
			return handler.GetUserProfile(c)
		})

		req := httptest.NewRequest("GET", "/users/", nil)

		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatal(err)
		}

		if resp.StatusCode != fiber.StatusNotFound {
			t.Errorf("Expected status 404, got %d", resp.StatusCode)
		}
	})
}

func TestUserHandler_UpdateUserProfile(t *testing.T) {
	logger, _ := zap.NewDevelopment()

	t.Run("Success - Update own profile", func(t *testing.T) {
		mockService := &MockUserManager{
			GetProfileByIDFunc: func(ctx context.Context, userID string) (*models.Profile, error) {
				return &models.Profile{
					ID:    "user-123",
					Email: "old@example.com",
					Name:  "Old Name",
				}, nil
			},
			UpdateProfileFunc: func(ctx context.Context, profile *models.Profile) error {
				if profile.ID != "user-123" || profile.Name != "Updated Name" || profile.Email != "updated@example.com" {
					return errors.New("unexpected profile values")
				}
				return nil
			},
		}
		handler := NewUserHandler(mockService, logger)
		app := fiber.New()
		app.Put("/users/:id", func(c *fiber.Ctx) error {
			c.Locals("user_id", "user-123")
			return handler.UpdateUserProfile(c)
		})

		reqBody := UpdateProfileRequest{
			Name:  "Updated Name",
			Email: "updated@example.com",
		}
		body, _ := json.Marshal(reqBody)

		req := httptest.NewRequest("PUT", "/users/user-123", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")

		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatal(err)
		}

		if resp.StatusCode != fiber.StatusOK {
			t.Errorf("Expected status 200, got %d", resp.StatusCode)
		}
	})

	t.Run("Error - Forbidden to update other user", func(t *testing.T) {
		mockService := &MockUserManager{}
		handler := NewUserHandler(mockService, logger)
		app := fiber.New()
		app.Put("/users/:id", func(c *fiber.Ctx) error {
			c.Locals("user_id", "user-123")
			return handler.UpdateUserProfile(c)
		})

		reqBody := UpdateProfileRequest{
			Name:  "Updated Name",
			Email: "updated@example.com",
		}
		body, _ := json.Marshal(reqBody)

		req := httptest.NewRequest("PUT", "/users/other-user", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")

		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatal(err)
		}

		if resp.StatusCode != fiber.StatusForbidden {
			t.Errorf("Expected status 403, got %d", resp.StatusCode)
		}
	})

	t.Run("Error - Invalid request body", func(t *testing.T) {
		mockService := &MockUserManager{}
		handler := NewUserHandler(mockService, logger)
		app := fiber.New()
		app.Put("/users/:id", func(c *fiber.Ctx) error {
			c.Locals("user_id", "user-123")
			return handler.UpdateUserProfile(c)
		})

		req := httptest.NewRequest("PUT", "/users/user-123", bytes.NewReader([]byte("invalid-json")))
		req.Header.Set("Content-Type", "application/json")

		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatal(err)
		}

		if resp.StatusCode != fiber.StatusBadRequest {
			t.Errorf("Expected status 400, got %d", resp.StatusCode)
		}
	})
}
