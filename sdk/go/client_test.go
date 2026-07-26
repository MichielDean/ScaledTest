package scaledtest

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

// testServer builds an httptest.Server whose handler dispatches to a per-method
// + path matcher. Each handler receives the request and returns (statusCode, body).
// If no matcher matches, the server returns 404. The handler also asserts the
// Authorization header is present when requireAuth is true.
type route struct {
	method string
	path   string
	h      func(t *testing.T, w http.ResponseWriter, r *http.Request)
}

func newTestServer(t *testing.T, routes []route) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	for _, rt := range routes {
		rt := rt
		mux.HandleFunc(rt.method+" "+rt.path, func(w http.ResponseWriter, r *http.Request) {
			rt.h(t, w, r)
		})
	}
	// Catch-all 404 so unmatched routes fail loudly with a JSON error.
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(t, w, http.StatusNotFound, map[string]string{"error": "no route for " + r.Method + " " + r.URL.Path})
	})
	return httptest.NewServer(mux)
}

func writeJSON(t *testing.T, w http.ResponseWriter, status int, body interface{}) {
	t.Helper()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		t.Fatalf("encode response: %v", err)
	}
}

func decodeBody(t *testing.T, r *http.Request) map[string]interface{} {
	t.Helper()
	raw, err := io.ReadAll(r.Body)
	if err != nil {
		t.Fatalf("read request body: %v", err)
	}
	if len(raw) == 0 {
		return nil
	}
	var out map[string]interface{}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("decode request body: %v (raw=%s)", err, string(raw))
	}
	return out
}

func mustAuth(t *testing.T, r *http.Request, want string) {
	t.Helper()
	got := r.Header.Get("Authorization")
	if got != "Bearer "+want {
		t.Fatalf("Authorization header = %q, want %q", got, "Bearer "+want)
	}
}

func mustNoAuth(t *testing.T, r *http.Request) {
	t.Helper()
	if got := r.Header.Get("Authorization"); got != "" {
		t.Fatalf("Authorization header unexpectedly set: %q", got)
	}
}

func mustHaveQuery(t *testing.T, r *http.Request, key, want string) {
	t.Helper()
	got := r.URL.Query().Get(key)
	if got != want {
		t.Fatalf("query %q = %q, want %q", key, got, want)
	}
}

func mustHaveContentType(t *testing.T, r *http.Request) {
	t.Helper()
	if ct := r.Header.Get("Content-Type"); ct != "application/json" {
		t.Fatalf("Content-Type = %q, want application/json", ct)
	}
}

func ptr[T any](v T) *T { return &v }

// ── Client construction ───────────────────────────────────────────────────────

func TestNewClient_ValidatesBaseURL(t *testing.T) {
	cases := []struct {
		name    string
		base    string
		wantErr string
	}{
		{"empty", "", "baseUrl is required"},
		{"non-http", "ftp://example.com", "must use http or https"},
		{"invalid", "://", "invalid baseUrl"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := NewClient(tc.base, WithToken("tok"))
			if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("err = %v, want substring %q", err, tc.wantErr)
			}
		})
	}
}

func TestNewClient_StripsTrailingSlash(t *testing.T) {
	c, err := NewClient("https://example.com/", WithToken("tok"))
	if err != nil {
		t.Fatal(err)
	}
	if c.BaseURL() != "https://example.com" {
		t.Fatalf("BaseURL = %q, want no trailing slash", c.BaseURL())
	}
	c2, err := NewClient("https://example.com///", WithToken("tok"))
	if err != nil {
		t.Fatal(err)
	}
	if c2.BaseURL() != "https://example.com" {
		t.Fatalf("BaseURL = %q, want all trailing slashes stripped", c2.BaseURL())
	}
}

func TestWithToken_RejectsEmpty(t *testing.T) {
	if _, err := NewClient("https://example.com", WithToken("")); err == nil {
		t.Fatal("expected error for empty token")
	}
}

func TestWithHTTPClient_RejectsNil(t *testing.T) {
	if _, err := NewClient("https://example.com", WithHTTPClient(nil), WithToken("tok")); err == nil {
		t.Fatal("expected error for nil http client")
	}
}

func TestWithTimeout_RejectsNegative(t *testing.T) {
	if _, err := NewClient("https://example.com", WithTimeout(-1*time.Second), WithToken("tok")); err == nil {
		t.Fatal("expected error for negative timeout")
	}
}

// ── Error decoding ────────────────────────────────────────────────────────────

func TestScaledTestError_Format(t *testing.T) {
	e := &ScaledTestError{Status: 404, Message: "not found"}
	if !strings.Contains(e.Error(), "404") || !strings.Contains(e.Error(), "not found") {
		t.Fatalf("unexpected error string: %q", e.Error())
	}
	e2 := &ScaledTestError{Status: 400, Code: "bad_request", Message: "nope"}
	if !strings.Contains(e2.Error(), `code "bad_request"`) {
		t.Fatalf("unexpected error string: %q", e2.Error())
	}
}

func TestIsScaledTestError(t *testing.T) {
	var err error = &ScaledTestError{Status: 500, Message: "boom"}
	if !IsScaledTestError(err) {
		t.Fatal("expected IsScaledTestError=true")
	}
	if ste, ok := AsScaledTestError(err); !ok || ste.Status != 500 {
		t.Fatalf("AsScaledTestError = %v, %v", ste, ok)
	}
	if IsScaledTestError(http.ErrServerClosed) {
		t.Fatal("expected IsScaledTestError=false for unrelated error")
	}
}

