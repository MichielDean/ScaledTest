package analytics

import (
	"context"
	"errors"
	"fmt"
	"testing"
)

// stubPreviousRunFinder is a controllable PreviousRunFinder for unit tests.
type stubPreviousRunFinder struct {
	sha string
	err error
}

func (s *stubPreviousRunFinder) FindPreviousSuccessfulCommit(_ context.Context, _, _, _, _ string) (string, error) {
	return s.sha, s.err
}

// stubDiffFetcher is a controllable DiffFetcher for unit tests.
type stubDiffFetcher struct {
	files []FileDiffStat
	err   error
}

func (s *stubDiffFetcher) FetchDiff(_ context.Context, _, _, _, _ string) ([]FileDiffStat, error) {
	return s.files, s.err
}

// callCountingFetcher records how many times FetchDiff is called.
type callCountingFetcher struct {
	count   int
	onFetch func() []FileDiffStat
}

func (c *callCountingFetcher) FetchDiff(_ context.Context, _, _, _, _ string) ([]FileDiffStat, error) {
	c.count++
	return c.onFetch(), nil
}

// ---- BuildDiffSummary tests ----

func TestBuildDiffSummary_EmptyFiles_ReturnsEmptySummary(t *testing.T) {
	q := GitDiffQuery{Repository: "org/repo", HeadSHA: "abc1234"}
	got := BuildDiffSummary(q, "base111", nil)

	if len(got.Files) != 0 {
		t.Errorf("Files len = %d, want 0", len(got.Files))
	}
	if got.Truncated {
		t.Error("Truncated = true, want false for empty input")
	}
	if got.TotalFiles != 0 {
		t.Errorf("TotalFiles = %d, want 0", got.TotalFiles)
	}
	if got.BaseCommit != "base111" {
		t.Errorf("BaseCommit = %q, want %q", got.BaseCommit, "base111")
	}
	if got.HeadCommit != "abc1234" {
		t.Errorf("HeadCommit = %q, want %q", got.HeadCommit, "abc1234")
	}
	if got.Repository != "org/repo" {
		t.Errorf("Repository = %q, want %q", got.Repository, "org/repo")
	}
}

func TestBuildDiffSummary_FilesUnderLimit_AllFilesReturned(t *testing.T) {
	q := GitDiffQuery{Repository: "org/repo", HeadSHA: "abc1234", MaxFiles: 5}
	files := []FileDiffStat{
		{Path: "a.go", Additions: 10, Deletions: 2, Churn: 12},
		{Path: "b.go", Additions: 5, Deletions: 1, Churn: 6},
	}
	got := BuildDiffSummary(q, "base111", files)

	if len(got.Files) != 2 {
		t.Errorf("Files len = %d, want 2", len(got.Files))
	}
	if got.Truncated {
		t.Error("Truncated = true, want false when under limit")
	}
	if got.TotalFiles != 2 {
		t.Errorf("TotalFiles = %d, want 2", got.TotalFiles)
	}
}

func TestBuildDiffSummary_FilesOverLimit_TruncatedToTopNByChurn(t *testing.T) {
	q := GitDiffQuery{MaxFiles: 2}
	files := []FileDiffStat{
		{Path: "low.go", Churn: 1},
		{Path: "high.go", Churn: 50},
		{Path: "mid.go", Churn: 20},
	}
	got := BuildDiffSummary(q, "base", files)

	if len(got.Files) != 2 {
		t.Errorf("Files len = %d, want 2", len(got.Files))
	}
	if !got.Truncated {
		t.Error("Truncated = false, want true when over limit")
	}
	if got.TotalFiles != 3 {
		t.Errorf("TotalFiles = %d, want 3", got.TotalFiles)
	}
	if got.Files[0].Path != "high.go" {
		t.Errorf("Files[0].Path = %q, want high.go (churn 50)", got.Files[0].Path)
	}
	if got.Files[1].Path != "mid.go" {
		t.Errorf("Files[1].Path = %q, want mid.go (churn 20)", got.Files[1].Path)
	}
}

