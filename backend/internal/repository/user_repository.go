package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/MichielDean/ScaledTest/backend/internal/database"
	"github.com/MichielDean/ScaledTest/backend/internal/models"
	"github.com/jackc/pgx/v5"
)

// PostgresUserRepository handles persistence for users and profiles using PostgreSQL.
// It implements the UserRepository interface.
type PostgresUserRepository struct {
	db database.Executor
}

// NewPostgresUserRepository creates a new PostgreSQL user repository.
func NewPostgresUserRepository(db database.Executor) *PostgresUserRepository {
	return &PostgresUserRepository{db: db}
}

// GetProfileByID retrieves a user profile by ID
func (r *PostgresUserRepository) GetProfileByID(ctx context.Context, id string) (*models.Profile, error) {
	query := `
		SELECT id, email, name, avatar_url, bio, created_at, updated_at
		FROM public.profiles
		WHERE id = $1
	`

	profile := &models.Profile{}
	err := r.db.QueryRow(ctx, query, id).Scan(
		&profile.ID,
		&profile.Email,
		&profile.Name,
		&profile.AvatarURL,
		&profile.Bio,
		&profile.CreatedAt,
		&profile.UpdatedAt,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) || errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("profile not found: %s", id)
		}
		if strings.Contains(err.Error(), "invalid input syntax for type uuid") {
			return nil, fmt.Errorf("profile not found: %s", id)
		}
		return nil, fmt.Errorf("failed to get profile: %w", err)
	}

	return profile, nil
}

// GetUserWithRole retrieves a user profile with their role from auth.users
func (r *PostgresUserRepository) GetUserWithRole(ctx context.Context, id string) (*models.User, error) {
	query := `
		SELECT p.id, p.email, p.name, 
		       COALESCE(u.raw_app_meta_data->>'role', 'user') as role,
		       COALESCE(u.email_confirmed_at IS NOT NULL, false) as email_verified,
		       p.created_at, p.updated_at
		FROM public.profiles p
		LEFT JOIN auth.users u ON p.id = u.id
		WHERE p.id = $1
	`

	user := &models.User{}
	var roleStr string

	err := r.db.QueryRow(ctx, query, id).Scan(
		&user.ID,
		&user.Email,
		&user.Name,
		&roleStr,
		&user.EmailVerified,
		&user.CreatedAt,
		&user.UpdatedAt,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) || errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("user not found: %s", id)
		}
		if strings.Contains(err.Error(), "invalid input syntax for type uuid") {
			return nil, fmt.Errorf("user not found: %s", id)
		}
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	user.Role = models.UserRole(roleStr)
	return user, nil
}

// UpdateProfile updates a user's profile
func (r *PostgresUserRepository) UpdateProfile(ctx context.Context, profile *models.Profile) error {
	query := `
		UPDATE public.profiles
		SET name = $2, avatar_url = $3, bio = $4, updated_at = NOW()
		WHERE id = $1
	`

	result, err := r.db.Exec(ctx, query,
		profile.ID,
		profile.Name,
		profile.AvatarURL,
		profile.Bio,
	)
	if err != nil {
		return fmt.Errorf("failed to update profile: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("profile not found: %s", profile.ID)
	}

	return nil
}

// ListUsersOptions contains options for listing users
type ListUsersOptions struct {
	Page       int32
	PageSize   int32
	Search     string
	RoleFilter string
}

// ListUsers retrieves users with pagination and filtering
func (r *PostgresUserRepository) ListUsers(ctx context.Context, opts ListUsersOptions) ([]*models.User, int32, error) {
	if opts.Page < 1 {
		opts.Page = 1
	}
	if opts.PageSize < 1 || opts.PageSize > 100 {
		opts.PageSize = 20
	}
	offset := (opts.Page - 1) * opts.PageSize

	// Build query with filters
	query := `
		SELECT p.id, p.email, p.name, 
		       COALESCE(u.raw_app_meta_data->>'role', 'user') as role,
		       COALESCE(u.email_confirmed_at IS NOT NULL, false) as email_verified,
		       p.created_at, p.updated_at
		FROM public.profiles p
		LEFT JOIN auth.users u ON p.id = u.id
		WHERE 1=1
	`
	countQuery := `SELECT COUNT(*) FROM public.profiles p LEFT JOIN auth.users u ON p.id = u.id WHERE 1=1`
	args := []interface{}{}
	argPos := 1

	if opts.Search != "" {
		searchClause := fmt.Sprintf(" AND (p.email ILIKE $%d OR p.name ILIKE $%d)", argPos, argPos)
		query += searchClause
		countQuery += searchClause
		args = append(args, "%"+opts.Search+"%")
		argPos++
	}

	if opts.RoleFilter != "" {
		roleClause := fmt.Sprintf(" AND u.raw_app_meta_data->>'role' = $%d", argPos)
		query += roleClause
		countQuery += roleClause
		args = append(args, opts.RoleFilter)
		argPos++
	}

	// Get total count
	var totalCount int32
	if err := r.db.QueryRow(ctx, countQuery, args...).Scan(&totalCount); err != nil {
		return nil, 0, fmt.Errorf("failed to count users: %w", err)
	}

	// Add pagination
	query += fmt.Sprintf(" ORDER BY p.created_at DESC LIMIT $%d OFFSET $%d", argPos, argPos+1)
	args = append(args, opts.PageSize, offset)

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list users: %w", err)
	}
	defer rows.Close()

	var users []*models.User
	for rows.Next() {
		user := &models.User{}
		var roleStr string

		err := rows.Scan(
			&user.ID,
			&user.Email,
			&user.Name,
			&roleStr,
			&user.EmailVerified,
			&user.CreatedAt,
			&user.UpdatedAt,
		)
		if err != nil {
			continue
		}

		user.Role = models.UserRole(roleStr)
		users = append(users, user)
	}

	return users, totalCount, nil
}
