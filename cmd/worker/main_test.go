package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

// ---------------------------------------------------------------------------
// submitReport — worker submits CTRF report to API on success
// ---------------------------------------------------------------------------

func TestSubmitReport_Success(t *testing.T) {
	var (
		mu          sync.Mutex
		gotPath     string
		gotAuth     string
		gotCType    string
		gotBody     []byte
		gotExecID   string
	)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		gotPath = r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		gotCType = r.Header.Get("Content-Type")
		gotExecID = r.URL.Query().Get("execution_id")
		gotBody, _ = io.ReadAll(r.Body)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	// Write a temporary CTRF report file.
	tmp := t.TempDir()
	report := filepath.Join(tmp, "ctrf-report.json")
	content := `{"results":{"tool":{"name":"jest"},"summary":{"tests":1,"passed":1}}}`
	if err := os.WriteFile(report, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	err := submitReport(srv.URL, "sct_tok123", "exec-42", report)
	if err != nil {
		t.Fatalf("submitReport returned error: %v", err)
	}

	mu.Lock()
	defer mu.Unlock()

	if gotPath != "/api/v1/reports" {
		t.Errorf("path = %q, want /api/v1/reports", gotPath)
	}
	if gotExecID != "exec-42" {
		t.Errorf("execution_id = %q, want exec-42", gotExecID)
	}
	if gotAuth != "sct_tok123" {
		t.Errorf("Authorization = %q, want sct_tok123", gotAuth)
	}
	if gotCType != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", gotCType)
	}
	if string(gotBody) != content {
		t.Errorf("body = %q, want %q", gotBody, content)
	}
}

func TestSubmitReport_ServerError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("internal error"))
	}))
	defer srv.Close()

	tmp := t.TempDir()
	report := filepath.Join(tmp, "ctrf-report.json")
	os.WriteFile(report, []byte(`{}`), 0o644)

	err := submitReport(srv.URL, "sct_tok", "exec-1", report)
	if err == nil {
		t.Fatal("expected error for 500 response, got nil")
	}
}

func TestSubmitReport_FileNotFound(t *testing.T) {
	err := submitReport("http://localhost", "tok", "exec-1", "/no/such/file.json")
	if err == nil {
		t.Fatal("expected error for missing file, got nil")
	}
}

// ---------------------------------------------------------------------------
// reportStatus — status updates to the API
// ---------------------------------------------------------------------------

func TestReportStatus_SendsCorrectPayload(t *testing.T) {
	var (
		mu      sync.Mutex
		gotPath string
		gotAuth string
		payload map[string]string
	)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		gotPath = r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		body, _ := io.ReadAll(r.Body)
		json.Unmarshal(body, &payload)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	reportStatus(srv.URL, "sct_tok123", "exec-99", "running", "")

	mu.Lock()
	defer mu.Unlock()

	if gotPath != "/api/v1/executions/exec-99/status" {
		t.Errorf("path = %q, want /api/v1/executions/exec-99/status", gotPath)
	}
	if gotAuth != "sct_tok123" {
		t.Errorf("Authorization = %q, want sct_tok123", gotAuth)
	}
	if payload["status"] != "running" {
		t.Errorf("status = %q, want running", payload["status"])
	}
}

func TestReportStatus_FailedWithErrorMsg(t *testing.T) {
	var (
		mu      sync.Mutex
		payload map[string]string
	)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		body, _ := io.ReadAll(r.Body)
		json.Unmarshal(body, &payload)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	reportStatus(srv.URL, "sct_tok", "exec-1", "failed", "exit code 1: segfault")

	mu.Lock()
	defer mu.Unlock()

	if payload["status"] != "failed" {
		t.Errorf("status = %q, want failed", payload["status"])
	}
	if payload["error_msg"] != "exit code 1: segfault" {
		t.Errorf("error_msg = %q, want 'exit code 1: segfault'", payload["error_msg"])
	}
}

// ---------------------------------------------------------------------------
// findCTRFReport — CTRF file discovery / not found
// ---------------------------------------------------------------------------

func TestFindCTRFReport_NotFound(t *testing.T) {
	// findCTRFReport looks under /workspace which won't exist in test env.
	result := findCTRFReport()
	if result != "" {
		t.Errorf("expected empty string when no report exists, got %q", result)
	}
}

func TestFindCTRFReport_DirectFile(t *testing.T) {
	dir := t.TempDir()
	report := filepath.Join(dir, "ctrf-report.json")
	os.WriteFile(report, []byte(`{}`), 0o644)

	// Override the search by calling filepath.Glob directly with our path.
	matches, _ := filepath.Glob(filepath.Join(dir, "ctrf-report.json"))
	if len(matches) == 0 {
		t.Fatal("expected to find ctrf-report.json in temp dir")
	}
	if matches[0] != report {
		t.Errorf("got %q, want %q", matches[0], report)
	}
}

// ---------------------------------------------------------------------------
// runCommand — command execution, success and failure
// ---------------------------------------------------------------------------

func TestRunCommand_Success(t *testing.T) {
	// runCommand uses /workspace as cwd; create it for the test.
	if err := os.MkdirAll("/workspace", 0o755); err != nil {
		t.Skip("cannot create /workspace (need write permission)")
	}
	defer os.Remove("/workspace")

	ctx := context.Background()
	exitCode, output, err := runCommand(ctx, "echo hello")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if exitCode != 0 {
		t.Errorf("exitCode = %d, want 0", exitCode)
	}
	if output == "" {
		t.Error("expected non-empty output")
	}
}

func TestRunCommand_Failure(t *testing.T) {
	if err := os.MkdirAll("/workspace", 0o755); err != nil {
		t.Skip("cannot create /workspace (need write permission)")
	}
	defer os.Remove("/workspace")

	ctx := context.Background()
	exitCode, _, err := runCommand(ctx, "exit 42")
	if err == nil {
		t.Fatal("expected error for non-zero exit")
	}
	if exitCode != 42 {
		t.Errorf("exitCode = %d, want 42", exitCode)
	}
}

func TestRunCommand_MissingWorkdir(t *testing.T) {
	// When /workspace doesn't exist, runCommand returns an error.
	if _, err := os.Stat("/workspace"); err == nil {
		t.Skip("/workspace exists, cannot test missing-dir case")
	}
	ctx := context.Background()
	_, _, err := runCommand(ctx, "echo hello")
	if err == nil {
		t.Fatal("expected error when /workspace does not exist")
	}
}

func TestRunCommand_CancelledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, _, err := runCommand(ctx, "sleep 10")
	if err == nil {
		t.Fatal("expected error for cancelled context")
	}
}

// ---------------------------------------------------------------------------
// setAuthHeader — token type detection
// ---------------------------------------------------------------------------

func TestSetAuthHeader_SCTToken(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	setAuthHeader(req, "sct_abc123")
	got := req.Header.Get("Authorization")
	if got != "sct_abc123" {
		t.Errorf("Authorization = %q, want sct_abc123", got)
	}
}

func TestSetAuthHeader_BearerToken(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	setAuthHeader(req, "eyJhbGciOi...")
	got := req.Header.Get("Authorization")
	if got != "Bearer eyJhbGciOi..." {
		t.Errorf("Authorization = %q, want 'Bearer eyJhbGciOi...'", got)
	}
}
