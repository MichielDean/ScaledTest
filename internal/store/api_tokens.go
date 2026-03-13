package store

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/scaledtest/scaledtest/internal/auth"
)

// APITokenStore handles API token lookups for authentication.
type APITokenStore struct {
	pool *pgxpool.Pool
}

// NewAPITokenStore creates a new API token store.
func NewAPITokenStore(pool *pgxpool.Pool) *APITokenStore {
	return &APITokenStore{pool: pool}
}

// Lookup resolves a hashed API token to auth claims by querying the api_tokens
// table joined with users and user_teams. It also updates last_used_at.
func (s *APITokenStore) Lookup(ctx context.Context, tokenHash string) (*auth.Claims, error) {
	var userID, email, role, teamID string
	err := s.pool.QueryRow(ctx,
		`SELECT at.user_id, u.email, ut.role, at.team_id
		 FROM api_tokens at
		 JOIN users u ON u.id = at.user_id
		 JOIN user_teams ut ON ut.user_id = at.user_id AND ut.team_id = at.team_id
		 WHERE at.token_hash = $1`, tokenHash).
		Scan(&userID, &email, &role, &teamID)
	if err != nil {
		return nil, fmt.Errorf("lookup api token: %w", err)
	}

	// Update last_used_at asynchronously — don't block the request
	go func() {
		_, _ = s.pool.Exec(context.Background(),
			`UPDATE api_tokens SET last_used_at = now() WHERE token_hash = $1`, tokenHash)
	}()

	return &auth.Claims{
		UserID: userID,
		Email:  email,
		Role:   role,
		TeamID: teamID,
	}, nil
}

// TokenLookupFunc returns a function compatible with auth.Middleware's tokenLookup parameter.
func (s *APITokenStore) TokenLookupFunc() func(string) (*auth.Claims, error) {
	return func(tokenHash string) (*auth.Claims, error) {
		return s.Lookup(context.Background(), tokenHash)
	}
}
