package store

import (
	"context"
	"net"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type OAuthStore struct {
	pool *pgxpool.Pool
}

func NewOAuthStore(pool *pgxpool.Pool) *OAuthStore {
	return &OAuthStore{pool: pool}
}

type OAuthLinkedUser struct {
	ID          string
	Email       string
	DisplayName string
	Role        string
}

func (s *OAuthStore) FindLinkedUser(ctx context.Context, provider, providerID string) (*OAuthLinkedUser, error) {
	var u OAuthLinkedUser
	err := s.pool.QueryRow(ctx,
		`SELECT u.id, u.email, u.display_name, u.role
		 FROM oauth_accounts oa
		 JOIN users u ON u.id = oa.user_id
		 WHERE oa.provider = $1 AND oa.provider_id = $2`,
		provider, providerID,
	).Scan(&u.ID, &u.Email, &u.DisplayName, &u.Role)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *OAuthStore) FindUserByEmail(ctx context.Context, email string) (*OAuthLinkedUser, error) {
	var u OAuthLinkedUser
	err := s.pool.QueryRow(ctx,
		`SELECT id, email, display_name, role FROM users WHERE email = $1`, email,
	).Scan(&u.ID, &u.Email, &u.DisplayName, &u.Role)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *OAuthStore) CreateUser(ctx context.Context, email, displayName string) (string, string, error) {
	var userID, role string
	err := s.pool.QueryRow(ctx,
		`INSERT INTO users (email, password_hash, display_name)
		 VALUES ($1, '', $2)
		 RETURNING id, role`,
		email, displayName,
	).Scan(&userID, &role)
	if err != nil {
		return "", "", err
	}
	return userID, role, nil
}

func (s *OAuthStore) LinkAccount(ctx context.Context, userID, provider, providerID, accessToken, refreshToken string) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO oauth_accounts (user_id, provider, provider_id, access_token, refresh_token)
		 VALUES ($1, $2, $3, $4, $5)`,
		userID, provider, providerID, accessToken, refreshToken,
	)
	return err
}

func (s *OAuthStore) UpdateTokens(ctx context.Context, accessToken, refreshToken, provider, providerID string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE oauth_accounts SET access_token = $1, refresh_token = $2
		 WHERE provider = $3 AND provider_id = $4`,
		accessToken, refreshToken, provider, providerID,
	)
	return err
}

func (s *OAuthStore) CreateSession(ctx context.Context, userID, refreshToken, userAgent string, ipAddr net.IP, expiresAt time.Time) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO sessions (user_id, refresh_token, user_agent, ip_address, expires_at)
		 VALUES ($1, $2, $3, $4, $5)`,
		userID, refreshToken, userAgent, ipAddr, expiresAt,
	)
	return err
}

func IsNoRows(err error) bool {
	return err == pgx.ErrNoRows
}
