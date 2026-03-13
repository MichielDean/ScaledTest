package store

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/scaledtest/scaledtest/internal/model"
)

// WebhookStore handles webhook persistence.
type WebhookStore struct {
	pool *pgxpool.Pool
}

// NewWebhookStore creates a new webhook store.
func NewWebhookStore(pool *pgxpool.Pool) *WebhookStore {
	return &WebhookStore{pool: pool}
}

// List returns all webhooks for a team.
func (s *WebhookStore) List(ctx context.Context, teamID string) ([]model.Webhook, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, team_id, url, events, secret_hash, enabled, created_at, updated_at
		 FROM webhooks WHERE team_id = $1 ORDER BY created_at DESC`, teamID)
	if err != nil {
		return nil, fmt.Errorf("query webhooks: %w", err)
	}
	defer rows.Close()

	var webhooks []model.Webhook
	for rows.Next() {
		var w model.Webhook
		if err := rows.Scan(&w.ID, &w.TeamID, &w.URL, &w.Events, &w.SecretHash, &w.Enabled, &w.CreatedAt, &w.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan webhook: %w", err)
		}
		webhooks = append(webhooks, w)
	}
	return webhooks, rows.Err()
}

// Get returns a single webhook by ID, scoped to team.
func (s *WebhookStore) Get(ctx context.Context, teamID, webhookID string) (*model.Webhook, error) {
	var w model.Webhook
	err := s.pool.QueryRow(ctx,
		`SELECT id, team_id, url, events, secret_hash, enabled, created_at, updated_at
		 FROM webhooks WHERE id = $1 AND team_id = $2`, webhookID, teamID).
		Scan(&w.ID, &w.TeamID, &w.URL, &w.Events, &w.SecretHash, &w.Enabled, &w.CreatedAt, &w.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("get webhook: %w", err)
	}
	return &w, nil
}

// Create inserts a new webhook.
func (s *WebhookStore) Create(ctx context.Context, teamID, url, secretHash string, events []string) (*model.Webhook, error) {
	var w model.Webhook
	err := s.pool.QueryRow(ctx,
		`INSERT INTO webhooks (team_id, url, secret_hash, events)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, team_id, url, events, secret_hash, enabled, created_at, updated_at`,
		teamID, url, secretHash, events).
		Scan(&w.ID, &w.TeamID, &w.URL, &w.Events, &w.SecretHash, &w.Enabled, &w.CreatedAt, &w.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create webhook: %w", err)
	}
	return &w, nil
}

// Update modifies an existing webhook.
func (s *WebhookStore) Update(ctx context.Context, teamID, webhookID, url string, events []string, enabled bool) (*model.Webhook, error) {
	var w model.Webhook
	err := s.pool.QueryRow(ctx,
		`UPDATE webhooks SET url = $3, events = $4, enabled = $5, updated_at = now()
		 WHERE id = $1 AND team_id = $2
		 RETURNING id, team_id, url, events, secret_hash, enabled, created_at, updated_at`,
		webhookID, teamID, url, events, enabled).
		Scan(&w.ID, &w.TeamID, &w.URL, &w.Events, &w.SecretHash, &w.Enabled, &w.CreatedAt, &w.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("update webhook: %w", err)
	}
	return &w, nil
}

// Delete removes a webhook.
func (s *WebhookStore) Delete(ctx context.Context, teamID, webhookID string) error {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM webhooks WHERE id = $1 AND team_id = $2`, webhookID, teamID)
	if err != nil {
		return fmt.Errorf("delete webhook: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("webhook not found")
	}
	return nil
}
