package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/scaledtest/scaledtest/internal/model"
)

// ErrOwnerAlreadyExists is returned when an AcceptInvitation call would create
// a second owner, violating the idx_users_single_owner unique partial index.
var ErrOwnerAlreadyExists = errors.New("owner role already claimed")

// InvitationStore handles invitation persistence.
type InvitationStore struct {
	pool *pgxpool.Pool
}

// NewInvitationStore creates a new invitation store.
func NewInvitationStore(pool *pgxpool.Pool) *InvitationStore {
	return &InvitationStore{pool: pool}
}

// Create stores a new invitation.
func (s *InvitationStore) Create(ctx context.Context, teamID, email, role, tokenHash, invitedBy string, expiresAt time.Time) (*model.Invitation, error) {
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

// AcceptInvitation atomically creates or updates the user, adds team membership,
// and marks the invitation as accepted. Returns the user ID of the created/updated user.
func (s *InvitationStore) AcceptInvitation(ctx context.Context, invID, email, passwordHash, displayName, role, teamID string) (string, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	var userID string
	err = tx.QueryRow(ctx,
		`INSERT INTO users (email, password_hash, display_name, role)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (email) DO UPDATE SET updated_at = now()
		 RETURNING id`,
		email, passwordHash, displayName, role,
	).Scan(&userID)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == "idx_users_single_owner" {
			return "", ErrOwnerAlreadyExists
		}
		return "", fmt.Errorf("upsert user: %w", err)
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
