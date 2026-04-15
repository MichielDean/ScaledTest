package github

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
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

	c := &Client{token: "ghp_tok", HTTPClient: srv.Client(), APIURL: srv.URL, maxRetries: defaultMaxRetries}

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

	c := &Client{token: "bad", HTTPClient: srv.Client(), APIURL: srv.URL, maxRetries: defaultMaxRetries}

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

	c := &Client{token: "tok", HTTPClient: srv.Client(), APIURL: srv.URL, maxRetries: defaultMaxRetries}

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

	c := &Client{token: "tok", HTTPClient: srv.Client(), APIURL: srv.URL, maxRetries: defaultMaxRetries}
	// 7-char short SHA should be accepted
	err := c.PostStatus(context.Background(), "owner", "repo", "abc1234", "success", "", "", "")
	if err != nil {
		t.Fatalf("unexpected error for 7-char SHA: %v", err)
	}
}

func TestPostStatus_RetriesOn429(t *testing.T) {
	var attempts atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := attempts.Add(1)
		if n < 3 {
			w.Header().Set("Retry-After", "0")
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	c := &Client{token: "tok", HTTPClient: srv.Client(), APIURL: srv.URL, maxRetries: 3}
	err := c.PostStatus(context.Background(), "owner", "repo", "abc1234", "success", "", "", "")
	if err != nil {
		t.Fatalf("expected success after retries, got: %v", err)
	}
	if got := attempts.Load(); got != 3 {
		t.Errorf("expected 3 attempts, got %d", got)
	}
}

func TestPostStatus_RetriesOn5xx(t *testing.T) {
	var attempts atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := attempts.Add(1)
		if n < 2 {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	c := &Client{token: "tok", HTTPClient: srv.Client(), APIURL: srv.URL, maxRetries: 3}
	err := c.PostStatus(context.Background(), "owner", "repo", "abc1234", "success", "", "", "")
	if err != nil {
		t.Fatalf("expected success after retries, got: %v", err)
	}
	if got := attempts.Load(); got != 2 {
		t.Errorf("expected 2 attempts, got %d", got)
	}
}

func TestPostStatus_DoesNotRetryOn4xx(t *testing.T) {
	var attempts atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts.Add(1)
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()

	c := &Client{token: "tok", HTTPClient: srv.Client(), APIURL: srv.URL, maxRetries: 3}
	err := c.PostStatus(context.Background(), "owner", "repo", "abc1234", "success", "", "", "")
	if err == nil {
		t.Fatal("expected error for 401 response")
	}
	if got := attempts.Load(); got != 1 {
		t.Errorf("expected 1 attempt (no retry for 4xx), got %d", got)
	}
}

func TestPostStatus_RespectsRetryAfterHeader(t *testing.T) {
	var attempts atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := attempts.Add(1)
		if n == 1 {
			w.Header().Set("Retry-After", "0")
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	c := &Client{token: "tok", HTTPClient: srv.Client(), APIURL: srv.URL, maxRetries: 3}
	err := c.PostStatus(context.Background(), "owner", "repo", "abc1234deadbeef", "success", "", "", "")
	if err != nil {
		t.Fatalf("expected success, got: %v", err)
	}
	if got := attempts.Load(); got != 2 {
		t.Errorf("expected 2 attempts, got %d", got)
	}
}

func TestPostStatus_ExhaustsRetries(t *testing.T) {
	var attempts atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts.Add(1)
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	c := &Client{
		token:      "tok",
		HTTPClient: srv.Client(),
		APIURL:     srv.URL,
		maxRetries: 2,
	}
	err := c.PostStatus(context.Background(), "owner", "repo", "abc1234deadbeef", "success", "", "", "")
	if err == nil {
		t.Fatal("expected error after exhausting retries")
	}
	// 1 initial + 2 retries = 3 total attempts
	if got := attempts.Load(); got != 3 {
		t.Errorf("expected 3 attempts, got %d", got)
	}
}

func TestPostStatus_ContextCancelledStopsRetries(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	c := &Client{
		token:      "tok",
		HTTPClient: &http.Client{Timeout: 5 * time.Second},
		APIURL:     srv.URL,
		maxRetries: 10,
	}
	err := c.PostStatus(ctx, "owner", "repo", "abc1234deadbeef", "success", "", "", "")
	if err == nil {
		t.Fatal("expected error from context cancellation")
	}
}

func TestIsRetriableError(t *testing.T) {
	tests := []struct {
		name   string
		err    error
		retry  bool
		after0 bool
	}{
		{
			name:  "retriable 429 without Retry-After",
			err:   &retriableError{statusCode: 429},
			retry: true,
		},
		{
			name:  "retriable 500",
			err:   &retriableError{statusCode: 500},
			retry: true,
		},
		{
			name:  "retriable 502",
			err:   &retriableError{statusCode: 502},
			retry: true,
		},
		{
			name:  "non-retriable 401",
			err:   fmt.Errorf("github status API returned 401"),
			retry: false,
		},
		{
			name:  "non-retriable 404",
			err:   fmt.Errorf("github status API returned 404"),
			retry: false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isRetriableError(tt.err)
			if got != tt.retry {
				t.Errorf("isRetriableError() = %v, want %v", got, tt.retry)
			}
		})
	}
}

func TestRetryAfterDuration(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want time.Duration
	}{
		{
			name: "429 with Retry-After in seconds",
			err:  &retriableError{statusCode: 429, retryAfter: "30"},
			want: 30 * time.Second,
		},
		{
			name: "429 with empty Retry-After",
			err:  &retriableError{statusCode: 429, retryAfter: ""},
			want: 0,
		},
		{
			name: "429 with invalid Retry-After",
			err:  &retriableError{statusCode: 429, retryAfter: "notanumber"},
			want: 0,
		},
		{
			name: "5xx error without Retry-After",
			err:  &retriableError{statusCode: 500},
			want: 0,
		},
		{
			name: "non-retriable error",
			err:  fmt.Errorf("some other error"),
			want: 0,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := retryAfterDuration(tt.err)
			if got != tt.want {
				t.Errorf("retryAfterDuration() = %v, want %v", got, tt.want)
			}
		})
	}
}
