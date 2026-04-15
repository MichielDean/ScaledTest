// Package telegram provides a minimal Telegram Bot API client for sending
// CI health notifications.
package telegram

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"html"
	"net/http"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
)

const defaultBaseURL = "https://api.telegram.org"
const defaultTelegramRetries = 3

// Client sends messages to a Telegram chat via the Bot API.
type Client struct {
	token      string
	chatID     string
	httpClient *http.Client
	baseURL    string
	maxRetries int
}

// ClientOption configures a Client.
type ClientOption func(*Client)

// WithBaseURL overrides the Telegram API base URL. Intended for testing.
func WithBaseURL(url string) ClientOption {
	return func(c *Client) { c.baseURL = url }
}

// WithMaxRetries sets the number of retry attempts for transient errors.
func WithMaxRetries(n int) ClientOption {
	return func(c *Client) { c.maxRetries = n }
}

// NewClient returns a Client configured with the given bot token and chat ID.
func NewClient(token, chatID string, opts ...ClientOption) *Client {
	c := &Client{
		token:      token,
		chatID:     chatID,
		httpClient: &http.Client{Timeout: 15 * time.Second},
		baseURL:    defaultBaseURL,
		maxRetries: defaultTelegramRetries,
	}
	for _, o := range opts {
		o(c)
	}
	return c
}

type sendMessageRequest struct {
	ChatID    string `json:"chat_id"`
	Text      string `json:"text"`
	ParseMode string `json:"parse_mode"`
}

type apiResponse struct {
	OK          bool   `json:"ok"`
	Description string `json:"description,omitempty"`
	ErrorCode   int    `json:"error_code,omitempty"`
	Parameters  struct {
		RetryAfter int `json:"retry_after,omitempty"`
	} `json:"parameters,omitempty"`
}

// isRetriableTelegramError returns true for HTTP 429 and 5xx status codes.
func isRetriableTelegramError(statusCode int) bool {
	return statusCode == http.StatusTooManyRequests || statusCode >= 500
}

// SendMessage posts text to the configured Telegram chat using HTML parse mode.
// It retries on 429 (rate limited) and 5xx (server error) responses with
// exponential backoff, respecting the Retry-After header on 429 responses.
func (c *Client) SendMessage(ctx context.Context, text string) error {
	endpoint := fmt.Sprintf("%s/bot%s/sendMessage", c.baseURL, c.token)
	payload := sendMessageRequest{ChatID: c.chatID, Text: text, ParseMode: "HTML"}
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("telegram: marshal request: %w", err)
	}

	var lastErr error
	for attempt := 0; attempt <= c.maxRetries; attempt++ {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		lastErr = c.doSend(ctx, endpoint, data)
		if lastErr == nil {
			return nil
		}

		re, ok := lastErr.(*telegramError)
		if !ok || !isRetriableTelegramError(re.statusCode) {
			return lastErr
		}

		if attempt < c.maxRetries {
			backoff := time.Duration(1<<uint(attempt)) * time.Second
			if re.retryAfter > 0 {
				backoff = time.Duration(re.retryAfter) * time.Second
			}
			log.Warn().Err(lastErr).
				Int("attempt", attempt+1).
				Dur("backoff", backoff).
				Msg("telegram: retrying SendMessage")

			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(backoff):
			}
		}
	}
	return lastErr
}

// telegramError represents a Telegram API error with status code and optional retry_after.
type telegramError struct {
	statusCode int
	desc       string
	retryAfter int
}

func (e *telegramError) Error() string {
	return fmt.Sprintf("telegram: API error (status %d): %s", e.statusCode, e.desc)
}

// doSend executes a single HTTP POST to the Telegram sendMessage API.
func (c *Client) doSend(ctx context.Context, endpoint string, data []byte) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("telegram: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("telegram: send request: %w", err)
	}
	defer resp.Body.Close()

	var result apiResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("telegram: decode response: %w", err)
	}

	if resp.StatusCode == http.StatusTooManyRequests {
		return &telegramError{
			statusCode: resp.StatusCode,
			desc:       result.Description,
			retryAfter: result.Parameters.RetryAfter,
		}
	}

	if resp.StatusCode >= 500 {
		return &telegramError{
			statusCode: resp.StatusCode,
			desc:       result.Description,
		}
	}

	if !result.OK {
		return fmt.Errorf("telegram: API error: %s", result.Description)
	}
	return nil
}

// CISummary holds the data for a CI run notification.
type CISummary struct {
	Repo      string
	Branch    string
	CommitSHA string
	CommitMsg string
	Passed    int
	Failed    int
	Skipped   int
	Total     int
	RunURL    string
	// Status is "passing" or "failing".
	Status string
}

// FormatMessage returns an HTML-formatted message suitable for a Telegram chat.
func FormatMessage(s CISummary) string {
	icon := "✅"
	if s.Status == "failing" {
		icon = "❌"
	}

	shortSHA := s.CommitSHA
	if len(shortSHA) > 7 {
		shortSHA = shortSHA[:7]
	}

	// First line only, truncated to 80 chars.
	commitLine := strings.SplitN(s.CommitMsg, "\n", 2)[0]
	if len(commitLine) > 80 {
		commitLine = commitLine[:77] + "..."
	}

	// HTML-escape all external (attacker-controlled) fields before embedding
	// in an HTML-mode Telegram message. Raw '<', '>', or '&' would produce
	// invalid HTML that Telegram rejects, silently dropping the notification.
	repo := html.EscapeString(s.Repo)
	branch := html.EscapeString(s.Branch)
	commitLine = html.EscapeString(commitLine)

	escapedRunURL := html.EscapeString(s.RunURL)

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("%s <b>%s</b> — %s\n", icon, repo, strings.ToUpper(s.Status)))
	sb.WriteString(fmt.Sprintf("Branch: <code>%s</code>", branch))
	if shortSHA != "" {
		sb.WriteString(fmt.Sprintf("  Commit: <code>%s</code>", shortSHA))
	}
	sb.WriteString("\n")
	if commitLine != "" {
		sb.WriteString(fmt.Sprintf("💬 %s\n", commitLine))
	}
	sb.WriteString("\n")

	sb.WriteString(fmt.Sprintf("🧪 Tests: %d passed", s.Passed))
	if s.Failed > 0 {
		sb.WriteString(fmt.Sprintf(", %d failed", s.Failed))
	}
	if s.Skipped > 0 {
		sb.WriteString(fmt.Sprintf(", %d skipped", s.Skipped))
	}
	sb.WriteString(fmt.Sprintf(" / %d total\n", s.Total))

	if s.RunURL != "" {
		sb.WriteString(fmt.Sprintf("\n<a href=\"%s\">View run</a>", escapedRunURL))
	}
	return sb.String()
}