func TestClient_DecodesErrorEnvelope(t *testing.T) {
	srv := newTestServer(t, []route{
		{"GET", "/api/v1/reports/abc", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			writeJSON(t, w, http.StatusNotFound, map[string]string{"error": "report not found"})
		}},
	})
	defer srv.Close()

	c, err := NewClient(srv.URL, WithToken("tok"))
	if err != nil {
		t.Fatal(err)
	}
	_, err = c.Reports().Get(context.Background(), "abc")
	ste, ok := AsScaledTestError(err)
	if !ok {
		t.Fatalf("expected *ScaledTestError, got %T: %v", err, err)
	}
	if ste.Status != 404 || ste.Message != "report not found" {
		t.Fatalf("err = %+v", ste)
	}
}

func TestClient_DecodesErrorEnvelopeWithCode(t *testing.T) {
	srv := newTestServer(t, []route{
		{"GET", "/api/v1/reports/abc", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			writeJSON(t, w, http.StatusBadRequest, map[string]string{"error": "bad", "code": "invalid_id"})
		}},
	})
	defer srv.Close()

	c, err := NewClient(srv.URL, WithToken("tok"))
	if err != nil {
		t.Fatal(err)
	}
	_, err = c.Reports().Get(context.Background(), "abc")
	ste, ok := AsScaledTestError(err)
	if !ok || ste.Code != "invalid_id" {
		t.Fatalf("err = %+v, ok=%v", ste, ok)
	}
}

func TestClient_ErrorBodyUnparseable(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte("not json at all"))
	}))
	defer srv.Close()

	c, err := NewClient(srv.URL, WithToken("tok"))
	if err != nil {
		t.Fatal(err)
	}
	_, err = c.Reports().Get(context.Background(), "abc")
	ste, ok := AsScaledTestError(err)
	if !ok || ste.Status != 500 {
		t.Fatalf("err = %+v, ok=%v", ste, ok)
	}
	if !strings.Contains(ste.Message, "HTTP 500") {
		t.Fatalf("expected fallback message, got %q", ste.Message)
	}
}

// ── Context cancellation ──────────────────────────────────────────────────────

func TestClient_RespectsContextCancel(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Simulate a slow response so cancellation can fire.
		time.Sleep(50 * time.Millisecond)
		writeJSON(t, w, http.StatusOK, map[string]string{"status": "ok"})
	}))
	defer srv.Close()

	c, err := NewClient(srv.URL, WithToken("tok"))
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Millisecond)
	defer cancel()
	_, err = c.Health().Check(ctx)
	if err == nil {
		t.Fatal("expected context deadline error, got nil")
	}
}

// ── Reports ───────────────────────────────────────────────────────────────────

func TestReports_Upload(t *testing.T) {
	var capturedBody map[string]interface{}
	srv := newTestServer(t, []route{
		{"POST", "/api/v1/reports", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			mustHaveContentType(t, r)
			capturedBody = decodeBody(t, r)
			mustHaveQuery(t, r, "execution_id", "exec-1")
			mustHaveQuery(t, r, "triage_github_status", "true")
			writeJSON(t, w, http.StatusCreated, UploadReportResponse{
				ID:      "r1",
				Message: "report accepted",
				Tool:    "jest",
				Tests:   10,
				Results: 10,
			})
		}},
	})
	defer srv.Close()

	c, _ := NewClient(srv.URL, WithToken("tok"))
	resp, err := c.Reports().Upload(context.Background(),
		&CtrfReport{Results: CtrfResults{Tool: CtrfTool{Name: "jest"}, Summary: CtrfSummary{Tests: 10}, Tests: []CtrfTest{{Name: "t1", Status: "passed"}}}},
		&UploadReportParams{ExecutionID: "exec-1", TriageGitHubStatus: true})
	if err != nil {
		t.Fatal(err)
	}
	if resp.ID != "r1" || resp.Tests != 10 {
		t.Fatalf("resp = %+v", resp)
	}
	if capturedBody["results"] == nil {
		t.Fatalf("expected results in body, got %v", capturedBody)
	}
}

func TestReports_List(t *testing.T) {
	srv := newTestServer(t, []route{
		{"GET", "/api/v1/reports", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			mustHaveQuery(t, r, "limit", "20")
			mustHaveQuery(t, r, "offset", "5")
			mustHaveQuery(t, r, "since", "2026-01-01T00:00:00Z")
			writeJSON(t, w, http.StatusOK, ListReportsResponse{
				Reports: []Report{{ID: "r1", TeamID: "t1", Name: "jest"}},
				Total:   1,
			})
		}},
	})
	defer srv.Close()

	c, _ := NewClient(srv.URL, WithToken("tok"))
	out, err := c.Reports().List(context.Background(), &ListReportsParams{Limit: 20, Offset: 5, Since: "2026-01-01T00:00:00Z"})
	if err != nil {
		t.Fatal(err)
	}
	if out.Total != 1 || len(out.Reports) != 1 || out.Reports[0].ID != "r1" {
		t.Fatalf("out = %+v", out)
	}
}

func TestReports_Get(t *testing.T) {
	srv := newTestServer(t, []route{
		{"GET", "/api/v1/reports/r1", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			writeJSON(t, w, http.StatusOK, Report{ID: "r1", Name: "jest"})
		}},
	})
	defer srv.Close()
	c, _ := NewClient(srv.URL, WithToken("tok"))
	r, err := c.Reports().Get(context.Background(), "r1")
	if err != nil {
		t.Fatal(err)
	}
	if r.ID != "r1" {
		t.Fatalf("id = %q", r.ID)
	}

	if _, err := c.Reports().Get(context.Background(), ""); err == nil {
		t.Fatal("expected error for empty id")
	}
}

func TestReports_Delete(t *testing.T) {
	srv := newTestServer(t, []route{
		{"DELETE", "/api/v1/reports/r1", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			writeJSON(t, w, http.StatusOK, DeleteReportResponse{ID: "r1", Deleted: true})
		}},
	})
	defer srv.Close()
	c, _ := NewClient(srv.URL, WithToken("tok"))
	out, err := c.Reports().Delete(context.Background(), "r1")
	if err != nil {
		t.Fatal(err)
	}
	if !out.Deleted {
		t.Fatalf("out = %+v", out)
	}
}

