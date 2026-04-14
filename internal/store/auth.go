package store

import (
	"context"
	"net"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/scaledtest/scaledtest/internal/model"
)

type AuthStore struct {
	pool *pgxpool.Pool
}

func NewAuthStore(pool *pgxpool.Pool) *AuthStore {
	return &AuthStore{pool: pool}
}

func (s *AuthStore) GetUserByEmail(ctx context.Context, email string) (*model.User, error) {
	var u model.User
	err := s.pool.QueryRow(ctx,
		`SELECT id, email, password_hash, display_name, role FROM users WHERE email = $1`,
		email,
	).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.DisplayName, &u.Role)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *AuthStore) GetUserByID(ctx context.Context, id string) (*model.User, error) {
	var u model.User
	err := s.pool.QueryRow(ctx,
		`SELECT id, email, display_name, role FROM users WHERE id = $1`,
		id,
	).Scan(&u.ID, &u.Email, &u.DisplayName, &u.Role)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *AuthStore) EmailExists(ctx context.Context, email string) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)`, email).Scan(&exists)
	return exists, err
}

func (s *AuthStore) CreateUser(ctx context.Context, email, passwordHash, displayName, role string) (userID, returnedRole string, err error) {
	err = s.pool.QueryRow(ctx,
		`INSERT INTO users (email, password_hash, display_name, role)
		 SELECT $1, $2, $3,
		   CASE WHEN NOT EXISTS (SELECT 1 FROM users) THEN 'owner'::text ELSE 'maintainer'::text END
		 RETURNING id, role`,
		email, passwordHash, displayName,
	).Scan(&userID, &returnedRole)
	return
}

func (s *AuthStore) CreateUserWithRole(ctx context.Context, email, passwordHash, displayName, role string) (userID string, err error) {
	err = s.pool.QueryRow(ctx,
		`INSERT INTO users (email, password_hash, display_name, role)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id`,
		email, passwordHash, displayName, role,
	).Scan(&userID)
	return
}

func (s *AuthStore) UpdatePassword(ctx context.Context, userID, passwordHash string) (int64, error) {
	tag, err := s.pool.Exec(ctx,
		`UPDATE users SET password_hash = $1 WHERE id = $2`,
		passwordHash, userID,
	)
	return tag.RowsAffected(), err
}

func (s *AuthStore) UpdateProfile(ctx context.Context, userID, displayName string) (*model.User, error) {
	var u model.User
	err := s.pool.QueryRow(ctx,
		`UPDATE users SET display_name = $1, updated_at = now()
		 WHERE id = $2
		 RETURNING id, email, display_name, role`,
		displayName, userID,
	).Scan(&u.ID, &u.Email, &u.DisplayName, &u.Role)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *AuthStore) GetPrimaryTeamID(ctx context.Context, userID string) (string, error) {
	var teamID string
	err := s.pool.QueryRow(ctx,
		`SELECT team_id FROM user_teams WHERE user_id = $1 ORDER BY joined_at ASC LIMIT 1`,
		userID,
	).Scan(&teamID)
	if err != nil {
		return "", err
	}
	return teamID, nil
}

func (s *AuthStore) CreateSession(ctx context.Context, userID, refreshToken string, userAgent string, ipAddr net.IP, expiresAt time.Time) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO sessions (user_id, refresh_token, user_agent, ip_address, expires_at)
		 VALUES ($1, $2, $3, $4, $5)`,
		userID, refreshToken, userAgent, ipAddr, expiresAt,
	)
	return err
}

type SessionInfo struct {
	ID        string
	UserID    string
	ExpiresAt time.Time
}

func (s *AuthStore) GetSessionByRefreshToken(ctx context.Context, refreshToken string) (*SessionInfo, error) {
	var si SessionInfo
	err := s.pool.QueryRow(ctx,
		`SELECT s.id, s.user_id, s.expires_at
		 FROM sessions s
		 WHERE s.refresh_token = $1`,
		refreshToken,
	).Scan(&si.ID, &si.UserID, &si.ExpiresAt)
	if err != nil {
		return nil, err
	}
	return &si, nil
}

func (s *AuthStore) DeleteSession(ctx context.Context, sessionID string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM sessions WHERE id = $1`, sessionID)
	return err
}

func (s *AuthStore) DeleteSessionByRefreshToken(ctx context.Context, refreshToken string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM sessions WHERE refresh_token = $1`, refreshToken)
	return err
}