func TestBuildDiffSummary_SortsByChurnDescending(t *testing.T) {
	q := GitDiffQuery{MaxFiles: 10}
	files := []FileDiffStat{
		{Path: "c.go", Churn: 5},
		{Path: "a.go", Churn: 100},
		{Path: "b.go", Churn: 30},
	}
	got := BuildDiffSummary(q, "base", files)

	if got.Files[0].Path != "a.go" {
		t.Errorf("[0] = %q, want a.go (churn 100)", got.Files[0].Path)
	}
	if got.Files[1].Path != "b.go" {
		t.Errorf("[1] = %q, want b.go (churn 30)", got.Files[1].Path)
	}
	if got.Files[2].Path != "c.go" {
		t.Errorf("[2] = %q, want c.go (churn 5)", got.Files[2].Path)
	}
}

func TestBuildDiffSummary_EqualChurnSortedByPathAscending(t *testing.T) {
	q := GitDiffQuery{MaxFiles: 10}
	files := []FileDiffStat{
		{Path: "z.go", Churn: 10},
		{Path: "a.go", Churn: 10},
		{Path: "m.go", Churn: 10},
	}
	got := BuildDiffSummary(q, "base", files)

	if got.Files[0].Path != "a.go" {
		t.Errorf("[0] = %q, want a.go", got.Files[0].Path)
	}
	if got.Files[1].Path != "m.go" {
		t.Errorf("[1] = %q, want m.go", got.Files[1].Path)
	}
	if got.Files[2].Path != "z.go" {
		t.Errorf("[2] = %q, want z.go", got.Files[2].Path)
	}
}

func TestBuildDiffSummary_DefaultMaxFilesAppliedWhenZero(t *testing.T) {
	q := GitDiffQuery{MaxFiles: 0} // zero triggers DefaultMaxFiles
	files := make([]FileDiffStat, DefaultMaxFiles+5)
	for i := range files {
		files[i] = FileDiffStat{Path: fmt.Sprintf("f%02d.go", i), Churn: i}
	}
	got := BuildDiffSummary(q, "base", files)

	if len(got.Files) != DefaultMaxFiles {
		t.Errorf("Files len = %d, want %d (DefaultMaxFiles)", len(got.Files), DefaultMaxFiles)
	}
	if !got.Truncated {
		t.Error("Truncated = false, want true")
	}
	if got.TotalFiles != DefaultMaxFiles+5 {
		t.Errorf("TotalFiles = %d, want %d", got.TotalFiles, DefaultMaxFiles+5)
	}
}

func TestBuildDiffSummary_ExactlyAtLimit_NotTruncated(t *testing.T) {
	q := GitDiffQuery{MaxFiles: 3}
	files := []FileDiffStat{
		{Path: "a.go", Churn: 1},
		{Path: "b.go", Churn: 2},
		{Path: "c.go", Churn: 3},
	}
	got := BuildDiffSummary(q, "base", files)

	if got.Truncated {
		t.Error("Truncated = true, want false when exactly at limit")
	}
	if len(got.Files) != 3 {
		t.Errorf("Files len = %d, want 3", len(got.Files))
	}
}

func TestGitDiffQuery_MaxFilesLimit_DefaultsToDefaultMaxFiles(t *testing.T) {
	tests := []struct {
		name     string
		maxFiles int
		want     int
	}{
		{"zero returns default", 0, DefaultMaxFiles},
		{"negative returns default", -1, DefaultMaxFiles},
		{"positive preserved", 10, 10},
		{"large positive preserved", 100, 100},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			q := GitDiffQuery{MaxFiles: tt.maxFiles}
			if got := q.MaxFilesLimit(); got != tt.want {
				t.Errorf("MaxFilesLimit() = %d, want %d", got, tt.want)
			}
		})
	}
}

// ---- ParseOwnerRepo tests ----

func TestParseOwnerRepo(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		wantOwner string
		wantRepo  string
		wantOK    bool
	}{
		{"simple owner/repo", "myorg/myrepo", "myorg", "myrepo", true},
		{"github.com prefix", "github.com/myorg/myrepo", "myorg", "myrepo", true},
		{"https URL", "https://github.com/myorg/myrepo", "myorg", "myrepo", true},
		{"https URL with .git", "https://github.com/myorg/myrepo.git", "myorg", "myrepo", true},
		{"http URL", "http://github.com/myorg/myrepo", "myorg", "myrepo", true},
		{"git URL with .git", "git://github.com/myorg/myrepo.git", "myorg", "myrepo", true},
		{"no slash", "notarepo", "", "", false},
		{"empty string", "", "", "", false},
		{"only slash", "/", "", "", false},
		{"empty owner", "/repo", "", "", false},
		{"empty repo", "owner/", "", "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			owner, repo, ok := ParseOwnerRepo(tt.input)
			if ok != tt.wantOK {
				t.Errorf("ok = %v, want %v", ok, tt.wantOK)
			}
			if owner != tt.wantOwner {
				t.Errorf("owner = %q, want %q", owner, tt.wantOwner)
			}
			if repo != tt.wantRepo {
				t.Errorf("repo = %q, want %q", repo, tt.wantRepo)
			}
		})
	}
}

