package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/MichielDean/ScaledTest/backend/internal/models"
	"github.com/gofiber/fiber/v2"
	"go.uber.org/zap"
)

// MockAuthManager implements services.AuthManager for testing.
type MockAuthManager struct {
	SignupFunc           func(ctx context.Context, email, password, name string) (*models.AuthResult, error)
	LoginFunc            func(ctx context.Context, email, password string) (*models.AuthResult, error)
	GetUserFunc          func(ctx context.Context, userID string) (*models.User, error)
	ValidatePasswordFunc func(hashedPassword, password string) error
	HashPasswordFunc     func(password string) (string, error)
}

func (m *MockAuthManager) Signup(ctx context.Context, email, password, name string) (*models.AuthResult, error) {
	if m.SignupFunc != nil {
		return m.SignupFunc(ctx, email, password, name)
	}
	return nil, errors.New("not implemented")
}

func (m *MockAuthManager) Login(ctx context.Context, email, password string) (*models.AuthResult, error) {
	if m.LoginFunc != nil {
		return m.LoginFunc(ctx, email, password)
	}
	return nil, errors.New("not implemented")
}

func (m *MockAuthManager) GetUser(ctx context.Context, userID string) (*models.User, error) {
	if m.GetUserFunc != nil {
		return m.GetUserFunc(ctx, userID)
	}
	return nil, errors.New("not implemented")
}

func (m *MockAuthManager) ValidatePassword(hashedPassword, password string) error {
	if m.ValidatePasswordFunc != nil {
		return m.ValidatePasswordFunc(hashedPassword, password)
	}
	return nil
}

func (m *MockAuthManager) HashPassword(password string) (string, error) {
	if m.HashPasswordFunc != nil {
		return m.HashPasswordFunc(password)
	}
	return "hashed_" + password, nil
}

func TestAuthHandler_Signup_Success(t *testing.T) {
	logger := zap.NewNop()

	mockAuth := &MockAuthManager{
		SignupFunc: func(ctx context.Context, email, password, name string) (*models.AuthResult, error) {
			return &models.AuthResult{
				AccessToken: "test-token",
				TokenType:   "Bearer",
				ExpiresIn:   604800,
				User: &models.User{
					ID:    "user-123",
					Email: email,
					Name:  name,
					Role:  models.UserRoleUser,
				},
			}, nil
		},
	}

	handler := NewAuthHandler(mockAuth, logger)
	app := fiber.New()
	app.Post("/auth/signup", handler.Signup)

	reqBody := map[string]string{
		"email":    "test@example.com",
		"password": "password123",
		"name":     "Test User",
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/auth/signup", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("Failed to send request: %v", err)
	}

	if resp.StatusCode != http.StatusCreated {
		t.Errorf("Expected status 201, got %d", resp.StatusCode)
	}

	var result models.AuthResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if result.AccessToken != "test-token" {
		t.Errorf("Expected token 'test-token', got '%s'", result.AccessToken)
	}
}

func TestAuthHandler_Signup_InvalidRequest(t *testing.T) {
	logger := zap.NewNop()
	mockAuth := &MockAuthManager{}

	handler := NewAuthHandler(mockAuth, logger)
	app := fiber.New()
	app.Post("/auth/signup", handler.Signup)

	// Invalid JSON body
	req := httptest.NewRequest(http.MethodPost, "/auth/signup", bytes.NewReader([]byte("invalid json")))
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("Failed to send request: %v", err)
	}

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", resp.StatusCode)
	}
}

func TestAuthHandler_Signup_DuplicateEmail(t *testing.T) {
	logger := zap.NewNop()

	mockAuth := &MockAuthManager{
		SignupFunc: func(ctx context.Context, email, password, name string) (*models.AuthResult, error) {
			return nil, errors.New("email already exists")
		},
	}

	handler := NewAuthHandler(mockAuth, logger)
	app := fiber.New()
	app.Post("/auth/signup", handler.Signup)

	reqBody := map[string]string{
		"email":    "existing@example.com",
		"password": "password123",
		"name":     "Test User",
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/auth/signup", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("Failed to send request: %v", err)
	}

	// Service error should result in conflict status
	if resp.StatusCode != http.StatusConflict {
		t.Errorf("Expected status 409, got %d", resp.StatusCode)
	}
}

