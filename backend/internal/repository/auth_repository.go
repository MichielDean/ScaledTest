package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/MichielDean/ScaledTest/backend/internal/database"
	"github.com/MichielDean/ScaledTest/backend/internal/models"
	"github.com/jackc/pgx/v5"
)

// AuthRepository defines the interface for authentication data access operations.
type AuthRepository interface {
	// GetUserByEmail retrieves a user by email (for login)
	GetUserByEmail(ctx context.Context, email string) (*models.AuthUser, error)

	// GetUserByID retrieves a user by ID
	GetUserByID(ctx context.Context, id string) (*models.AuthUser, error)

	// CreateUser creates a new user with the given credentials
	CreateUser(ctx context.Context, email, name, hashedPassword, role string) (*models.AuthUser, error)

	// CreateSession stores a new session for a user
	CreateSession(ctx context.Context, userID, tokenHash string, expiresAt time.Time) error

	// EmailExists checks if an email is already registered
	EmailExists(ctx context.Context, email string) (bool, error)
}

// PostgresAuthRepository implements AuthRepository using PostgreSQL.
type PostgresAuthRepository struct {
	db database.Executor
}

// NewPostgresAuthRepository creates a new PostgreSQL auth repository.
func NewPostgresAuthRepository(db database.Executor) *PostgresAuthRepository {
	return &PostgresAuthRepository{db: db}
}

// GetUserByEmail retrieves a user by email for login.
func (r *PostgresAuthRepository) GetUserByEmail(ctx context.Context, email string) (*models.AuthUser, error) {
	var user models.AuthUser
	err := r.db.QueryRow(ctx, `
		SELECT id, email, name, role, encrypted_password
		FROM auth.users
		WHERE email = $1
	`, email).Scan(&user.ID, &user.Email, &user.Name, &user.Role, &user.HashedPassword)

	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("user not found")
		}
		return nil, fmt.Errorf("failed to query user: %w", err)
	}

	return &user, nil
}

// GetUserByID retrieves a user by ID.
func (r *PostgresAuthRepository) GetUserByID(ctx context.Context, id string) (*models.AuthUser, error) {
	var user models.AuthUser
	err := r.db.QueryRow(ctx, `
		SELECT id, email, name, role, encrypted_password
		FROM auth.users
		WHERE id = $1
	`, id).Scan(&user.ID, &user.Email, &user.Name, &user.Role, &user.HashedPassword)

	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("user not found")
		}
		return nil, fmt.Errorf("failed to query user: %w", err)
	}

	return &user, nil
}

// CreateUser creates a new user with the given credentials.
func (r *PostgresAuthRepository) CreateUser(ctx context.Context, email, name, hashedPassword, role string) (*models.AuthUser, error) {
	var userID string
	err := r.db.QueryRow(ctx, `
		INSERT INTO auth.users (email, encrypted_password, name, role)
		VALUES ($1, $2, $3, $4)
		RETURNING id
	`, email, hashedPassword, name, role).Scan(&userID)

	if err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	return &models.AuthUser{
		ID:    userID,
		Email: email,
		Name:  name,
		Role:  role,
	}, nil
}

// CreateSession stores a new session for a user.
func (r *PostgresAuthRepository) CreateSession(ctx context.Context, userID, tokenHash string, expiresAt time.Time) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO auth.sessions (user_id, token_hash, expires_at)
		VALUES ($1, $2, $3)
	`, userID, tokenHash, expiresAt)

	if err != nil {
		return fmt.Errorf("failed to create session: %w", err)
	}

	return nil
}

// EmailExists checks if an email is already registered.
func (r *PostgresAuthRepository) EmailExists(ctx context.Context, email string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM auth.users WHERE email = $1)
	`, email).Scan(&exists)

	if err != nil {
		return false, fmt.Errorf("failed to check email: %w", err)
	}

	return exists, nil
}

// Compile-time interface check
var _ AuthRepository = (*PostgresAuthRepository)(nil)
