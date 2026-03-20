// Package telegram provides a minimal Telegram Bot API client for sending
// CI health notifications.
package telegram

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const defaultBaseURL = "https://api.telegram.org"

// Client sends messages to a Telegram chat via the Bot API.
type Client struct {
	token      string
	chatID     string
	httpClient *http.Client
	baseURL    string
}

// ClientOption configures a Client.
type ClientOption func(*Client)

// WithBaseURL overrides the Telegram API base URL. Intended for testing.
func WithBaseURL(url string) ClientOption {
	return func(c *Client) { c.baseURL = url }
}

// NewClient returns a Client configured with the given bot token and chat ID.
func NewClient(token, chatID string, opts ...ClientOption) *Client {
	c := &Client{
		token:      token,
		chatID:     chatID,
		httpClient: &http.Client{Timeout: 15 * time.Second},
		baseURL:    defaultBaseURL,
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
}

// SendMessage posts text to the configured Telegram chat using HTML parse mode.
func (c *Client) SendMessage(ctx context.Context, text string) error {
	endpoint := fmt.Sprintf("%s/bot%s/sendMessage", c.baseURL, c.token)
	payload := sendMessageRequest{ChatID: c.chatID, Text: text, ParseMode: "HTML"}
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("telegram: marshal request: %w", err)
	}
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

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("%s <b>%s</b> — %s\n", icon, s.Repo, strings.ToUpper(s.Status)))
	sb.WriteString(fmt.Sprintf("Branch: <code>%s</code>", s.Branch))
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
		sb.WriteString(fmt.Sprintf("\n<a href=\"%s\">View run</a>", s.RunURL))
	}
	return sb.String()
}
