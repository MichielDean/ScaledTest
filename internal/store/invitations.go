package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/scaledtest/scaledtest/internal/model"
)

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
