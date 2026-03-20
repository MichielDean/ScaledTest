package github

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"time"
)

// StatusPoster posts a GitHub commit status.
type StatusPoster interface {
	PostStatus(ctx context.Context, owner, repo, sha, state, description, statusContext, targetURL string) error
}

// Client implements StatusPoster using the GitHub REST API.
type Client struct {
	token      string
	HTTPClient *http.Client
	APIURL     string
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
	}
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
// state must be one of "success", "failure", "pending", "error".
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

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("github status API returned %d", resp.StatusCode)
	}
	return nil
}
