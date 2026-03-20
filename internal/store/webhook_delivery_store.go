package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrInvalidCursor is returned by ListByWebhook when the given before_id does
// not exist or does not belong to the specified webhook.
var ErrInvalidCursor = errors.New("invalid cursor: before_id not found")

// WebhookDelivery represents a single webhook delivery attempt.
type WebhookDelivery struct {
	ID          string          `json:"id"`
	WebhookID   string          `json:"webhook_id"`
	URL         string          `json:"url"`
	EventType   string          `json:"event_type"`
	Attempt     int             `json:"attempt"`
	StatusCode  int             `json:"status_code"`
	Error       string          `json:"error,omitempty"`
	DurationMs  int             `json:"duration_ms"`
	Payload     json.RawMessage `json:"payload,omitempty"`
	DeliveredAt time.Time       `json:"delivered_at"`
}

// WebhookDeliveryStore handles persistence of webhook delivery records.
type WebhookDeliveryStore struct {
	pool *pgxpool.Pool
}

// NewWebhookDeliveryStore creates a new delivery store.
func NewWebhookDeliveryStore(pool *pgxpool.Pool) *WebhookDeliveryStore {
	return &WebhookDeliveryStore{pool: pool}
}

// Record persists a webhook delivery attempt (implements webhook.DeliveryRecorder).
func (s *WebhookDeliveryStore) Record(ctx context.Context, webhookID, url, eventType string, payload []byte, attempt, statusCode int, errMsg string, durationMs int) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO webhook_deliveries (webhook_id, url, event_type, payload, attempt, status_code, error, duration_ms, delivered_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		webhookID, url, eventType, payload, attempt, statusCode, errMsg, durationMs, time.Now(),
	)
	return err
}

// GetByWebhook returns a single delivery scoped to the given webhook.
func (s *WebhookDeliveryStore) GetByWebhook(ctx context.Context, webhookID, deliveryID string) (*WebhookDelivery, error) {
	var d WebhookDelivery
	err := s.pool.QueryRow(ctx,
		`SELECT id, webhook_id, url, event_type, attempt, status_code, error, duration_ms, payload, delivered_at
		 FROM webhook_deliveries
		 WHERE id = $1 AND webhook_id = $2`,
		deliveryID, webhookID,
	).Scan(&d.ID, &d.WebhookID, &d.URL, &d.EventType, &d.Attempt, &d.StatusCode, &d.Error, &d.DurationMs, &d.Payload, &d.DeliveredAt)
	if err != nil {
		return nil, fmt.Errorf("get delivery: %w", err)
	}
	return &d, nil
}

// ListByWebhook returns the most recent deliveries for a webhook.
// If beforeID is non-empty, only deliveries with a delivered_at earlier than
// the delivery identified by beforeID are returned (cursor-based pagination).
func (s *WebhookDeliveryStore) ListByWebhook(ctx context.Context, webhookID string, limit int, beforeID string) ([]WebhookDelivery, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	var (
		rows pgx.Rows
		err  error
	)
	if beforeID != "" {
		// Look up the cursor row to get its (delivered_at, id) values.
		// This also validates that the cursor belongs to this webhook.
		var cursorTime time.Time
		var cursorRowID string
		lookupErr := s.pool.QueryRow(ctx,
			`SELECT delivered_at, id FROM webhook_deliveries WHERE id = $1 AND webhook_id = $2`,
			beforeID, webhookID,
		).Scan(&cursorTime, &cursorRowID)
		if lookupErr != nil {
			if errors.Is(lookupErr, pgx.ErrNoRows) {
				return nil, ErrInvalidCursor
			}
			return nil, fmt.Errorf("look up cursor: %w", lookupErr)
		}

		rows, err = s.pool.Query(ctx,
			`SELECT id, webhook_id, url, event_type, attempt, status_code, error, duration_ms, payload, delivered_at
			 FROM webhook_deliveries
			 WHERE webhook_id = $1
			   AND (delivered_at, id) < ($2, $3)
			 ORDER BY delivered_at DESC, id DESC
			 LIMIT $4`,
			webhookID, cursorTime, cursorRowID, limit,
		)
	} else {
		rows, err = s.pool.Query(ctx,
			`SELECT id, webhook_id, url, event_type, attempt, status_code, error, duration_ms, payload, delivered_at
			 FROM webhook_deliveries
			 WHERE webhook_id = $1
			 ORDER BY delivered_at DESC, id DESC
			 LIMIT $2`,
			webhookID, limit,
		)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var deliveries []WebhookDelivery
	for rows.Next() {
		var d WebhookDelivery
		if err := rows.Scan(&d.ID, &d.WebhookID, &d.URL, &d.EventType, &d.Attempt, &d.StatusCode, &d.Error, &d.DurationMs, &d.Payload, &d.DeliveredAt); err != nil {
			return nil, err
		}
		deliveries = append(deliveries, d)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if deliveries == nil {
		deliveries = []WebhookDelivery{}
	}

	if len(deliveries) > limit {
		deliveries = deliveries[:limit]
	}

	return deliveries, nil
}