func TestReports_Compare(t *testing.T) {
	srv := newTestServer(t, []route{
		{"GET", "/api/v1/reports/compare", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			mustHaveQuery(t, r, "base", "b1")
			mustHaveQuery(t, r, "head", "h1")
			writeJSON(t, w, http.StatusOK, ReportCompareResult{
				Base: CompareReport{ID: "b1"},
				Head: CompareReport{ID: "h1"},
				Diff: ReportDiff{Summary: ReportDiffSummary{BaseTests: 5, HeadTests: 6, NewFailures: 1}},
			})
		}},
	})
	defer srv.Close()
	c, _ := NewClient(srv.URL, WithToken("tok"))
	out, err := c.Reports().Compare(context.Background(), "b1", "h1")
	if err != nil {
		t.Fatal(err)
	}
	if out.Diff.Summary.NewFailures != 1 {
		t.Fatalf("out = %+v", out)
	}
	if _, err := c.Reports().Compare(context.Background(), "", "h1"); err == nil {
		t.Fatal("expected error for empty base")
	}
}

func TestReports_GetTriage(t *testing.T) {
	srv := newTestServer(t, []route{
		{"GET", "/api/v1/reports/r1/triage", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			writeJSON(t, w, http.StatusOK, ReportTriageResult{
				TriageStatus: "complete",
				Clusters:     []TriageCluster{{ID: "c1", RootCause: "timeout"}},
			})
		}},
	})
	defer srv.Close()
	c, _ := NewClient(srv.URL, WithToken("tok"))
	out, err := c.Reports().GetTriage(context.Background(), "r1")
	if err != nil {
		t.Fatal(err)
	}
	if out.TriageStatus != "complete" || len(out.Clusters) != 1 {
		t.Fatalf("out = %+v", out)
	}
}

func TestReports_RetryTriage(t *testing.T) {
	srv := newTestServer(t, []route{
		{"POST", "/api/v1/reports/r1/triage/retry", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			writeJSON(t, w, http.StatusAccepted, RetryTriageResponse{TriageStatus: "pending"})
		}},
	})
	defer srv.Close()
	c, _ := NewClient(srv.URL, WithToken("tok"))
	out, err := c.Reports().RetryTriage(context.Background(), "r1")
	if err != nil {
		t.Fatal(err)
	}
	if out.TriageStatus != "pending" {
		t.Fatalf("out = %+v", out)
	}
}

// ── Executions ────────────────────────────────────────────────────────────────

func TestExecutions_Create(t *testing.T) {
	srv := newTestServer(t, []route{
		{"POST", "/api/v1/executions", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			body := decodeBody(t, r)
			if body["command"] != "npm test" {
				t.Fatalf("command = %v", body["command"])
			}
			if body["image"] != "node:20" {
				t.Fatalf("image = %v", body["image"])
			}
			writeJSON(t, w, http.StatusCreated, CreateExecutionResponse{ID: "e1", Status: "pending", Command: "npm test"})
		}},
	})
	defer srv.Close()
	c, _ := NewClient(srv.URL, WithToken("tok"))
	out, err := c.Executions().Create(context.Background(), "npm test", &CreateExecutionOptions{Image: "node:20", EnvVars: map[string]string{"FOO": "bar"}})
	if err != nil {
		t.Fatal(err)
	}
	if out.ID != "e1" {
		t.Fatalf("id = %q", out.ID)
	}
	if _, err := c.Executions().Create(context.Background(), "", nil); err == nil {
		t.Fatal("expected error for empty command")
	}
}

func TestExecutions_List_Get_Cancel(t *testing.T) {
	srv := newTestServer(t, []route{
		{"GET", "/api/v1/executions", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			mustHaveQuery(t, r, "limit", "10")
			writeJSON(t, w, http.StatusOK, ListExecutionsResponse{Executions: []Execution{{ID: "e1"}}, Total: 1})
		}},
		{"GET", "/api/v1/executions/e1", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			writeJSON(t, w, http.StatusOK, Execution{ID: "e1", Status: ExecutionStatusRunning})
		}},
		{"DELETE", "/api/v1/executions/e1", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			writeJSON(t, w, http.StatusOK, CancelExecutionResponse{ID: "e1", Status: "cancelled"})
		}},
	})
	defer srv.Close()
	c, _ := NewClient(srv.URL, WithToken("tok"))

	lst, err := c.Executions().List(context.Background(), &ListExecutionsParams{Limit: 10})
	if err != nil || lst.Total != 1 {
		t.Fatalf("list err=%v out=%+v", err, lst)
	}
	g, err := c.Executions().Get(context.Background(), "e1")
	if err != nil || g.Status != ExecutionStatusRunning {
		t.Fatalf("get err=%v out=%+v", err, g)
	}
	del, err := c.Executions().Cancel(context.Background(), "e1")
	if err != nil || del.Status != "cancelled" {
		t.Fatalf("cancel err=%v out=%+v", err, del)
	}
	// Delete is alias for Cancel
	if _, err := c.Executions().Delete(context.Background(), "e1"); err == nil {
		// second call would hit 404; just check no panic
	}
}

func TestExecutions_UpdateStatus(t *testing.T) {
	srv := newTestServer(t, []route{
		{"PUT", "/api/v1/executions/e1/status", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			body := decodeBody(t, r)
			if body["status"] != "failed" || body["error_msg"] != "boom" {
				t.Fatalf("body = %v", body)
			}
			writeJSON(t, w, http.StatusOK, UpdateExecutionStatusResponse{ID: "e1", Status: "failed"})
		}},
	})
	defer srv.Close()
	c, _ := NewClient(srv.URL, WithToken("tok"))
	out, err := c.Executions().UpdateStatus(context.Background(), "e1", UpdateExecutionFailed, "boom")
	if err != nil || out.Status != "failed" {
		t.Fatalf("err=%v out=%+v", err, out)
	}
}

