package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/scaledtest/scaledtest/internal/model"
)

// ErrOwnerAlreadyExists is returned when an AcceptInvitation call would create
// a second owner, violating the idx_users_single_owner unique partial index.
var ErrOwnerAlreadyExists = errors.New("owner role already claimed")

// ErrUserExists is returned when an AcceptInvitation call finds the user
// already exists. The caller must verify the user's identity (e.g. password)
// before granting team access.
var ErrUserExists = errors.New("user already exists")

// InvitationStore handles invitation persistence.
type InvitationStore struct {
	pool *pgxpool.Pool
}

// NewInvitationStore creates a new invitation store.
func NewInvitationStore(pool *pgxpool.Pool) *InvitationStore {
	return &InvitationStore{pool: pool}
}

// Create stores a new invitation.
func (s *InvitationStore) Create(ctx context.Context, teamID, email, role, tokenHash string, invitedBy *string, expiresAt time.Time) (*model.Invitation, error) {
	var inv model.Invitation
	err := s.pool.QueryRow(ctx,
		`INSERT INTO invitations (team_id, email, role, token_hash, invited_by, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, team_id, email, role, invited_by, accepted_at, expires_at, created_at`,
		teamID, email, role, tokenHash, invitedBy, expiresAt,
	).Scan(&inv.ID, &inv.TeamID, &inv.Email, &inv.Role, &inv.InvitedBy, &inv.AcceptedAt, &inv.ExpiresAt, &inv.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create invitation: %w", err)
	}
	return &inv, nil
}

// ListByTeam returns all invitations for a team.
func (s *InvitationStore) ListByTeam(ctx context.Context, teamID string) ([]model.Invitation, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, team_id, email, role, invited_by, accepted_at, expires_at, created_at
		 FROM invitations WHERE team_id = $1 ORDER BY created_at DESC`, teamID)
	if err != nil {
		return nil, fmt.Errorf("list invitations: %w", err)
	}
	defer rows.Close()

	var invitations []model.Invitation
	for rows.Next() {
		var inv model.Invitation
		if err := rows.Scan(&inv.ID, &inv.TeamID, &inv.Email, &inv.Role, &inv.InvitedBy, &inv.AcceptedAt, &inv.ExpiresAt, &inv.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan invitation: %w", err)
		}
		invitations = append(invitations, inv)
	}
	return invitations, rows.Err()
}

// GetByTokenHash looks up an invitation by its token hash.
func (s *InvitationStore) GetByTokenHash(ctx context.Context, tokenHash string) (*model.Invitation, error) {
	var inv model.Invitation
	err := s.pool.QueryRow(ctx,
		`SELECT id, team_id, email, role, invited_by, accepted_at, expires_at, created_at
		 FROM invitations WHERE token_hash = $1`, tokenHash,
	).Scan(&inv.ID, &inv.TeamID, &inv.Email, &inv.Role, &inv.InvitedBy, &inv.AcceptedAt, &inv.ExpiresAt, &inv.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get invitation: %w", err)
	}
	return &inv, nil
}

// Accept marks an invitation as accepted.
func (s *InvitationStore) Accept(ctx context.Context, id string) error {
	tag, err := s.pool.Exec(ctx,
		`UPDATE invitations SET accepted_at = now() WHERE id = $1 AND accepted_at IS NULL`, id)
	if err != nil {
		return fmt.Errorf("accept invitation: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("invitation not found or already accepted")
	}
	return nil
}

// AcceptInvitation atomically creates a new user (with the provided password hash),
// adds their team membership, and marks the invitation as accepted. If the user
// already exists, it returns ErrUserExists — the caller must verify the existing
// user's password before granting team access.
func (s *InvitationStore) AcceptInvitation(ctx context.Context, invID, email, passwordHash, displayName, role, teamID string) (string, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	var userID string
	err = tx.QueryRow(ctx,
		`SELECT id FROM users WHERE email = $1`, email,
	).Scan(&userID)
	if err == nil {
		return "", ErrUserExists
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", fmt.Errorf("check existing user: %w", err)
	}

	err = tx.QueryRow(ctx,
		`INSERT INTO users (email, password_hash, display_name, role)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id`,
		email, passwordHash, displayName, role,
	).Scan(&userID)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			switch pgErr.ConstraintName {
			case "idx_users_single_owner":
				return "", ErrOwnerAlreadyExists
			case "users_email_key":
				return "", ErrUserExists
			}
		}
		return "", fmt.Errorf("insert user: %w", err)
	}

	_, err = tx.Exec(ctx,
		`INSERT INTO user_teams (user_id, team_id, role)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (user_id, team_id) DO UPDATE SET role = $3`,
		userID, teamID, role,
	)
	if err != nil {
		return "", fmt.Errorf("upsert team membership: %w", err)
	}

	_, err = tx.Exec(ctx,
		`UPDATE invitations SET accepted_at = now() WHERE id = $1`, invID)
	if err != nil {
		return "", fmt.Errorf("mark invitation accepted: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("commit: %w", err)
	}
	return userID, nil
}

// AddTeamMembership adds team membership for an existing user and marks the
// invitation as accepted. The caller is responsible for verifying the user's
// identity (e.g. password check) before calling this.
func (s *InvitationStore) AddTeamMembership(ctx context.Context, invID, userID, role, teamID string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx,
		`INSERT INTO user_teams (user_id, team_id, role)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (user_id, team_id) DO UPDATE SET role = $3`,
		userID, teamID, role,
	)
	if err != nil {
		return fmt.Errorf("upsert team membership: %w", err)
	}

	_, err = tx.Exec(ctx,
		`UPDATE invitations SET accepted_at = now() WHERE id = $1`, invID)
	if err != nil {
		return fmt.Errorf("mark invitation accepted: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// Delete removes an invitation (revoke).
func (s *InvitationStore) Delete(ctx context.Context, teamID, id string) error {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM invitations WHERE id = $1 AND team_id = $2`, id, teamID)
	if err != nil {
		return fmt.Errorf("delete invitation: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("invitation not found")
	}
	return nil
}

// GetTeamName returns the name of the team with the given ID.
func (s *InvitationStore) GetTeamName(ctx context.Context, teamID string) (string, error) {
	var name string
	err := s.pool.QueryRow(ctx, `SELECT name FROM teams WHERE id = $1`, teamID).Scan(&name)
	if err != nil {
		return "", fmt.Errorf("get team name: %w", err)
	}
	return name, nil
}

// GetUserByEmail looks up a user by email. Returns the user (including
// PasswordHash) so the caller can verify credentials.
func (s *InvitationStore) GetUserByEmail(ctx context.Context, email string) (*model.User, error) {
	var u model.User
	err := s.pool.QueryRow(ctx,
		`SELECT id, email, password_hash, display_name, role, created_at, updated_at
		 FROM users WHERE email = $1`, email,
	).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.DisplayName, &u.Role, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("get user by email: %w", err)
	}
	return &u, nil
}
