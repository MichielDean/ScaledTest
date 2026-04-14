package store

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/scaledtest/scaledtest/internal/model"
)

// TeamWithRole is a team paired with the current user's role in that team.
type TeamWithRole struct {
	model.Team
	Role string `json:"role"`
}

// TeamsStore handles team and API token persistence.
type TeamsStore struct {
	pool *pgxpool.Pool
}

// NewTeamsStore creates a new TeamsStore.
func NewTeamsStore(pool *pgxpool.Pool) *TeamsStore {
	return &TeamsStore{pool: pool}
}

// ListTeams returns all teams for a user with their role in each team.
func (s *TeamsStore) ListTeams(ctx context.Context, userID string) ([]TeamWithRole, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT t.id, t.name, t.created_at, ut.role
		 FROM teams t
		 JOIN user_teams ut ON ut.team_id = t.id
		 WHERE ut.user_id = $1
		 ORDER BY t.name`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var teams []TeamWithRole
	for rows.Next() {
		var t TeamWithRole
		if err := rows.Scan(&t.ID, &t.Name, &t.CreatedAt, &t.Role); err != nil {
			return nil, err
		}
		teams = append(teams, t)
	}
	return teams, nil
}

// GetTeam returns a team with the user's role, or pgx.ErrNoRows if not found or not a member.
func (s *TeamsStore) GetTeam(ctx context.Context, teamID, userID string) (*TeamWithRole, error) {
	var t TeamWithRole
	err := s.pool.QueryRow(ctx,
		`SELECT t.id, t.name, t.created_at, ut.role
		 FROM teams t
		 JOIN user_teams ut ON ut.team_id = t.id
		 WHERE t.id = $1 AND ut.user_id = $2`, teamID, userID).
		Scan(&t.ID, &t.Name, &t.CreatedAt, &t.Role)
	if err != nil {
		return nil, err
	}
	return &t, nil
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

// ListTokens returns all API tokens for a team.
func (s *TeamsStore) ListTokens(ctx context.Context, teamID string) ([]model.APIToken, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, team_id, user_id, name, prefix, last_used_at, created_at
		 FROM api_tokens
		 WHERE team_id = $1
		 ORDER BY created_at DESC`, teamID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tokens []model.APIToken
	for rows.Next() {
		var t model.APIToken
		if err := rows.Scan(&t.ID, &t.TeamID, &t.UserID, &t.Name, &t.Prefix, &t.LastUsedAt, &t.CreatedAt); err != nil {
			return nil, err
		}
		tokens = append(tokens, t)
	}
	return tokens, nil
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