func TestExecutions_WorkerCallbacks(t *testing.T) {
	var lastPath string
	srv := newTestServer(t, []route{
		{"POST", "/api/v1/executions/e1/progress", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			lastPath = r.URL.Path
			body := decodeBody(t, r)
			if body["total"] != float64(10) {
				t.Fatalf("total = %v", body["total"])
			}
			writeJSON(t, w, http.StatusOK, ExecutionProgressResponse{ExecutionID: "e1", Received: true})
		}},
		{"POST", "/api/v1/executions/e1/test-result", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			lastPath = r.URL.Path
			body := decodeBody(t, r)
			if body["name"] != "test A" {
				t.Fatalf("name = %v", body["name"])
			}
			writeJSON(t, w, http.StatusOK, ExecutionReceivedResponse{ExecutionID: "e1", Received: true})
		}},
		{"POST", "/api/v1/executions/e1/worker-status", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			lastPath = r.URL.Path
			body := decodeBody(t, r)
			if body["worker_id"] != "w1" {
				t.Fatalf("worker_id = %v", body["worker_id"])
			}
			writeJSON(t, w, http.StatusOK, ExecutionReceivedResponse{ExecutionID: "e1", Received: true})
		}},
	})
	defer srv.Close()
	c, _ := NewClient(srv.URL, WithToken("tok"))

	p, err := c.Executions().ReportProgress(context.Background(), "e1", &ExecutionProgress{Passed: 5, Failed: 1, Skipped: 1, Total: 10})
	if err != nil || !p.Received {
		t.Fatalf("progress err=%v out=%+v", err, p)
	}
	if lastPath != "/api/v1/executions/e1/progress" {
		t.Fatalf("path = %q", lastPath)
	}

	tr, err := c.Executions().ReportTestResult(context.Background(), "e1", &TestResultEvent{Name: "test A", Status: TestResultFailed})
	if err != nil || !tr.Received {
		t.Fatalf("test-result err=%v out=%+v", err, tr)
	}

	ws, err := c.Executions().ReportWorkerStatus(context.Background(), "e1", &WorkerStatusEvent{WorkerID: "w1", Status: WorkerStatusRunning})
	if err != nil || !ws.Received {
		t.Fatalf("worker-status err=%v out=%+v", err, ws)
	}

	if _, err := c.Executions().ReportProgress(context.Background(), "e1", nil); err == nil {
		t.Fatal("expected error for nil progress")
	}
}

// ── Analytics ─────────────────────────────────────────────────────────────────

func TestAnalytics_AllEndpoints(t *testing.T) {
	srv := newTestServer(t, []route{
		{"GET", "/api/v1/analytics/trends", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			mustHaveQuery(t, r, "group_by", "week")
			writeJSON(t, w, http.StatusOK, TrendsResponse{Trends: []TrendPoint{{Date: "2026-01-01", PassRate: 0.9, Total: 10}}})
		}},
		{"GET", "/api/v1/analytics/flaky-tests", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			mustHaveQuery(t, r, "window_days", "7")
			writeJSON(t, w, http.StatusOK, FlakyTestsResponse{FlakyTests: []FlakyTest{{Name: "t1", FlipCount: 3}}})
		}},
		{"GET", "/api/v1/analytics/error-analysis", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			writeJSON(t, w, http.StatusOK, ErrorAnalysisResponse{Errors: []ErrorCluster{{Message: "timeout", Count: 2}}})
		}},
		{"GET", "/api/v1/analytics/duration-distribution", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			writeJSON(t, w, http.StatusOK, DurationDistributionResponse{Distribution: []DurationBucket{{Range: "0-100ms", Count: 5}}})
		}},
	})
	defer srv.Close()
	c, _ := NewClient(srv.URL, WithToken("tok"))

	tr, err := c.Analytics().GetTrends(context.Background(), &TrendsParams{GroupBy: "week"})
	if err != nil || len(tr.Trends) != 1 {
		t.Fatalf("trends err=%v out=%+v", err, tr)
	}
	ft, err := c.Analytics().GetFlakyTests(context.Background(), &FlakyTestsParams{WindowDays: 7})
	if err != nil || len(ft.FlakyTests) != 1 {
		t.Fatalf("flaky err=%v out=%+v", err, ft)
	}
	ea, err := c.Analytics().GetErrorAnalysis(context.Background(), nil)
	if err != nil || len(ea.Errors) != 1 {
		t.Fatalf("error-analysis err=%v out=%+v", err, ea)
	}
	dd, err := c.Analytics().GetDurationDistribution(context.Background(), nil)
	if err != nil || len(dd.Distribution) != 1 {
		t.Fatalf("duration-dist err=%v out=%+v", err, dd)
	}
}

// ── Quality Gates ─────────────────────────────────────────────────────────────

