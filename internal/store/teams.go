package store

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/scaledtest/scaledtest/internal/model"
)

// TeamsStore handles team and API token persistence.
type TeamsStore struct {
	pool *pgxpool.Pool
}

// NewTeamsStore creates a new TeamsStore.
func NewTeamsStore(pool *pgxpool.Pool) *TeamsStore {
	return &TeamsStore{pool: pool}
}

// CreateTeam creates a team and adds the user as owner atomically.
func (s *TeamsStore) CreateTeam(ctx context.Context, userID, name string) (*model.Team, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var team model.Team
	err = tx.QueryRow(ctx,
		`INSERT INTO teams (name) VALUES ($1) RETURNING id, name, created_at`,
		name).Scan(&team.ID, &team.Name, &team.CreatedAt)
	if err != nil {
		return nil, err
	}

	_, err = tx.Exec(ctx,
		`INSERT INTO user_teams (user_id, team_id, role) VALUES ($1, $2, 'owner')`,
		userID, team.ID)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &team, nil
}

// GetUserRole returns the user's role in the team, or pgx.ErrNoRows if not a member.
func (s *TeamsStore) GetUserRole(ctx context.Context, userID, teamID string) (string, error) {
	var role string
	err := s.pool.QueryRow(ctx,
		`SELECT role FROM user_teams WHERE user_id = $1 AND team_id = $2`,
		userID, teamID).Scan(&role)
	if err != nil {
		return "", err
	}
	return role, nil
}

// DeleteTeam deletes a team by ID.
func (s *TeamsStore) DeleteTeam(ctx context.Context, teamID string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM teams WHERE id = $1`, teamID)
	return err
}

// CreateToken inserts a new API token and returns the created token.
func (s *TeamsStore) CreateToken(ctx context.Context, teamID, userID, name, tokenHash, prefix string) (*model.APIToken, error) {
	var token model.APIToken
	err := s.pool.QueryRow(ctx,
		`INSERT INTO api_tokens (team_id, user_id, name, token_hash, prefix)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, team_id, user_id, name, prefix, created_at`,
		teamID, userID, name, tokenHash, prefix).
		Scan(&token.ID, &token.TeamID, &token.UserID, &token.Name, &token.Prefix, &token.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &token, nil
}

// DeleteToken deletes a token scoped to a team and returns the number of rows affected.
func (s *TeamsStore) DeleteToken(ctx context.Context, teamID, tokenID string) (int64, error) {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM api_tokens WHERE id = $1 AND team_id = $2`, tokenID, teamID)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

