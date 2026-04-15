package github

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"time"

	"github.com/rs/zerolog/log"
)

const defaultMaxRetries = 3

// StatusPoster posts a GitHub commit status.
type StatusPoster interface {
	PostStatus(ctx context.Context, owner, repo, sha, state, description, statusContext, targetURL string) error
}

// Client implements StatusPoster using the GitHub REST API.
type Client struct {
	token      string
	HTTPClient *http.Client
	APIURL     string
	maxRetries int
}

// New creates a GitHub Client with the given token.
// Returns nil when token is empty (GitHub integration disabled).
func New(token string) *Client {
	if token == "" {
		return nil
	}
	return &Client{
		token:      token,
		HTTPClient: &http.Client{Timeout: 10 * time.Second},
		APIURL:     "https://api.github.com",
		maxRetries: defaultMaxRetries,
	}
}

// WithMaxRetries sets the number of retry attempts for transient errors.
func (c *Client) WithMaxRetries(n int) *Client {
	c.maxRetries = n
	return c
}

var (
	validOwnerRepo = regexp.MustCompile(`^[a-zA-Z0-9._-]+$`)
	validSHA       = regexp.MustCompile(`^[0-9a-fA-F]{7,40}$`)
)

type statusPayload struct {
	State       string `json:"state"`
	Description string `json:"description,omitempty"`
	Context     string `json:"context,omitempty"`
	TargetURL   string `json:"target_url,omitempty"`
}

// PostStatus posts a commit status to the GitHub Statuses API.
// It retries on 429 (rate limited) and 5xx (server error) responses with
// exponential backoff, respecting the Retry-After header on 429 responses.
// Client errors (4xx except 429) are not retried.
func (c *Client) PostStatus(ctx context.Context, owner, repo, sha, state, description, statusContext, targetURL string) error {
	if !validOwnerRepo.MatchString(owner) {
		return fmt.Errorf("invalid github owner: %q", owner)
	}
	if !validOwnerRepo.MatchString(repo) {
		return fmt.Errorf("invalid github repo: %q", repo)
	}
	if !validSHA.MatchString(sha) {
		return fmt.Errorf("invalid github sha: %q", sha)
	}

	body, err := json.Marshal(statusPayload{
		State:       state,
		Description: description,
		Context:     statusContext,
		TargetURL:   targetURL,
	})
	if err != nil {
		return fmt.Errorf("marshal status payload: %w", err)
	}

	url := fmt.Sprintf("%s/repos/%s/%s/statuses/%s", c.APIURL, owner, repo, sha)

	var lastErr error
	for attempt := 0; attempt <= c.maxRetries; attempt++ {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		lastErr = c.doPost(ctx, url, body)
		if lastErr == nil {
			return nil
		}

		if !isRetriableError(lastErr) {
			return lastErr
		}

		if attempt < c.maxRetries {
			backoff := retryAfterDuration(lastErr)
			if backoff == 0 {
				backoff = time.Duration(1<<uint(attempt)) * time.Second
			}
			log.Warn().Err(lastErr).
				Int("attempt", attempt+1).
				Str("sha", sha).
				Dur("backoff", backoff).
				Msg("github: retrying PostStatus")

			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(backoff):
			}
		}
	}
	return lastErr
}

// doPost executes a single HTTP POST to the GitHub statuses API.
func (c *Client) doPost(ctx context.Context, url string, body []byte) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "ScaledTest/1.0")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("post github status: %w", err)
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body) //nolint:errcheck

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}

	if resp.StatusCode == http.StatusTooManyRequests {
		retryAfter := resp.Header.Get("Retry-After")
		return &retriableError{
			statusCode: resp.StatusCode,
			retryAfter: retryAfter,
		}
	}

	if resp.StatusCode >= 500 {
		return &retriableError{statusCode: resp.StatusCode}
	}

	return fmt.Errorf("github status API returned %d", resp.StatusCode)
}

// retriableError represents a transient HTTP error that should be retried.
type retriableError struct {
	statusCode int
	retryAfter string
}

func (e *retriableError) Error() string {
	if e.retryAfter != "" {
		return fmt.Sprintf("github status API returned %d (Retry-After: %s)", e.statusCode, e.retryAfter)
	}
	return fmt.Sprintf("github status API returned %d", e.statusCode)
}

// isRetriableError returns true for 429 and 5xx errors.
func isRetriableError(err error) bool {
	var re *retriableError
	return errors.As(err, &re)
}

// retryAfterDuration extracts the Retry-After duration from a retriableError.
// Returns 0 if not available or parseable.
func retryAfterDuration(err error) time.Duration {
	var re *retriableError
	if !errors.As(err, &re) {
		return 0
	}
	if re.retryAfter == "" {
		return 0
	}
	if secs, e := strconv.Atoi(re.retryAfter); e == nil {
		return time.Duration(secs) * time.Second
	}
	return 0
}