func TestQualityGates_CRUD(t *testing.T) {
	srv := newTestServer(t, []route{
		{"GET", "/api/v1/teams/t1/quality-gates", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			writeJSON(t, w, http.StatusOK, ListQualityGatesResponse{QualityGates: []QualityGate{{ID: "g1"}}, Total: 1})
		}},
		{"POST", "/api/v1/teams/t1/quality-gates", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			body := decodeBody(t, r)
			if body["name"] != "gate1" {
				t.Fatalf("name = %v", body["name"])
			}
			writeJSON(t, w, http.StatusCreated, QualityGate{ID: "g1", Name: "gate1"})
		}},
		{"GET", "/api/v1/teams/t1/quality-gates/g1", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			writeJSON(t, w, http.StatusOK, QualityGate{ID: "g1"})
		}},
		{"PUT", "/api/v1/teams/t1/quality-gates/g1", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			body := decodeBody(t, r)
			if body["enabled"] != false {
				t.Fatalf("enabled = %v", body["enabled"])
			}
			writeJSON(t, w, http.StatusOK, QualityGate{ID: "g1", Enabled: false})
		}},
		{"DELETE", "/api/v1/teams/t1/quality-gates/g1", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			writeJSON(t, w, http.StatusOK, DeleteQualityGateResponse{Message: "deleted"})
		}},
		{"POST", "/api/v1/teams/t1/quality-gates/g1/evaluate", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			body := decodeBody(t, r)
			if body["report_id"] != "r1" {
				t.Fatalf("report_id = %v", body["report_id"])
			}
			writeJSON(t, w, http.StatusOK, EvaluateQualityGateResponse{ID: "ev1", GateID: "g1", ReportID: "r1", Passed: true})
		}},
		{"GET", "/api/v1/teams/t1/quality-gates/g1/evaluations", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			mustHaveQuery(t, r, "limit", "5")
			writeJSON(t, w, http.StatusOK, ListEvaluationsResponse{Evaluations: []QualityGateEvaluation{{ID: "ev1"}}, Total: 1})
		}},
	})
	defer srv.Close()
	c, _ := NewClient(srv.URL, WithToken("tok"))

	lst, err := c.QualityGates().List(context.Background(), "t1")
	if err != nil || lst.Total != 1 {
		t.Fatalf("list err=%v out=%+v", err, lst)
	}
	enabled := false
	created, err := c.QualityGates().Create(context.Background(), "t1", &CreateQualityGateParams{
		Name:  "gate1",
		Rules: []QualityGateRule{{Type: "pass_rate", Params: json.RawMessage(`{"min":0.9}`)}},
	})
	if err != nil || created.ID != "g1" {
		t.Fatalf("create err=%v out=%+v", err, created)
	}
	g, err := c.QualityGates().Get(context.Background(), "t1", "g1")
	if err != nil || g.ID != "g1" {
		t.Fatalf("get err=%v out=%+v", err, g)
	}
	upd, err := c.QualityGates().Update(context.Background(), "t1", "g1", &UpdateQualityGateParams{
		Name:    "gate1",
		Rules:   []QualityGateRule{{Type: "pass_rate", Params: json.RawMessage(`{"min":0.9}`)}},
		Enabled: &enabled,
	})
	if err != nil || upd.Enabled {
		t.Fatalf("update err=%v out=%+v", err, upd)
	}
	del, err := c.QualityGates().Delete(context.Background(), "t1", "g1")
	if err != nil || del.Message != "deleted" {
		t.Fatalf("delete err=%v out=%+v", err, del)
	}
	ev, err := c.QualityGates().Evaluate(context.Background(), "t1", "g1", "r1")
	if err != nil || !ev.Passed {
		t.Fatalf("evaluate err=%v out=%+v", err, ev)
	}
	evs, err := c.QualityGates().ListEvaluations(context.Background(), "t1", "g1", 5)
	if err != nil || evs.Total != 1 {
		t.Fatalf("evaluations err=%v out=%+v", err, evs)
	}

	if _, err := c.QualityGates().Create(context.Background(), "t1", &CreateQualityGateParams{Name: "x"}); err == nil {
		t.Fatal("expected error for empty rules")
	}
	if _, err := c.QualityGates().Create(context.Background(), "", nil); err == nil {
		t.Fatal("expected error for empty team")
	}
}

// ── Teams ─────────────────────────────────────────────────────────────────────

func TestTeams_Basic(t *testing.T) {
	srv := newTestServer(t, []route{
		{"GET", "/api/v1/teams", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			writeJSON(t, w, http.StatusOK, ListTeamsResponse{Teams: []TeamWithRole{{Team: Team{ID: "t1", Name: "team1"}, Role: "owner"}}})
		}},
		{"POST", "/api/v1/teams", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			body := decodeBody(t, r)
			if body["name"] != "new team" {
				t.Fatalf("name = %v", body["name"])
			}
			writeJSON(t, w, http.StatusCreated, Team{ID: "t2", Name: "new team"})
		}},
		{"GET", "/api/v1/teams/t1", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			writeJSON(t, w, http.StatusOK, GetTeamResponse{Team: Team{ID: "t1", Name: "team1"}, Role: "owner"})
		}},
		{"DELETE", "/api/v1/teams/t1", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			writeJSON(t, w, http.StatusOK, DeleteTeamResponse{Message: "team deleted"})
		}},
	})
	defer srv.Close()
	c, _ := NewClient(srv.URL, WithToken("tok"))

	lst, err := c.Teams().List(context.Background())
	if err != nil || len(lst.Teams) != 1 {
		t.Fatalf("list err=%v out=%+v", err, lst)
	}
	created, err := c.Teams().Create(context.Background(), "new team")
	if err != nil || created.ID != "t2" {
		t.Fatalf("create err=%v out=%+v", err, created)
	}
	g, err := c.Teams().Get(context.Background(), "t1")
	if err != nil || g.Role != "owner" {
		t.Fatalf("get err=%v out=%+v", err, g)
	}
	del, err := c.Teams().Delete(context.Background(), "t1")
	if err != nil || del.Message != "team deleted" {
		t.Fatalf("delete err=%v out=%+v", err, del)
	}
	if _, err := c.Teams().Create(context.Background(), ""); err == nil {
		t.Fatal("expected error for empty name")
	}
}

