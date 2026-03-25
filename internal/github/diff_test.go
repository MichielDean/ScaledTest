package github

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/scaledtest/scaledtest/internal/analytics"
)

// Compile-time check: *Client implements analytics.DiffFetcher.
var _ analytics.DiffFetcher = (*Client)(nil)

func TestFetchDiff_Success_ReturnsSortedFileStats(t *testing.T) {
	payload := compareResponse{
		Files: []compareFile{
			{Filename: "main.go", Additions: 10, Deletions: 5, Changes: 15},
			{Filename: "handler.go", Additions: 3, Deletions: 1, Changes: 4},
		},
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Errorf("method = %q, want GET", r.Method)
		}
		wantPath := "/repos/myorg/myrepo/compare/base123...head456"
		if r.URL.Path != wantPath {
			t.Errorf("path = %q, want %q", r.URL.Path, wantPath)
		}
		if r.Header.Get("Authorization") != "Bearer ghp_tok" {
			t.Errorf("Authorization = %q, want Bearer ghp_tok", r.Header.Get("Authorization"))
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(payload)
	}))
	defer srv.Close()

	c := &Client{token: "ghp_tok", HTTPClient: srv.Client(), APIURL: srv.URL}
	files, err := c.FetchDiff(context.Background(), "myorg", "myrepo", "base123", "head456")
	if err != nil {
		t.Fatalf("FetchDiff: unexpected error: %v", err)
	}
	if len(files) != 2 {
		t.Fatalf("len(files) = %d, want 2", len(files))
	}

	// Verify first file
	if files[0].Path != "main.go" {
		t.Errorf("files[0].Path = %q, want main.go", files[0].Path)
	}
	if files[0].Additions != 10 {
		t.Errorf("files[0].Additions = %d, want 10", files[0].Additions)
	}
	if files[0].Deletions != 5 {
		t.Errorf("files[0].Deletions = %d, want 5", files[0].Deletions)
	}
	if files[0].Churn != 15 {
		t.Errorf("files[0].Churn = %d, want 15", files[0].Churn)
	}
}

func TestFetchDiff_EmptyFileList_ReturnsEmpty(t *testing.T) {
	payload := compareResponse{Files: []compareFile{}}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(payload)
	}))
	defer srv.Close()

	c := &Client{token: "tok", HTTPClient: srv.Client(), APIURL: srv.URL}
	files, err := c.FetchDiff(context.Background(), "org", "repo", "base", "head")
	if err != nil {
		t.Fatalf("FetchDiff: unexpected error: %v", err)
	}
	if len(files) != 0 {
		t.Errorf("len(files) = %d, want 0 for empty diff", len(files))
	}
}

func TestFetchDiff_404_ReturnsNilNil(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	c := &Client{token: "tok", HTTPClient: srv.Client(), APIURL: srv.URL}
	files, err := c.FetchDiff(context.Background(), "org", "repo", "base", "head")
	if err != nil {
		t.Fatalf("FetchDiff: expected nil error for 404, got: %v", err)
	}
	if files != nil {
		t.Errorf("files = %v, want nil for 404 (graceful degradation)", files)
	}
}

func TestFetchDiff_403_ReturnsNilNil(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer srv.Close()

	c := &Client{token: "tok", HTTPClient: srv.Client(), APIURL: srv.URL}
	files, err := c.FetchDiff(context.Background(), "org", "repo", "base", "head")
	if err != nil {
		t.Fatalf("FetchDiff: expected nil error for 403, got: %v", err)
	}
	if files != nil {
		t.Errorf("files = %v, want nil for 403 (graceful degradation)", files)
	}
}

func TestFetchDiff_500_ReturnsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	c := &Client{token: "tok", HTTPClient: srv.Client(), APIURL: srv.URL}
	_, err := c.FetchDiff(context.Background(), "org", "repo", "base", "head")
	if err == nil {
		t.Fatal("FetchDiff: expected error for 500, got nil")
	}
}

func TestFetchDiff_NilClient_ReturnsNilNil(t *testing.T) {
	var c *Client
	files, err := c.FetchDiff(context.Background(), "org", "repo", "base", "head")
	if err != nil {
		t.Fatalf("FetchDiff on nil client: unexpected error: %v", err)
	}
	if files != nil {
		t.Errorf("files = %v, want nil for nil client", files)
	}
}

func TestFetchDiff_ChurnFallsBackToAdditionsPlusDeletions(t *testing.T) {
	// When GitHub's Changes field is 0, Churn should be computed from
	// Additions + Deletions.
	payload := compareResponse{
		Files: []compareFile{
			{Filename: "file.go", Additions: 7, Deletions: 3, Changes: 0},
		},
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(payload)
	}))
	defer srv.Close()

	c := &Client{token: "tok", HTTPClient: srv.Client(), APIURL: srv.URL}
	files, err := c.FetchDiff(context.Background(), "org", "repo", "base", "head")
	if err != nil {
		t.Fatalf("FetchDiff: %v", err)
	}
	if len(files) != 1 {
		t.Fatalf("len(files) = %d, want 1", len(files))
	}
	if files[0].Churn != 10 {
		t.Errorf("Churn = %d, want 10 (additions+deletions fallback)", files[0].Churn)
	}
}

func TestFetchDiff_ContextCancelled_ReturnsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	c := &Client{token: "tok", HTTPClient: srv.Client(), APIURL: srv.URL}
	_, err := c.FetchDiff(ctx, "org", "repo", "base", "head")
	if err == nil {
		t.Fatal("FetchDiff: expected error for cancelled context, got nil")
	}
}

func TestFetchDiff_RequestHeaders(t *testing.T) {
	var gotAccept, gotAPIVersion, gotUserAgent string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAccept = r.Header.Get("Accept")
		gotAPIVersion = r.Header.Get("X-GitHub-Api-Version")
		gotUserAgent = r.Header.Get("User-Agent")
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(compareResponse{})
	}))
	defer srv.Close()

	c := &Client{token: "tok", HTTPClient: srv.Client(), APIURL: srv.URL}
	if _, err := c.FetchDiff(context.Background(), "org", "repo", "base", "head"); err != nil {
		t.Fatalf("FetchDiff: %v", err)
	}

	if gotAccept != "application/vnd.github+json" {
		t.Errorf("Accept = %q, want application/vnd.github+json", gotAccept)
	}
	if gotAPIVersion != "2022-11-28" {
		t.Errorf("X-GitHub-Api-Version = %q, want 2022-11-28", gotAPIVersion)
	}
	if gotUserAgent != "ScaledTest/1.0" {
		t.Errorf("User-Agent = %q, want ScaledTest/1.0", gotUserAgent)
	}
}