func TestAuthHandler_Login_Success(t *testing.T) {
	logger := zap.NewNop()

	mockAuth := &MockAuthManager{
		LoginFunc: func(ctx context.Context, email, password string) (*models.AuthResult, error) {
			return &models.AuthResult{
				AccessToken: "login-token",
				TokenType:   "Bearer",
				ExpiresIn:   604800,
				User: &models.User{
					ID:    "user-456",
					Email: email,
					Role:  models.UserRoleUser,
				},
			}, nil
		},
	}

	handler := NewAuthHandler(mockAuth, logger)
	app := fiber.New()
	app.Post("/auth/login", handler.Login)

	reqBody := map[string]string{
		"email":    "test@example.com",
		"password": "password123",
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("Failed to send request: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}
}

func TestAuthHandler_Login_InvalidCredentials(t *testing.T) {
	logger := zap.NewNop()

	mockAuth := &MockAuthManager{
		LoginFunc: func(ctx context.Context, email, password string) (*models.AuthResult, error) {
			return nil, errors.New("invalid email or password")
		},
	}

	handler := NewAuthHandler(mockAuth, logger)
	app := fiber.New()
	app.Post("/auth/login", handler.Login)

	reqBody := map[string]string{
		"email":    "test@example.com",
		"password": "wrongpassword",
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("Failed to send request: %v", err)
	}

	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("Expected status 401, got %d", resp.StatusCode)
	}
}

func TestAuthHandler_GetUser_Success(t *testing.T) {
	logger := zap.NewNop()

	mockAuth := &MockAuthManager{
		GetUserFunc: func(ctx context.Context, userID string) (*models.User, error) {
			return &models.User{
				ID:    userID,
				Email: "test@example.com",
				Name:  "Test User",
				Role:  models.UserRoleAdmin,
			}, nil
		},
	}

	handler := NewAuthHandler(mockAuth, logger)
	app := fiber.New()
	app.Get("/auth/me", func(c *fiber.Ctx) error {
		c.Locals("user_id", "user-789")
		return handler.GetUser(c)
	})

	req := httptest.NewRequest(http.MethodGet, "/auth/me", nil)

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("Failed to send request: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	var user UserData
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if user.ID != "user-789" {
		t.Errorf("Expected user ID 'user-789', got '%s'", user.ID)
	}
}

func TestAuthHandler_GetUser_NoAuth(t *testing.T) {
	logger := zap.NewNop()
	mockAuth := &MockAuthManager{}

	handler := NewAuthHandler(mockAuth, logger)
	app := fiber.New()
	app.Get("/auth/me", handler.GetUser)

	req := httptest.NewRequest(http.MethodGet, "/auth/me", nil)

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("Failed to send request: %v", err)
	}

	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("Expected status 401, got %d", resp.StatusCode)
	}
}

func TestAuthHandler_GetUser_UserNotFound(t *testing.T) {
	logger := zap.NewNop()

	mockAuth := &MockAuthManager{
		GetUserFunc: func(ctx context.Context, userID string) (*models.User, error) {
			return nil, errors.New("user not found")
		},
	}

	handler := NewAuthHandler(mockAuth, logger)
	app := fiber.New()
	app.Get("/auth/me", func(c *fiber.Ctx) error {
		c.Locals("user_id", "nonexistent-user")
		return handler.GetUser(c)
	})

	req := httptest.NewRequest(http.MethodGet, "/auth/me", nil)

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("Failed to send request: %v", err)
	}

	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("Expected status 404, got %d", resp.StatusCode)
	}
}
