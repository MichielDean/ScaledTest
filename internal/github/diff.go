package github

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/scaledtest/scaledtest/internal/analytics"
)

// compareResponse is the subset of the GitHub compare API response we use.
type compareResponse struct {
	Files []compareFile `json:"files"`
}

// compareFile represents a single file entry in a GitHub compare response.
type compareFile struct {
	Filename  string `json:"filename"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
	Changes   int    `json:"changes"` // additions + deletions per GitHub API
}

// FetchDiff calls the GitHub Repositories Compare API and returns per-file
// churn statistics for all files changed between baseSHA and headSHA.
//
// Returns (nil, nil) when the repository is inaccessible (HTTP 403 Forbidden
// or 404 Not Found) so callers can degrade gracefully without failing triage.
// Returns an error for all other failure modes.
//
// If the receiver is nil (GitHub integration not configured), returns (nil, nil).
func (c *Client) FetchDiff(ctx context.Context, owner, repo, baseSHA, headSHA string) ([]analytics.FileDiffStat, error) {
	if c == nil {
		return nil, nil
	}

	if !validOwnerRepo.MatchString(owner) {
		return nil, fmt.Errorf("invalid github owner: %q", owner)
	}
	if !validOwnerRepo.MatchString(repo) {
		return nil, fmt.Errorf("invalid github repo: %q", repo)
	}
	if !validSHA.MatchString(baseSHA) {
		return nil, fmt.Errorf("invalid github base SHA: %q", baseSHA)
	}
	if !validSHA.MatchString(headSHA) {
		return nil, fmt.Errorf("invalid github head SHA: %q", headSHA)
	}

	url := fmt.Sprintf("%s/repos/%s/%s/compare/%s...%s", c.APIURL, owner, repo, baseSHA, headSHA)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("create compare request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "ScaledTest/1.0")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch github compare: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		io.Copy(io.Discard, resp.Body) //nolint:errcheck
		// Missing repo access is not a hard error — return nil so callers degrade gracefully.
		if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusForbidden {
			return nil, nil
		}
		return nil, fmt.Errorf("github compare API returned %d", resp.StatusCode)
	}

	var cr compareResponse
	if err := json.NewDecoder(resp.Body).Decode(&cr); err != nil {
		return nil, fmt.Errorf("decode compare response: %w", err)
	}

	stats := make([]analytics.FileDiffStat, 0, len(cr.Files))
	for _, f := range cr.Files {
		churn := f.Changes
		if churn == 0 {
			// Fall back to additions+deletions when the changes field is absent.
			churn = f.Additions + f.Deletions
		}
		stats = append(stats, analytics.FileDiffStat{
			Path:      f.Filename,
			Additions: f.Additions,
			Deletions: f.Deletions,
			Churn:     churn,
		})
	}

	return stats, nil
}