func TestTeams_Tokens(t *testing.T) {
	srv := newTestServer(t, []route{
		{"GET", "/api/v1/teams/t1/tokens", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			writeJSON(t, w, http.StatusOK, ListTokensResponse{Tokens: []TeamToken{{ID: "tk1", Name: "ci"}}})
		}},
		{"POST", "/api/v1/teams/t1/tokens", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			body := decodeBody(t, r)
			if body["name"] != "ci" {
				t.Fatalf("name = %v", body["name"])
			}
			writeJSON(t, w, http.StatusCreated, CreateTokenResponse{Token: "sct_secret", ID: "tk1", Name: "ci"})
		}},
		{"DELETE", "/api/v1/teams/t1/tokens/tk1", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			writeJSON(t, w, http.StatusOK, DeleteTokenResponse{Message: "token revoked"})
		}},
	})
	defer srv.Close()
	c, _ := NewClient(srv.URL, WithToken("tok"))
	lst, err := c.Teams().ListTokens(context.Background(), "t1")
	if err != nil || len(lst.Tokens) != 1 {
		t.Fatalf("list err=%v", err)
	}
	created, err := c.Teams().CreateToken(context.Background(), "t1", "ci")
	if err != nil || created.Token != "sct_secret" {
		t.Fatalf("create err=%v out=%+v", err, created)
	}
	del, err := c.Teams().DeleteToken(context.Background(), "t1", "tk1")
	if err != nil || del.Message != "token revoked" {
		t.Fatalf("delete err=%v", err)
	}
}

func TestTeams_Webhooks(t *testing.T) {
	srv := newTestServer(t, []route{
		{"GET", "/api/v1/teams/t1/webhooks", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			writeJSON(t, w, http.StatusOK, ListWebhooksResponse{Webhooks: []Webhook{{ID: "w1"}}, Total: 1})
		}},
		{"POST", "/api/v1/teams/t1/webhooks", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			body := decodeBody(t, r)
			if body["url"] != "https://example.com/hook" {
				t.Fatalf("url = %v", body["url"])
			}
			writeJSON(t, w, http.StatusCreated, CreateWebhookResponse{Webhook: Webhook{ID: "w1"}, Secret: "whsec_x"})
		}},
		{"GET", "/api/v1/teams/t1/webhooks/w1", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			writeJSON(t, w, http.StatusOK, Webhook{ID: "w1"})
		}},
		{"PUT", "/api/v1/teams/t1/webhooks/w1", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			writeJSON(t, w, http.StatusOK, Webhook{ID: "w1"})
		}},
		{"DELETE", "/api/v1/teams/t1/webhooks/w1", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			writeJSON(t, w, http.StatusOK, DeleteWebhookResponse{Message: "webhook deleted"})
		}},
		{"GET", "/api/v1/teams/t1/webhooks/w1/deliveries", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			mustHaveQuery(t, r, "limit", "10")
			writeJSON(t, w, http.StatusOK, ListWebhookDeliveriesResponse{Deliveries: []WebhookDelivery{{ID: "d1"}}, Total: 1})
		}},
		{"POST", "/api/v1/teams/t1/webhooks/w1/deliveries/d1/retry", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			writeJSON(t, w, http.StatusOK, RetryWebhookDeliveryResponse{Success: true, StatusCode: 200})
		}},
	})
	defer srv.Close()
	c, _ := NewClient(srv.URL, WithToken("tok"))

	lst, err := c.Teams().ListWebhooks(context.Background(), "t1")
	if err != nil || lst.Total != 1 {
		t.Fatalf("list err=%v", err)
	}
	created, err := c.Teams().CreateWebhook(context.Background(), "t1", "https://example.com/hook", []WebhookEventType{WebhookEventReportSubmitted})
	if err != nil || created.Secret != "whsec_x" {
		t.Fatalf("create err=%v out=%+v", err, created)
	}
	if _, err := c.Teams().GetWebhook(context.Background(), "t1", "w1"); err != nil {
		t.Fatal(err)
	}
	enabled := true
	if _, err := c.Teams().UpdateWebhook(context.Background(), "t1", "w1", &UpdateWebhookParams{URL: "https://example.com/hook", Events: []WebhookEventType{WebhookEventGateFailed}, Enabled: &enabled}); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Teams().DeleteWebhook(context.Background(), "t1", "w1"); err != nil {
		t.Fatal(err)
	}
	dels, err := c.Teams().ListWebhookDeliveries(context.Background(), "t1", "w1", &ListWebhookDeliveriesParams{Limit: 10})
	if err != nil || dels.Total != 1 {
		t.Fatalf("deliveries err=%v", err)
	}
	retry, err := c.Teams().RetryWebhookDelivery(context.Background(), "t1", "w1", "d1")
	if err != nil || !retry.Success {
		t.Fatalf("retry err=%v", err)
	}
	if _, err := c.Teams().CreateWebhook(context.Background(), "t1", "", nil); err == nil {
		t.Fatal("expected error for empty url")
	}
}

func TestTeams_Invitations(t *testing.T) {
	srv := newTestServer(t, []route{
		{"GET", "/api/v1/teams/t1/invitations", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			writeJSON(t, w, http.StatusOK, ListInvitationsResponse{Invitations: []Invitation{{ID: "i1", Email: "a@b.com"}}})
		}},
		{"POST", "/api/v1/teams/t1/invitations", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			body := decodeBody(t, r)
			if body["email"] != "a@b.com" || body["role"] != "maintainer" {
				t.Fatalf("body = %v", body)
			}
			writeJSON(t, w, http.StatusCreated, CreateInvitationResponse{Invitation: Invitation{ID: "i1", Email: "a@b.com"}, Token: "inv_x"})
		}},
		{"DELETE", "/api/v1/teams/t1/invitations/i1", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			writeJSON(t, w, http.StatusOK, RevokeInvitationResponse{Message: "invitation revoked"})
		}},
	})
	defer srv.Close()
	c, _ := NewClient(srv.URL, WithToken("tok"))
	lst, err := c.Teams().ListInvitations(context.Background(), "t1")
	if err != nil || len(lst.Invitations) != 1 {
		t.Fatalf("list err=%v", err)
	}
	created, err := c.Teams().CreateInvitation(context.Background(), "t1", "a@b.com", "maintainer")
	if err != nil || created.Token != "inv_x" {
		t.Fatalf("create err=%v out=%+v", err, created)
	}
	if _, err := c.Teams().RevokeInvitation(context.Background(), "t1", "i1"); err != nil {
		t.Fatal(err)
	}
}

