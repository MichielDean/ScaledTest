package llm

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// TestMain installs a zero-delay backoff for all tests in this package so that
// retry tests do not slow the suite down.
func TestMain(m *testing.M) {
	retryBackoff = func(int) time.Duration { return 0 }
	os.Exit(m.Run())
}

// intPtr returns a pointer to n, used to set Config.MaxRetries in tests.
func intPtr(n int) *int { return &n }

// writeFakeScript writes a shell script to dir/<name>, makes it executable,
// and returns its path.
func writeFakeScript(t *testing.T, dir, name, body string) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte("#!/bin/sh\n"+body), 0755); err != nil {
		t.Fatalf("writeFakeScript: %v", err)
	}
	return path
}

// ---- New() ---------------------------------------------------------------

func TestNew_DefaultsToAnthropic_WhenProviderEmpty(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")

	p, err := New(Config{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if p == nil {
		t.Fatal("expected non-nil provider")
	}
}

func TestNew_Anthropic_SucceedsWhenKeySet(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")

	_, err := New(Config{Provider: "anthropic"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestNew_Anthropic_ReturnsErrMissingCredential_WhenKeyAbsent(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "")

	_, err := New(Config{Provider: "anthropic"})
	if !errors.Is(err, ErrMissingCredential) {
		t.Fatalf("want ErrMissingCredential, got %v", err)
	}
}

func TestNew_OpenAI_SucceedsWhenKeySet(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "test-key")

	_, err := New(Config{Provider: "openai"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestNew_OpenAI_ReturnsErrMissingCredential_WhenKeyAbsent(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "")

	_, err := New(Config{Provider: "openai"})
	if !errors.Is(err, ErrMissingCredential) {
		t.Fatalf("want ErrMissingCredential, got %v", err)
	}
}

func TestNew_UnknownProvider_ReturnsErrUnknownProvider(t *testing.T) {
	_, err := New(Config{Provider: "cohere"})
	if !errors.Is(err, ErrUnknownProvider) {
		t.Fatalf("want ErrUnknownProvider, got %v", err)
	}
}

// ---- cliProvider.Analyze -------------------------------------------------

func TestCLIProvider_Analyze_ReturnsJSONFromStdout(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")

	dir := t.TempDir()
	cmd := writeFakeScript(t, dir, "fakecli", `echo '{"status":"ok","count":3}'`)

	p, err := New(Config{Provider: "anthropic", Command: cmd})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	got, err := p.Analyze(context.Background(), "analyse these failures")
	if err != nil {
		t.Fatalf("Analyze: %v", err)
	}

	var result struct {
		Status string `json:"status"`
		Count  int    `json:"count"`
	}
	if err := json.Unmarshal(got, &result); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if result.Status != "ok" || result.Count != 3 {
		t.Fatalf("got %+v, want {status:ok count:3}", result)
	}
}

func TestCLIProvider_Analyze_PassesPromptToCommand(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")

	dir := t.TempDir()
	argsFile := filepath.Join(dir, "args.txt")
	script := fmt.Sprintf(`printf '%%s\n' "$@" > %s
echo '{}'`, argsFile)
	cmd := writeFakeScript(t, dir, "fakecli", script)

	p, err := New(Config{Provider: "anthropic", Command: cmd})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	const prompt = "analyse these failures"
	if _, err := p.Analyze(context.Background(), prompt); err != nil {
		t.Fatalf("Analyze: %v", err)
	}

	data, _ := os.ReadFile(argsFile)
	if !strings.Contains(string(data), prompt) {
		t.Fatalf("prompt %q not found in args: %s", prompt, data)
	}
}

func TestCLIProvider_Analyze_OpenAI_PassesPromptToCommand(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "test-key")

	dir := t.TempDir()
	argsFile := filepath.Join(dir, "args.txt")
	script := fmt.Sprintf(`printf '%%s\n' "$@" > %s
echo '{}'`, argsFile)
	cmd := writeFakeScript(t, dir, "fakecli", script)

	p, err := New(Config{Provider: "openai", Command: cmd})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	const prompt = "analyse openai failures"
	if _, err := p.Analyze(context.Background(), prompt); err != nil {
		t.Fatalf("Analyze: %v", err)
	}

	data, _ := os.ReadFile(argsFile)
	if !strings.Contains(string(data), prompt) {
		t.Fatalf("prompt %q not found in args: %s", prompt, data)
	}
}

func TestCLIProvider_Analyze_ReturnsErrorWhenOutputNotJSON(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")

	dir := t.TempDir()
	cmd := writeFakeScript(t, dir, "fakecli", `echo 'this is not json at all'`)

	p, err := New(Config{Provider: "anthropic", Command: cmd, MaxRetries: intPtr(0)})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	_, err = p.Analyze(context.Background(), "prompt")
	if err == nil {
		t.Fatal("expected error for non-JSON output")
	}
	if !strings.Contains(err.Error(), "not valid JSON") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestCLIProvider_Analyze_RetriesOnTransientFailure_ThenSucceeds(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")

	dir := t.TempDir()
	countFile := filepath.Join(dir, "count")
	os.WriteFile(countFile, []byte("0"), 0644)

	script := fmt.Sprintf(`
COUNT=$(cat %s 2>/dev/null || echo 0)
COUNT=$((COUNT+1))
echo $COUNT > %s
if [ "$COUNT" -le 2 ]; then
    echo "transient error" >&2
    exit 1
fi
echo '{"succeeded":true}'
`, countFile, countFile)
	cmd := writeFakeScript(t, dir, "fakecli", script)

	p, err := New(Config{
		Provider:   "anthropic",
		Command:    cmd,
		MaxRetries: intPtr(2),
		Timeout:    10 * time.Second,
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	got, err := p.Analyze(context.Background(), "prompt")
	if err != nil {
		t.Fatalf("Analyze: %v", err)
	}

	var result struct{ Succeeded bool }
	if err := json.Unmarshal(got, &result); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if !result.Succeeded {
		t.Fatalf("expected succeeded:true, got %s", got)
	}
}

func TestCLIProvider_Analyze_ReturnsErrorAfterAllRetriesExhausted(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")

	dir := t.TempDir()
	cmd := writeFakeScript(t, dir, "fakecli", `echo "always fails" >&2; exit 1`)

	p, err := New(Config{
		Provider:   "anthropic",
		Command:    cmd,
		MaxRetries: intPtr(2),
		Timeout:    10 * time.Second,
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	_, err = p.Analyze(context.Background(), "prompt")
	if err == nil {
		t.Fatal("expected error after all retries exhausted")
	}
	if !strings.Contains(err.Error(), "exited") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestCLIProvider_Analyze_ZeroRetries_MakesExactlyOneAttempt(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")

	dir := t.TempDir()
	countFile := filepath.Join(dir, "count")
	os.WriteFile(countFile, []byte("0"), 0644)

	script := fmt.Sprintf(`
COUNT=$(cat %s 2>/dev/null || echo 0)
COUNT=$((COUNT+1))
echo $COUNT > %s
echo "always fails" >&2
exit 1
`, countFile, countFile)
	cmd := writeFakeScript(t, dir, "fakecli", script)

	p, err := New(Config{
		Provider:   "anthropic",
		Command:    cmd,
		MaxRetries: intPtr(0),
		Timeout:    10 * time.Second,
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	_, err = p.Analyze(context.Background(), "prompt")
	if err == nil {
		t.Fatal("expected error")
	}

	data, _ := os.ReadFile(countFile)
	if strings.TrimSpace(string(data)) != "1" {
		t.Fatalf("expected exactly 1 attempt, got count=%s", strings.TrimSpace(string(data)))
	}
}

func TestCLIProvider_Analyze_RespectsContextDeadline(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")

	dir := t.TempDir()
	// exec replaces the shell process with sleep so that SIGKILL hits sleep
	// directly, avoiding orphan-child pipe-leak issues in tests.
	cmd := writeFakeScript(t, dir, "fakecli", `exec sleep 10`)

	p, err := New(Config{
		Provider:   "anthropic",
		Command:    cmd,
		MaxRetries: intPtr(0),
		Timeout:    30 * time.Second,
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	_, err = p.Analyze(ctx, "prompt")
	if err == nil {
		t.Fatal("expected error due to context deadline")
	}
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected DeadlineExceeded, got: %v", err)
	}
}

// ---- MockProvider --------------------------------------------------------

func TestMockProvider_Analyze_ReturnsConfiguredResponse(t *testing.T) {
	want := json.RawMessage(`{"mock":true}`)
	m := NewMock(want)

	got, err := m.Analyze(context.Background(), "prompt")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(got) != string(want) {
		t.Fatalf("got %s, want %s", got, want)
	}
}

func TestMockProvider_Analyze_RecordsCalls(t *testing.T) {
	m := NewMock(json.RawMessage(`{}`))

	prompts := []string{"first prompt", "second prompt", "third prompt"}
	for _, p := range prompts {
		m.Analyze(context.Background(), p)
	}

	calls := m.Calls()
	if len(calls) != len(prompts) {
		t.Fatalf("got %d calls, want %d", len(calls), len(prompts))
	}
	for i, want := range prompts {
		if calls[i] != want {
			t.Fatalf("call[%d]: got %q, want %q", i, calls[i], want)
		}
	}
}

func TestMockProvider_Analyze_ReturnsConfiguredError(t *testing.T) {
	m := NewMock(nil)
	want := errors.New("llm unavailable")
	m.SetError(want)

	_, err := m.Analyze(context.Background(), "prompt")
	if !errors.Is(err, want) {
		t.Fatalf("got %v, want %v", err, want)
	}
}
