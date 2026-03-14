package webhook

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/rs/zerolog/log"
)

// EventType identifies the type of webhook event.
type EventType string

const (
	EventReportSubmitted    EventType = "report.submitted"
	EventGateFailed         EventType = "gate.failed"
	EventExecutionCompleted EventType = "execution.completed"
	EventExecutionFailed    EventType = "execution.failed"
)

// Payload is the webhook delivery payload.
type Payload struct {
	Event     EventType   `json:"event"`
	Timestamp time.Time   `json:"timestamp"`
	Data      interface{} `json:"data"`
}

// Delivery records a webhook delivery attempt.
type Delivery struct {
	WebhookID  string
	URL        string
	Payload    []byte
	StatusCode int
	Error      string
	Attempt    int
	CreatedAt  time.Time
}

// Dispatcher sends webhook payloads to registered URLs.
type Dispatcher struct {
	client     *http.Client
	maxRetries int
}

// NewDispatcher creates a webhook dispatcher.
func NewDispatcher() *Dispatcher {
	return &Dispatcher{
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
		maxRetries: 3,
	}
}

// Send delivers a webhook payload to the given URL with HMAC-SHA256 signing.
// It retries with exponential backoff on failure.
func (d *Dispatcher) Send(ctx context.Context, url, secret string, payload Payload) (*Delivery, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal payload: %w", err)
	}

	signature := Sign(body, secret)

	var lastErr error
	for attempt := 1; attempt <= d.maxRetries; attempt++ {
		delivery := &Delivery{
			URL:       url,
			Payload:   body,
			Attempt:   attempt,
			CreatedAt: time.Now(),
		}

		req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
		if err != nil {
			return delivery, fmt.Errorf("create request: %w", err)
		}

		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-ScaledTest-Signature", signature)
		req.Header.Set("X-ScaledTest-Event", string(payload.Event))
		req.Header.Set("User-Agent", "ScaledTest-Webhook/1.0")

		resp, err := d.client.Do(req)
		if err != nil {
			delivery.Error = err.Error()
			lastErr = err
			log.Warn().
				Err(err).
				Int("attempt", attempt).
				Str("url", url).
				Msg("webhook delivery failed")

			if attempt < d.maxRetries {
				backoff := time.Duration(attempt*attempt) * time.Second
				select {
				case <-ctx.Done():
					return delivery, ctx.Err()
				case <-time.After(backoff):
				}
			}
			continue
		}

		delivery.StatusCode = resp.StatusCode
		resp.Body.Close()

		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			return delivery, nil
		}

		delivery.Error = fmt.Sprintf("HTTP %d", resp.StatusCode)
		lastErr = fmt.Errorf("webhook returned %d", resp.StatusCode)

		if resp.StatusCode >= 400 && resp.StatusCode < 500 {
			// Client error — don't retry
			return delivery, lastErr
		}

		if attempt < d.maxRetries {
			backoff := time.Duration(attempt*attempt) * time.Second
			select {
			case <-ctx.Done():
				return delivery, ctx.Err()
			case <-time.After(backoff):
			}
		}
	}

	return nil, fmt.Errorf("webhook delivery failed after %d attempts: %w", d.maxRetries, lastErr)
}

// Sign computes the HMAC-SHA256 signature for a payload.
func Sign(payload []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}

// Verify checks that a signature matches the expected HMAC-SHA256 of the payload.
func Verify(payload []byte, secret, signature string) bool {
	expected := Sign(payload, secret)
	return hmac.Equal([]byte(expected), []byte(signature))
}

// WebhookLister retrieves webhooks matching a team and event type.
type WebhookLister interface {
	ListByTeamAndEvent(ctx context.Context, teamID string, event string) ([]WebhookRecord, error)
}

// DeliveryRecorder persists webhook delivery results.
type DeliveryRecorder interface {
	Record(ctx context.Context, webhookID, url, eventType string, attempt, statusCode int, errMsg string, durationMs int) error
}

// WebhookRecord is the minimal webhook data needed for dispatch.
type WebhookRecord struct {
	ID         string
	URL        string
	SecretHash string
}

// Notifier looks up matching webhooks and dispatches payloads asynchronously.
type Notifier struct {
	lister   WebhookLister
	dispatcher *Dispatcher
	recorder DeliveryRecorder // optional; nil means no persistence
}

// NewNotifier creates a Notifier. Returns nil if lister or dispatcher is nil.
func NewNotifier(lister WebhookLister, dispatcher *Dispatcher) *Notifier {
	if lister == nil || dispatcher == nil {
		return nil
	}
	return &Notifier{lister: lister, dispatcher: dispatcher}
}

// SetRecorder sets the delivery recorder for persisting delivery results.
func (n *Notifier) SetRecorder(r DeliveryRecorder) {
	if n != nil {
		n.recorder = r
	}
}

// Notify fires webhooks for the given event asynchronously (fire-and-forget).
// Safe to call on a nil Notifier.
func (n *Notifier) Notify(teamID string, event EventType, data interface{}) {
	if n == nil {
		return
	}

	go func() {
		// Use a background context so delivery outlives the HTTP request.
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		hooks, err := n.lister.ListByTeamAndEvent(ctx, teamID, string(event))
		if err != nil {
			log.Error().Err(err).
				Str("team_id", teamID).
				Str("event", string(event)).
				Msg("webhook: failed to list matching webhooks")
			return
		}

		payload := Payload{
			Event:     event,
			Timestamp: time.Now(),
			Data:      data,
		}

		for _, hook := range hooks {
			h := hook // capture
			// Each delivery gets its own timeout context.
			dCtx, dCancel := context.WithTimeout(context.Background(), 30*time.Second)
			go func() {
				defer dCancel()
				start := time.Now()
				delivery, err := n.dispatcher.Send(dCtx, h.URL, h.SecretHash, payload)
				durationMs := int(time.Since(start).Milliseconds())
				if err != nil {
					log.Warn().Err(err).
						Str("webhook_id", h.ID).
						Str("url", h.URL).
						Str("event", string(event)).
						Msg("webhook: delivery failed")
				}

				// Persist delivery result if recorder is configured.
				if n.recorder != nil && delivery != nil {
					_ = n.recorder.Record(dCtx, h.ID, h.URL, string(event),
						delivery.Attempt, delivery.StatusCode, delivery.Error, durationMs)
				}
			}()
		}
	}()
}
