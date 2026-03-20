package github

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// Compile-time interface check.
var _ StatusPoster = (*Client)(nil)

func TestNew_EmptyToken(t *testing.T) {
	if c := New(""); c != nil {
		t.Error("New(\"\") should return nil")
	}
}

func TestNew_WithToken(t *testing.T) {
	c := New("ghp_abc123")
	if c == nil {
		t.Fatal("New(\"ghp_abc123\") should return non-nil")
	}
	if c.APIURL != "https://api.github.com" {
		t.Errorf("APIURL = %q, want https://api.github.com", c.APIURL)
	}
	if c.HTTPClient == nil {
		t.Error("HTTPClient should be non-nil")
	}
}

func TestPostStatus_Success(t *testing.T) {
	var gotPath, gotAuth, gotUserAgent string
	var gotPayload statusPayload

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		gotUserAgent = r.Header.Get("User-Agent")
		json.NewDecoder(r.Body).Decode(&gotPayload)
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	c := &Client{token: "ghp_tok", HTTPClient: srv.Client(), APIURL: srv.URL}

	err := c.PostStatus(context.Background(), "myowner", "myrepo", "abc1234", "success", "5 tests passed", "scaledtest/e2e", "https://example.com/reports/123")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotPath != "/repos/myowner/myrepo/statuses/abc1234" {
		t.Errorf("path = %q, want /repos/myowner/myrepo/statuses/abc1234", gotPath)
	}
	if gotAuth != "Bearer ghp_tok" {
		t.Errorf("Authorization = %q, want Bearer ghp_tok", gotAuth)
	}
	if gotUserAgent != "ScaledTest/1.0" {
		t.Errorf("User-Agent = %q, want ScaledTest/1.0", gotUserAgent)
	}
	if gotPayload.State != "success" {
		t.Errorf("state = %q, want success", gotPayload.State)
	}
	if gotPayload.Description != "5 tests passed" {
		t.Errorf("description = %q, want 5 tests passed", gotPayload.Description)
	}
	if gotPayload.Context != "scaledtest/e2e" {
		t.Errorf("context = %q, want scaledtest/e2e", gotPayload.Context)
	}
	if gotPayload.TargetURL != "https://example.com/reports/123" {
		t.Errorf("target_url = %q, want https://example.com/reports/123", gotPayload.TargetURL)
	}
}

func TestPostStatus_HTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()

	c := &Client{token: "bad", HTTPClient: srv.Client(), APIURL: srv.URL}

	err := c.PostStatus(context.Background(), "o", "r", "abc1234", "success", "", "", "")
	if err == nil {
		t.Fatal("expected error on 401 response")
	}
}

func TestPostStatus_ContextCancelled(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	c := &Client{token: "tok", HTTPClient: srv.Client(), APIURL: srv.URL}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	err := c.PostStatus(ctx, "o", "r", "abc1234", "success", "", "", "")
	if err == nil {
		t.Fatal("expected error on cancelled context")
	}
}

func TestPostStatus_InvalidOwner(t *testing.T) {
	c := &Client{token: "tok", HTTPClient: http.DefaultClient, APIURL: "http://localhost"}
	err := c.PostStatus(context.Background(), "bad/owner", "repo", "abc1234", "success", "", "", "")
	if err == nil {
		t.Fatal("expected error for owner containing slash")
	}
}

func TestPostStatus_InvalidRepo(t *testing.T) {
	c := &Client{token: "tok", HTTPClient: http.DefaultClient, APIURL: "http://localhost"}
	err := c.PostStatus(context.Background(), "owner", "bad repo", "abc1234", "success", "", "", "")
	if err == nil {
		t.Fatal("expected error for repo containing space")
	}
}

func TestPostStatus_InvalidSHA(t *testing.T) {
	c := &Client{token: "tok", HTTPClient: http.DefaultClient, APIURL: "http://localhost"}
	err := c.PostStatus(context.Background(), "owner", "repo", "not-a-sha!!!", "success", "", "", "")
	if err == nil {
		t.Fatal("expected error for invalid SHA")
	}
}

func TestPostStatus_ShortSHAAccepted(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	c := &Client{token: "tok", HTTPClient: srv.Client(), APIURL: srv.URL}
	// 7-char short SHA should be accepted
	err := c.PostStatus(context.Background(), "owner", "repo", "abc1234", "success", "", "", "")
	if err != nil {
		t.Fatalf("unexpected error for 7-char SHA: %v", err)
	}
}