// ---- GitDiffEnricher.Enrich tests ----

func TestGitDiffEnricher_Enrich_NilFetcherReturnsEmpty(t *testing.T) {
	e := NewGitDiffEnricher(
		&stubPreviousRunFinder{sha: "base123"},
		nil,
	)
	q := GitDiffQuery{TeamID: "t1", Repository: "org/repo", HeadSHA: "head123"}

	got, err := e.Enrich(context.Background(), q)
	if err != nil {
		t.Fatalf("Enrich: unexpected error: %v", err)
	}
	if len(got.Files) != 0 {
		t.Errorf("Files len = %d, want 0", len(got.Files))
	}
	if got.HeadCommit != "head123" {
		t.Errorf("HeadCommit = %q, want head123", got.HeadCommit)
	}
	if got.Repository != "org/repo" {
		t.Errorf("Repository = %q, want org/repo", got.Repository)
	}
}

func TestGitDiffEnricher_Enrich_NoPreviousRunReturnsEmpty(t *testing.T) {
	e := NewGitDiffEnricher(
		&stubPreviousRunFinder{sha: ""},
		&stubDiffFetcher{},
	)
	q := GitDiffQuery{TeamID: "t1", Repository: "org/repo", HeadSHA: "head123"}

	got, err := e.Enrich(context.Background(), q)
	if err != nil {
		t.Fatalf("Enrich: unexpected error: %v", err)
	}
	if got.BaseCommit != "" {
		t.Errorf("BaseCommit = %q, want empty when no previous run", got.BaseCommit)
	}
	if len(got.Files) != 0 {
		t.Errorf("Files len = %d, want 0", len(got.Files))
	}
}

func TestGitDiffEnricher_Enrich_UnparseableRepoReturnsEmpty(t *testing.T) {
	e := NewGitDiffEnricher(
		&stubPreviousRunFinder{sha: "base123"},
		&stubDiffFetcher{},
	)
	q := GitDiffQuery{TeamID: "t1", Repository: "not-a-valid-repo", HeadSHA: "head123"}

	got, err := e.Enrich(context.Background(), q)
	if err != nil {
		t.Fatalf("Enrich: unexpected error: %v", err)
	}
	if len(got.Files) != 0 {
		t.Errorf("Files len = %d, want 0 for unparseable repo", len(got.Files))
	}
}

func TestGitDiffEnricher_Enrich_InaccessibleRepo_NilFilesReturnsEmpty(t *testing.T) {
	// FetchDiff returning (nil, nil) signals inaccessible repo (403/404).
	e := NewGitDiffEnricher(
		&stubPreviousRunFinder{sha: "base123"},
		&stubDiffFetcher{files: nil, err: nil},
	)
	q := GitDiffQuery{TeamID: "t1", Repository: "org/repo", HeadSHA: "head123"}

	got, err := e.Enrich(context.Background(), q)
	if err != nil {
		t.Fatalf("Enrich: unexpected error: %v", err)
	}
	if len(got.Files) != 0 {
		t.Errorf("Files len = %d, want 0 for inaccessible repo", len(got.Files))
	}
	if got.BaseCommit != "base123" {
		t.Errorf("BaseCommit = %q, want base123 (still set even when repo inaccessible)", got.BaseCommit)
	}
}

func TestGitDiffEnricher_Enrich_FetchDiffErrorPropagates(t *testing.T) {
	fetchErr := errors.New("network timeout")
	e := NewGitDiffEnricher(
		&stubPreviousRunFinder{sha: "base123"},
		&stubDiffFetcher{err: fetchErr},
	)
	q := GitDiffQuery{TeamID: "t1", Repository: "org/repo", HeadSHA: "head123"}

	_, err := e.Enrich(context.Background(), q)
	if err == nil {
		t.Fatal("Enrich: expected error from FetchDiff, got nil")
	}
	if !errors.Is(err, fetchErr) {
		t.Errorf("Enrich error = %v, want to wrap fetchErr", err)
	}
}