// ── Sharding ──────────────────────────────────────────────────────────────────

func TestSharding_All(t *testing.T) {
	srv := newTestServer(t, []route{
		{"POST", "/api/v1/sharding/plan", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			body := decodeBody(t, r)
			if body["num_workers"] != float64(2) {
				t.Fatalf("num_workers = %v", body["num_workers"])
			}
			writeJSON(t, w, http.StatusOK, ShardPlan{ExecutionID: "e1", TotalWorkers: 2, Strategy: "duration_balanced"})
		}},
		{"POST", "/api/v1/sharding/rebalance", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			body := decodeBody(t, r)
			if body["failed_worker_id"] != "w1" {
				t.Fatalf("failed_worker_id = %v", body["failed_worker_id"])
			}
			writeJSON(t, w, http.StatusOK, ShardPlan{ExecutionID: "e1", TotalWorkers: 1})
		}},
		{"GET", "/api/v1/sharding/durations", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			mustHaveQuery(t, r, "suite", "api")
			writeJSON(t, w, http.StatusOK, ListShardDurationsResponse{Durations: []TestDurationHistory{{ID: "d1", TestName: "t1"}}, Total: 1})
		}},
		{"GET", "/api/v1/sharding/durations/t1", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			writeJSON(t, w, http.StatusOK, []TestDurationHistory{{ID: "d1", TestName: "t1"}})
		}},
	})
	defer srv.Close()
	c, _ := NewClient(srv.URL, WithToken("tok"))

	plan, err := c.Sharding().CreatePlan(context.Background(), &CreateShardPlanRequest{TestNames: []string{"t1", "t2"}, NumWorkers: 2})
	if err != nil || plan.TotalWorkers != 2 {
		t.Fatalf("plan err=%v out=%+v", err, plan)
	}
	reb, err := c.Sharding().Rebalance(context.Background(), &RebalanceShardsRequest{ExecutionID: "e1", FailedWorkerID: "w1", CurrentPlan: ShardPlan{ExecutionID: "e1"}})
	if err != nil || reb.TotalWorkers != 1 {
		t.Fatalf("rebalance err=%v out=%+v", err, reb)
	}
	durs, err := c.Sharding().ListDurations(context.Background(), "api")
	if err != nil || durs.Total != 1 {
		t.Fatalf("durations err=%v", err)
	}
	one, err := c.Sharding().GetDuration(context.Background(), "t1")
	if err != nil || len(one) != 1 {
		t.Fatalf("get-duration err=%v out=%+v", err, one)
	}
	if _, err := c.Sharding().CreatePlan(context.Background(), &CreateShardPlanRequest{NumWorkers: 2}); err == nil {
		t.Fatal("expected error for empty test_names")
	}
	if _, err := c.Sharding().CreatePlan(context.Background(), &CreateShardPlanRequest{TestNames: []string{"t1"}}); err == nil {
		t.Fatal("expected error for zero workers")
	}
}

// ── Auth ──────────────────────────────────────────────────────────────────────

func TestAuth_Register_Login(t *testing.T) {
	srv := newTestServer(t, []route{
		{"POST", "/auth/register", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustNoAuth(t, r)
			body := decodeBody(t, r)
			if body["email"] != "a@b.com" {
				t.Fatalf("email = %v", body["email"])
			}
			writeJSON(t, w, http.StatusCreated, AuthResponse{User: UserProfile{ID: "u1", Email: "a@b.com"}, AccessToken: "access-1"})
		}},
		{"POST", "/auth/login", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustNoAuth(t, r)
			writeJSON(t, w, http.StatusOK, AuthResponse{User: UserProfile{ID: "u1"}, AccessToken: "access-1"})
		}},
		{"POST", "/auth/refresh", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			// Refresh uses the refresh token in place of the access token for this test.
			if got := r.Header.Get("Authorization"); got != "Bearer refresh-1" {
				t.Fatalf("Authorization = %q, want Bearer refresh-1", got)
			}
			writeJSON(t, w, http.StatusOK, RefreshTokenResponse{User: UserProfile{ID: "u1"}, AccessToken: "access-2"})
		}},
	})
	defer srv.Close()
	c, _ := NewClient(srv.URL, WithToken("ignored-for-register"))

	reg, err := c.Auth().Register(context.Background(), &RegisterRequest{Email: "a@b.com", Password: "password1", DisplayName: "Alice"})
	if err != nil || reg.AccessToken != "access-1" {
		t.Fatalf("register err=%v out=%+v", err, reg)
	}
	login, err := c.Auth().Login(context.Background(), &LoginRequest{Email: "a@b.com", Password: "password1"})
	if err != nil || login.AccessToken != "access-1" {
		t.Fatalf("login err=%v out=%+v", err, login)
	}
	// RefreshWithToken sends the refresh token as the bearer for this single
	// request and must not mutate the client's configured token.
	ref, err := c.Auth().RefreshWithToken(context.Background(), "refresh-1")
	if err != nil || ref.AccessToken != "access-2" {
		t.Fatalf("refresh err=%v out=%+v", err, ref)
	}
	if c.token != "ignored-for-register" {
		t.Fatalf("client token mutated by RefreshWithToken: %q", c.token)
	}
	if _, err := c.Auth().Register(context.Background(), &RegisterRequest{Email: "a@b.com"}); err == nil {
		t.Fatal("expected error for missing password")
	}
}

