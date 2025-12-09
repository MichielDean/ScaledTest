package services

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/MichielDean/ScaledTest/backend/internal/models"
	"github.com/MichielDean/ScaledTest/backend/internal/repository"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"
)

// AuthManager defines the interface for authentication operations.
type AuthManager interface {
	// Signup registers a new user and returns an authentication result
	Signup(ctx context.Context, email, password, name string) (*models.AuthResult, error)

	// Login authenticates a user and returns an authentication result
	Login(ctx context.Context, email, password string) (*models.AuthResult, error)

	// GetUser retrieves the current authenticated user by ID
	GetUser(ctx context.Context, userID string) (*models.User, error)

	// ValidatePassword checks if a password matches the stored hash
	ValidatePassword(hashedPassword, password string) error

	// HashPassword creates a bcrypt hash of the password
	HashPassword(password string) (string, error)
}

// AuthService implements AuthManager interface.
type AuthService struct {
	repo            repository.AuthRepository
	settingsService SettingsManager
	logger          *zap.Logger
	jwtSecret       string
}

// NewAuthService creates a new authentication service.
func NewAuthService(
	repo repository.AuthRepository,
	settingsService SettingsManager,
	logger *zap.Logger,
	jwtSecret string,
) *AuthService {
	return &AuthService{
		repo:            repo,
		settingsService: settingsService,
		logger:          logger,
		jwtSecret:       jwtSecret,
	}
}

// Signup registers a new user and returns an authentication result.
func (s *AuthService) Signup(ctx context.Context, email, password, name string) (*models.AuthResult, error) {
	// Validate input
	if email == "" || password == "" {
		return nil, fmt.Errorf("email and password are required")
	}

	// Hash password
	hashedPassword, err := s.HashPassword(password)
	if err != nil {
		s.logger.Error("Failed to hash password", zap.Error(err))
		return nil, fmt.Errorf("internal error")
	}

	// Determine role based on system settings
	role := s.determineUserRole(ctx, email)

	// Create user
	authUser, err := s.repo.CreateUser(ctx, email, name, hashedPassword, role)
	if err != nil {
		if s.isDuplicateEmail(err) {
			return nil, fmt.Errorf("email already exists")
		}
		s.logger.Error("Failed to create user", zap.Error(err))
		return nil, fmt.Errorf("failed to create user")
	}

	// Generate token and create session
	return s.createAuthResult(ctx, authUser)
}

// Login authenticates a user and returns an authentication result.
func (s *AuthService) Login(ctx context.Context, email, password string) (*models.AuthResult, error) {
	// Get user from repository
	authUser, err := s.repo.GetUserByEmail(ctx, email)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			return nil, fmt.Errorf("invalid email or password")
		}
		s.logger.Error("Failed to query user", zap.Error(err))
		return nil, fmt.Errorf("internal error")
	}

	// Verify password
	if err := s.ValidatePassword(authUser.HashedPassword, password); err != nil {
		return nil, fmt.Errorf("invalid email or password")
	}

	// Generate token and create session
	return s.createAuthResult(ctx, authUser)
}

// GetUser retrieves the current authenticated user by ID.
func (s *AuthService) GetUser(ctx context.Context, userID string) (*models.User, error) {
	authUser, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			return nil, fmt.Errorf("user not found")
		}
		s.logger.Error("Failed to query user", zap.Error(err))
		return nil, fmt.Errorf("internal error")
	}

	return &models.User{
		ID:    authUser.ID,
		Email: authUser.Email,
		Name:  authUser.Name,
		Role:  models.UserRole(authUser.Role),
	}, nil
}

// ValidatePassword checks if a password matches the stored hash.
func (s *AuthService) ValidatePassword(hashedPassword, password string) error {
	return bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password))
}

// HashPassword creates a bcrypt hash of the password.
func (s *AuthService) HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

// determineUserRole determines the role for a new user based on settings.
func (s *AuthService) determineUserRole(ctx context.Context, email string) string {
	role := "user"

	if s.settingsService == nil {
		return role
	}

	// Check if this is the first user (becomes admin)
	isFirst, err := s.settingsService.IsFirstUser(ctx)
	if err != nil {
		s.logger.Warn("Failed to check if first user", zap.Error(err))
	} else if isFirst {
		s.logger.Info("First user signup, granting admin role", zap.String("email", email))
		return "admin"
	}

	// Check if this email is in the admin emails list
	isAdmin, err := s.settingsService.IsAdminEmail(ctx, email)
	if err != nil {
		s.logger.Warn("Failed to check admin emails", zap.Error(err))
	} else if isAdmin {
		s.logger.Info("Email in admin list, granting admin role", zap.String("email", email))
		return "admin"
	}

	return role
}

// createAuthResult generates a JWT token and creates the auth response.
func (s *AuthService) createAuthResult(ctx context.Context, authUser *models.AuthUser) (*models.AuthResult, error) {
	expiresIn := int64(7 * 24 * 60 * 60) // 7 days in seconds
	expiresAt := time.Now().Add(time.Duration(expiresIn) * time.Second)

	// Generate JWT token
	token, err := s.generateToken(authUser, expiresAt)
	if err != nil {
		s.logger.Error("Failed to generate token", zap.Error(err))
		return nil, fmt.Errorf("failed to generate token")
	}

	// Store session (non-blocking - don't fail if session storage fails)
	s.storeSession(ctx, authUser.ID, expiresAt)

	return &models.AuthResult{
		AccessToken: token,
		TokenType:   "Bearer",
		ExpiresIn:   expiresIn,
		User: &models.User{
			ID:    authUser.ID,
			Email: authUser.Email,
			Name:  authUser.Name,
			Role:  models.UserRole(authUser.Role),
		},
	}, nil
}

// generateToken creates a JWT token for the user.
func (s *AuthService) generateToken(user *models.AuthUser, expiresAt time.Time) (string, error) {
	claims := jwt.MapClaims{
		"sub":   user.ID,
		"email": user.Email,
		"role":  user.Role,
		"exp":   expiresAt.Unix(),
		"iat":   time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.jwtSecret))
}

// storeSession stores a session in the database.
func (s *AuthService) storeSession(ctx context.Context, userID string, expiresAt time.Time) {
	tokenHash := uuid.New().String() // In production, hash the actual token
	if err := s.repo.CreateSession(ctx, userID, tokenHash, expiresAt); err != nil {
		s.logger.Error("Failed to store session", zap.Error(err))
		// Don't fail the request if session storage fails
	}
}

// isDuplicateEmail checks if an error is a duplicate email constraint violation.
func (s *AuthService) isDuplicateEmail(err error) bool {
	return strings.Contains(err.Error(), "duplicate key") &&
		strings.Contains(err.Error(), "users_email_key")
}

// Compile-time interface check
var _ AuthManager = (*AuthService)(nil)