func TestGitDiffEnricher_Enrich_PreviousRunFinderErrorPropagates(t *testing.T) {
	dbErr := errors.New("db connection refused")
	e := NewGitDiffEnricher(
		&stubPreviousRunFinder{err: dbErr},
		&stubDiffFetcher{},
	)
	q := GitDiffQuery{TeamID: "t1", Repository: "org/repo", HeadSHA: "head123"}

	_, err := e.Enrich(context.Background(), q)
	if err == nil {
		t.Fatal("Enrich: expected error from PreviousRunFinder, got nil")
	}
	if !errors.Is(err, dbErr) {
		t.Errorf("Enrich error = %v, want to wrap dbErr", err)
	}
}

func TestGitDiffEnricher_Enrich_ReturnsDiffSummary(t *testing.T) {
	files := []FileDiffStat{
		{Path: "main.go", Additions: 10, Deletions: 5, Churn: 15},
		{Path: "handler.go", Additions: 3, Deletions: 1, Churn: 4},
	}
	e := NewGitDiffEnricher(
		&stubPreviousRunFinder{sha: "base123"},
		&stubDiffFetcher{files: files},
	)
	q := GitDiffQuery{TeamID: "t1", Repository: "org/repo", HeadSHA: "head123", MaxFiles: 10}

	got, err := e.Enrich(context.Background(), q)
	if err != nil {
		t.Fatalf("Enrich: unexpected error: %v", err)
	}
	if got.BaseCommit != "base123" {
		t.Errorf("BaseCommit = %q, want base123", got.BaseCommit)
	}
	if got.HeadCommit != "head123" {
		t.Errorf("HeadCommit = %q, want head123", got.HeadCommit)
	}
	if len(got.Files) != 2 {
		t.Fatalf("Files len = %d, want 2", len(got.Files))
	}
	// Files sorted by churn desc: main.go (15) > handler.go (4)
	if got.Files[0].Path != "main.go" {
		t.Errorf("Files[0].Path = %q, want main.go (highest churn)", got.Files[0].Path)
	}
	if got.Files[1].Path != "handler.go" {
		t.Errorf("Files[1].Path = %q, want handler.go", got.Files[1].Path)
	}
}

func TestGitDiffEnricher_Enrich_CachesResult(t *testing.T) {
	fetcher := &callCountingFetcher{
		onFetch: func() []FileDiffStat {
			return []FileDiffStat{{Path: "x.go", Churn: 1}}
		},
	}
	e := NewGitDiffEnricher(
		&stubPreviousRunFinder{sha: "base123"},
		fetcher,
	)
	q := GitDiffQuery{TeamID: "t1", Repository: "org/repo", HeadSHA: "head123"}

	first, err := e.Enrich(context.Background(), q)
	if err != nil {
		t.Fatalf("first Enrich: %v", err)
	}
	second, err := e.Enrich(context.Background(), q)
	if err != nil {
		t.Fatalf("second Enrich: %v", err)
	}

	if fetcher.count != 1 {
		t.Errorf("FetchDiff called %d times, want 1 (second call must be cached)", fetcher.count)
	}
	if first.HeadCommit != second.HeadCommit || first.BaseCommit != second.BaseCommit {
		t.Error("cached result differs from original")
	}
}

func TestGitDiffEnricher_Enrich_DifferentQueryKeysDontShareCache(t *testing.T) {
	fetcher := &callCountingFetcher{
		onFetch: func() []FileDiffStat {
			return []FileDiffStat{{Path: "x.go", Churn: 1}}
		},
	}
	e := NewGitDiffEnricher(
		&stubPreviousRunFinder{sha: "base123"},
		fetcher,
	)

	q1 := GitDiffQuery{TeamID: "t1", Repository: "org/repo", HeadSHA: "sha-aaa"}
	q2 := GitDiffQuery{TeamID: "t1", Repository: "org/repo", HeadSHA: "sha-bbb"}

	if _, err := e.Enrich(context.Background(), q1); err != nil {
		t.Fatalf("q1 Enrich: %v", err)
	}
	if _, err := e.Enrich(context.Background(), q2); err != nil {
		t.Fatalf("q2 Enrich: %v", err)
	}

	if fetcher.count != 2 {
		t.Errorf("FetchDiff called %d times, want 2 (different headSHAs must not share cache)", fetcher.count)
	}
}