func TestAuth_Me_AndProfile(t *testing.T) {
	srv := newTestServer(t, []route{
		{"GET", "/api/v1/auth/me", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			writeJSON(t, w, http.StatusOK, UserProfile{ID: "u1", Email: "a@b.com", DisplayName: "Alice", Role: "owner"})
		}},
		{"PATCH", "/api/v1/auth/me", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			body := decodeBody(t, r)
			if body["display_name"] != "Bob" {
				t.Fatalf("display_name = %v", body["display_name"])
			}
			writeJSON(t, w, http.StatusOK, UserProfile{ID: "u1", DisplayName: "Bob"})
		}},
		{"POST", "/api/v1/auth/change-password", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			body := decodeBody(t, r)
			if body["new_password"] != "newpass1" {
				t.Fatalf("new_password = %v", body["new_password"])
			}
			writeJSON(t, w, http.StatusOK, ChangePasswordResponse{Message: "password changed"})
		}},
	})
	defer srv.Close()
	c, _ := NewClient(srv.URL, WithToken("tok"))
	me, err := c.Auth().GetMe(context.Background())
	if err != nil || me.DisplayName != "Alice" {
		t.Fatalf("me err=%v out=%+v", err, me)
	}
	upd, err := c.Auth().UpdateProfile(context.Background(), "Bob")
	if err != nil || upd.DisplayName != "Bob" {
		t.Fatalf("update err=%v out=%+v", err, upd)
	}
	pw, err := c.Auth().ChangePassword(context.Background(), "oldpass1", "newpass1")
	if err != nil || pw.Message != "password changed" {
		t.Fatalf("change-password err=%v out=%+v", err, pw)
	}
}

// ── Admin ─────────────────────────────────────────────────────────────────────

func TestAdmin(t *testing.T) {
	srv := newTestServer(t, []route{
		{"GET", "/api/v1/admin/users", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			mustHaveQuery(t, r, "limit", "10")
			writeJSON(t, w, http.StatusOK, ListUsersResponse{Users: []AdminUser{{ID: "u1"}}, Total: 1})
		}},
		{"GET", "/api/v1/admin/audit-log", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustAuth(t, r, "tok")
			mustHaveQuery(t, r, "action", "report.submitted")
			writeJSON(t, w, http.StatusOK, ListAuditLogResponse{AuditLog: []AuditLog{{ID: "a1", Action: "report.submitted"}}, Total: 1})
		}},
	})
	defer srv.Close()
	c, _ := NewClient(srv.URL, WithToken("tok"))
	users, err := c.Admin().ListUsers(context.Background(), &ListUsersParams{Limit: 10})
	if err != nil || users.Total != 1 {
		t.Fatalf("users err=%v", err)
	}
	audit, err := c.Admin().ListAuditLog(context.Background(), &ListAuditLogParams{Action: "report.submitted"})
	if err != nil || audit.Total != 1 {
		t.Fatalf("audit err=%v", err)
	}
}

// ── Health ────────────────────────────────────────────────────────────────────

func TestHealth_Check(t *testing.T) {
	srv := newTestServer(t, []route{
		{"GET", "/health", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustNoAuth(t, r)
			writeJSON(t, w, http.StatusOK, HealthResponse{Status: "ok", Timestamp: time.Now()})
		}},
	})
	defer srv.Close()
	c, _ := NewClient(srv.URL, WithToken("tok"))
	h, err := c.Health().Check(context.Background())
	if err != nil || h.Status != "ok" {
		t.Fatalf("health err=%v out=%+v", err, h)
	}
}

// ── Invitations (public) ──────────────────────────────────────────────────────

func TestInvitations_Public(t *testing.T) {
	srv := newTestServer(t, []route{
		{"GET", "/api/v1/invitations/inv_x", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustNoAuth(t, r)
			writeJSON(t, w, http.StatusOK, InvitationPreview{Email: "a@b.com", Role: "maintainer", TeamName: "team1"})
		}},
		{"POST", "/api/v1/invitations/inv_x/accept", func(t *testing.T, w http.ResponseWriter, r *http.Request) {
			mustNoAuth(t, r)
			body := decodeBody(t, r)
			if body["display_name"] != "Alice" {
				t.Fatalf("display_name = %v", body["display_name"])
			}
			writeJSON(t, w, http.StatusOK, AcceptInvitationResponse{Message: "invitation accepted", UserID: "u1", TeamID: "t1", Role: "maintainer"})
		}},
	})
	defer srv.Close()
	c, _ := NewClient(srv.URL)
	prev, err := c.Invitations().Preview(context.Background(), "inv_x")
	if err != nil || prev.TeamName != "team1" {
		t.Fatalf("preview err=%v out=%+v", err, prev)
	}
	acc, err := c.Invitations().Accept(context.Background(), "inv_x", &AcceptInvitationRequest{Password: "password1", DisplayName: "Alice"})
	if err != nil || acc.UserID != "u1" {
		t.Fatalf("accept err=%v out=%+v", err, acc)
	}
	if _, err := c.Invitations().Preview(context.Background(), ""); err == nil {
		t.Fatal("expected error for empty token")
	}
}

// ── Query helpers ─────────────────────────────────────────────────────────────

func TestAddQuery_SkipsEmpty(t *testing.T) {
	q := addQuery(nil, "a", "")
	if q != nil {
		t.Fatalf("expected nil for empty value, got %v", q)
	}
	q = addQuery(nil, "a", "v")
	if q.Get("a") != "v" {
		t.Fatalf("expected a=v, got %v", q)
	}
}

func TestAddInt_SkipsNonPositive(t *testing.T) {
	if q := addInt(nil, "limit", 0); q != nil {
		t.Fatalf("expected nil for zero, got %v", q)
	}
	if q := addInt(nil, "limit", -1); q != nil {
		t.Fatalf("expected nil for negative, got %v", q)
	}
}

func TestPathEscape(t *testing.T) {
	// Verify path segments with slashes are escaped so path injection cannot
	// escape the resource scope.
	got := pathEscape("a/b")
	want := url.PathEscape("a/b")
	if got != want {
		t.Fatalf("pathEscape = %q, want %q", got, want)
	}
}
