package telegram_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/scaledtest/scaledtest/internal/telegram"
)

// --- FormatMessage tests ---

func TestFormatMessage_Passing(t *testing.T) {
	s := telegram.CISummary{
		Repo:      "scaledtest/scaledtest",
		Branch:    "main",
		CommitSHA: "abc1234def5678",
		CommitMsg: "feat: add CI notifications",
		Passed:    42,
		Failed:    0,
		Skipped:   2,
		Total:     44,
		Status:    "passing",
		RunURL:    "https://github.com/actions/runs/123",
	}

	msg := telegram.FormatMessage(s)

	if !strings.Contains(msg, "✅") {
		t.Error("passing summary should contain ✅")
	}
	if !strings.Contains(msg, "PASSING") {
		t.Error("passing summary should contain PASSING")
	}
	if !strings.Contains(msg, "abc1234") {
		t.Error("should contain short SHA (first 7 chars)")
	}
	if !strings.Contains(msg, "42 passed") {
		t.Errorf("should contain pass count; got:\n%s", msg)
	}
	if !strings.Contains(msg, "2 skipped") {
		t.Errorf("should contain skip count; got:\n%s", msg)
	}
	if strings.Contains(msg, "failed") {
		t.Error("should not mention failures when failed=0")
	}
	if !strings.Contains(msg, "View run") {
		t.Error("should contain run URL link")
	}
}

func TestFormatMessage_Failing(t *testing.T) {
	s := telegram.CISummary{
		Repo:   "scaledtest/scaledtest",
		Branch: "main",
		Passed: 10,
		Failed: 3,
		Total:  13,
		Status: "failing",
	}

	msg := telegram.FormatMessage(s)

	if !strings.Contains(msg, "❌") {
		t.Error("failing summary should contain ❌")
	}
	if !strings.Contains(msg, "FAILING") {
		t.Error("failing summary should contain FAILING")
	}
	if !strings.Contains(msg, "3 failed") {
		t.Errorf("should contain failure count; got:\n%s", msg)
	}
}

func TestFormatMessage_TruncatesLongCommitMessage(t *testing.T) {
	s := telegram.CISummary{
		CommitMsg: strings.Repeat("a", 100),
		Status:    "passing",
	}
	msg := telegram.FormatMessage(s)
	if !strings.Contains(msg, "...") {
		t.Error("long commit message should be truncated with ...")
	}
}

func TestFormatMessage_MultilineCommitMessage(t *testing.T) {
	s := telegram.CISummary{
		CommitMsg: "first line\n\nsecond paragraph",
		Status:    "passing",
	}
	msg := telegram.FormatMessage(s)
	if strings.Contains(msg, "second paragraph") {
		t.Error("multi-line commit message should only show first line")
	}
}

func TestFormatMessage_NoRunURL(t *testing.T) {
	s := telegram.CISummary{Status: "passing"}
	msg := telegram.FormatMessage(s)
	if strings.Contains(msg, "View run") {
		t.Error("should omit run link when RunURL is empty")
	}
}

func TestFormatMessage_NoSkippedWhenZero(t *testing.T) {
	s := telegram.CISummary{Passed: 5, Total: 5, Status: "passing"}
	msg := telegram.FormatMessage(s)
	if strings.Contains(msg, "skipped") {
		t.Error("should not mention skipped when skipped=0")
	}
}

func TestFormatMessage_HTMLEscapesExternalFields(t *testing.T) {
	s := telegram.CISummary{
		Repo:      "org/repo&co",
		Branch:    "feat/<bar>",
		CommitMsg: "fix Foo<T> generics",
		Status:    "passing",
	}
	msg := telegram.FormatMessage(s)

	if !strings.Contains(msg, "org/repo&amp;co") {
		t.Errorf("Repo '&' should be escaped to &amp;; got:\n%s", msg)
	}
	if !strings.Contains(msg, "feat/&lt;bar&gt;") {
		t.Errorf("Branch '<bar>' should be escaped; got:\n%s", msg)
	}
	if !strings.Contains(msg, "fix Foo&lt;T&gt; generics") {
		t.Errorf("CommitMsg '<T>' should be escaped; got:\n%s", msg)
	}
	if strings.Contains(msg, "<T>") {
		t.Errorf("raw <T> must not appear in output; got:\n%s", msg)
	}
	if strings.Contains(msg, "<bar>") {
		t.Errorf("raw <bar> must not appear in output; got:\n%s", msg)
	}
}

// --- SendMessage tests ---

func TestSendMessage_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("expected POST, got %s", r.Method)
		}
		if ct := r.Header.Get("Content-Type"); ct != "application/json" {
			t.Errorf("expected Content-Type: application/json, got %s", ct)
		}
		// Verify URL contains the token and method
		if !strings.Contains(r.URL.Path, "mytoken") {
			t.Errorf("URL should contain token, got path: %s", r.URL.Path)
		}
		if !strings.Contains(r.URL.Path, "sendMessage") {
			t.Errorf("URL should call sendMessage, got path: %s", r.URL.Path)
		}
		var body map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode body: %v", err)
		}
		if body["chat_id"] != "123" {
			t.Errorf("expected chat_id=123, got %v", body["chat_id"])
		}
		if body["text"] != "hello" {
			t.Errorf("expected text=hello, got %v", body["text"])
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]bool{"ok": true})
	}))
	defer srv.Close()

	client := telegram.NewClient("mytoken", "123", telegram.WithBaseURL(srv.URL))
	if err := client.SendMessage(context.Background(), "hello"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestSendMessage_APIError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"ok":          false,
			"description": "Bad Request: chat not found",
		})
	}))
	defer srv.Close()

	client := telegram.NewClient("mytoken", "bad-chat", telegram.WithBaseURL(srv.URL))
	err := client.SendMessage(context.Background(), "hello")
	if err == nil {
		t.Fatal("expected error for API failure")
	}
	if !strings.Contains(err.Error(), "chat not found") {
		t.Errorf("error should mention API response description, got: %v", err)
	}
}

func TestSendMessage_NetworkError(t *testing.T) {
	// Point at a closed server to simulate a network error.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	srv.Close() // close immediately

	client := telegram.NewClient("mytoken", "123", telegram.WithBaseURL(srv.URL))
	err := client.SendMessage(context.Background(), "hello")
	if err == nil {
		t.Fatal("expected error for network failure")
	}
}

func TestSendMessage_ContextCancellation(t *testing.T) {
	// Server that blocks forever
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	defer srv.Close()

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // already cancelled

	client := telegram.NewClient("mytoken", "123", telegram.WithBaseURL(srv.URL))
	err := client.SendMessage(ctx, "hello")
	if err == nil {
		t.Fatal("expected error for cancelled context")
	}
}
