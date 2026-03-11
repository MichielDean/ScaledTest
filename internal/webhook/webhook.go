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
	EventReportCreated        EventType = "report.created"
	EventExecutionCompleted   EventType = "execution.completed"
	EventQualityGateEvaluated EventType = "quality_gate.evaluated"
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
