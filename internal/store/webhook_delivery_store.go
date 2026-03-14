package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// WebhookDelivery represents a single webhook delivery attempt.
type WebhookDelivery struct {
	ID          string    `json:"id"`
	WebhookID   string    `json:"webhook_id"`
	URL         string    `json:"url"`
	EventType   string    `json:"event_type"`
	Attempt     int       `json:"attempt"`
	StatusCode  int       `json:"status_code"`
	Error       string    `json:"error,omitempty"`
	DurationMs  int       `json:"duration_ms"`
	DeliveredAt time.Time `json:"delivered_at"`
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
func (s *WebhookDeliveryStore) Record(ctx context.Context, webhookID, url, eventType string, attempt, statusCode int, errMsg string, durationMs int) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO webhook_deliveries (webhook_id, url, event_type, attempt, status_code, error, duration_ms, delivered_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		webhookID, url, eventType, attempt, statusCode, errMsg, durationMs, time.Now(),
	)
	return err
}

// ListByWebhook returns the most recent deliveries for a webhook.
func (s *WebhookDeliveryStore) ListByWebhook(ctx context.Context, webhookID string, limit int) ([]WebhookDelivery, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	rows, err := s.pool.Query(ctx,
		`SELECT id, webhook_id, url, event_type, attempt, status_code, error, duration_ms, delivered_at
		 FROM webhook_deliveries
		 WHERE webhook_id = $1
		 ORDER BY delivered_at DESC
		 LIMIT $2`,
		webhookID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var deliveries []WebhookDelivery
	for rows.Next() {
		var d WebhookDelivery
		if err := rows.Scan(&d.ID, &d.WebhookID, &d.URL, &d.EventType, &d.Attempt, &d.StatusCode, &d.Error, &d.DurationMs, &d.DeliveredAt); err != nil {
			return nil, err
		}
		deliveries = append(deliveries, d)
	}
	if deliveries == nil {
		deliveries = []WebhookDelivery{}
	}
	return deliveries, rows.Err()
}
