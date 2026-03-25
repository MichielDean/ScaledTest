package analytics

import (
	"context"
	"sort"
	"strings"
	"sync"
)

// DefaultMaxFiles is the default maximum number of files in a diff summary.
const DefaultMaxFiles = 20

// GitDiffQuery defines the input for a git diff enrichment request.
type GitDiffQuery struct {
	TeamID          string
	Repository      string // CTRF environment.repository value
	HeadSHA         string // commit SHA being triaged
	Branch          string // optional: scope previous-run lookup to a branch
	ExcludeReportID string // optional: exclude this report ID from the lookup
	MaxFiles        int    // 0 uses DefaultMaxFiles
}

// MaxFilesLimit returns the effective maximum files limit, defaulting to
// DefaultMaxFiles when MaxFiles is zero or negative.
func (q GitDiffQuery) MaxFilesLimit() int {
	if q.MaxFiles <= 0 {
		return DefaultMaxFiles
	}
	return q.MaxFiles
}

// FileDiffStat holds churn statistics for a single changed file.
type FileDiffStat struct {
	Path      string `json:"path"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
	Churn     int    `json:"churn"` // additions + deletions
}

// GitDiffSummary is a condensed diff summary safe for LLM prompt inclusion.
// Files is sorted by churn descending and truncated to MaxFiles.
type GitDiffSummary struct {
	Repository string         `json:"repository"`
	BaseCommit string         `json:"base_commit,omitempty"` // empty when no previous run found
	HeadCommit string         `json:"head_commit"`
	Files      []FileDiffStat `json:"files"`
	Truncated  bool           `json:"truncated"`   // true when Files was truncated
	TotalFiles int            `json:"total_files"` // file count before truncation
}

// DiffFetcher fetches file-level diff statistics between two commits.
//
// Implementations must return (nil, nil) — not an error — when the repository
// is inaccessible (e.g. HTTP 403 or 404). All other failures should be
// returned as errors.
type DiffFetcher interface {
	FetchDiff(ctx context.Context, owner, repo, baseSHA, headSHA string) ([]FileDiffStat, error)
}

// PreviousRunFinder returns the commit SHA of the most recent fully-passing
// test run for the given team and repository, optionally scoped to a branch.
// Returns an empty string (no error) when no qualifying run exists.
type PreviousRunFinder interface {
	FindPreviousSuccessfulCommit(ctx context.Context, teamID, repository, branch, excludeReportID string) (string, error)
}

// GitDiffEnricher builds GitDiffSummary values for triage enrichment.
//
// It resolves the diff base via PreviousRunFinder, fetches file-level stats
// via DiffFetcher, applies churn-based truncation, and caches results per
// (teamID, repository, headSHA) to prevent redundant fetches.
type GitDiffEnricher struct {
	prevFinder PreviousRunFinder
	fetcher    DiffFetcher // may be nil when GitHub integration is disabled
	cache      sync.Map    // map[cacheKey]*GitDiffSummary
}

// NewGitDiffEnricher creates a GitDiffEnricher. fetcher may be nil; Enrich
// will return empty summaries without error when it is.
func NewGitDiffEnricher(prevFinder PreviousRunFinder, fetcher DiffFetcher) *GitDiffEnricher {
	return &GitDiffEnricher{
		prevFinder: prevFinder,
		fetcher:    fetcher,
	}
}

// Enrich returns a GitDiffSummary for q.
//
// It returns an empty summary (no error) when:
//   - fetcher is nil (GitHub integration disabled)
//   - no previous successful run is found
//   - the repository string cannot be parsed into owner/repo
//   - FetchDiff returns (nil, nil) due to inaccessible repository
//
// DB errors and FetchDiff errors are propagated so callers can log them.
// Triage callers should treat any non-nil error as non-fatal and continue
// without diff context.
func (e *GitDiffEnricher) Enrich(ctx context.Context, q GitDiffQuery) (GitDiffSummary, error) {
	empty := GitDiffSummary{Repository: q.Repository, HeadCommit: q.HeadSHA}

	if e.fetcher == nil {
		return empty, nil
	}

	key := diffCacheKey(q.TeamID, q.Repository, q.HeadSHA)
	if hit, ok := e.cache.Load(key); ok {
		return *hit.(*GitDiffSummary), nil
	}

	cache := func(s GitDiffSummary) GitDiffSummary {
		e.cache.Store(key, &s)
		return s
	}

	baseSHA, err := e.prevFinder.FindPreviousSuccessfulCommit(ctx, q.TeamID, q.Repository, q.Branch, q.ExcludeReportID)
	if err != nil {
		return GitDiffSummary{}, err
	}
	if baseSHA == "" {
		return cache(empty), nil
	}

	owner, repo, ok := ParseOwnerRepo(q.Repository)
	if !ok {
		return cache(empty), nil
	}

	files, err := e.fetcher.FetchDiff(ctx, owner, repo, baseSHA, q.HeadSHA)
	if err != nil {
		return GitDiffSummary{}, err
	}
	// nil files signals inaccessible repository (403/404 handled by fetcher).
	if files == nil {
		base := GitDiffSummary{Repository: q.Repository, BaseCommit: baseSHA, HeadCommit: q.HeadSHA}
		return cache(base), nil
	}

	return cache(BuildDiffSummary(q, baseSHA, files)), nil
}

// BuildDiffSummary builds a GitDiffSummary from raw file stats.
//
// Files are sorted by churn descending (ties broken by path ascending) and
// truncated to q.MaxFilesLimit() entries. When truncation occurs Truncated is
// set to true and TotalFiles reflects the original count.
func BuildDiffSummary(q GitDiffQuery, baseSHA string, files []FileDiffStat) GitDiffSummary {
	total := len(files)
	limit := q.MaxFilesLimit()

	sorted := make([]FileDiffStat, len(files))
	copy(sorted, files)
	sort.Slice(sorted, func(i, j int) bool {
		if sorted[i].Churn != sorted[j].Churn {
			return sorted[i].Churn > sorted[j].Churn // highest churn first
		}
		return sorted[i].Path < sorted[j].Path // stable: alphabetical for equal churn
	})

	truncated := false
	if len(sorted) > limit {
		sorted = sorted[:limit]
		truncated = true
	}

	return GitDiffSummary{
		Repository: q.Repository,
		BaseCommit: baseSHA,
		HeadCommit: q.HeadSHA,
		Files:      sorted,
		Truncated:  truncated,
		TotalFiles: total,
	}
}

// ParseOwnerRepo parses a repository string into GitHub owner and repo components.
// It handles the following formats:
//   - "owner/repo"
//   - "github.com/owner/repo"
//   - "https://github.com/owner/repo"
//   - "https://github.com/owner/repo.git"
//
// Returns ok=false for any string that does not yield a non-empty owner and repo.
func ParseOwnerRepo(repository string) (owner, repo string, ok bool) {
	s := repository

	// Strip URL scheme (https://, http://, git://, etc.)
	if i := strings.Index(s, "://"); i >= 0 {
		s = s[i+3:]
	}

	// Strip optional "github.com/" host prefix.
	s = strings.TrimPrefix(s, "github.com/")

	// Strip .git suffix.
	s = strings.TrimSuffix(s, ".git")

	// Require exactly "owner/repo".
	parts := strings.SplitN(s, "/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}

	return parts[0], parts[1], true
}

func diffCacheKey(teamID, repository, headSHA string) string {
	return teamID + "|" + repository + "|" + headSHA
}
