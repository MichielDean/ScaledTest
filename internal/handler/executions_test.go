package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)


func TestListExecutions_Unauthorized(t *testing.T) {
	h := &ExecutionsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/executions", nil)

	h.List(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("List without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestListExecutions_NoDB(t *testing.T) {
	h := &ExecutionsHandler{DB: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/executions", nil)
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.List(w, r)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("List without DB: got %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestCreateExecution_Unauthorized(t *testing.T) {
	h := &ExecutionsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/executions", strings.NewReader(`{"command":"npm test"}`))

	h.Create(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Create without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestCreateExecution_InvalidBody(t *testing.T) {
	h := &ExecutionsHandler{DB: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/executions", strings.NewReader(`{invalid}`))
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.Create(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Create with invalid body: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestCreateExecution_MissingCommand(t *testing.T) {
	h := &ExecutionsHandler{DB: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/executions", strings.NewReader(`{}`))
	r.Header.Set("Content-Type", "application/json")
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.Create(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Create without command: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestCreateExecution_NoDB(t *testing.T) {
	h := &ExecutionsHandler{DB: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/executions", strings.NewReader(`{"command":"npm test"}`))
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.Create(w, r)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Create without DB: got %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestGetExecution_Unauthorized(t *testing.T) {
	h := &ExecutionsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/executions/abc", nil)
	r = testWithChiParam(r, "executionID", "abc")

	h.Get(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Get without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestGetExecution_MissingID(t *testing.T) {
	h := &ExecutionsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/executions/", nil)
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")
	r = testWithChiParam(r, "executionID", "")

	h.Get(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Get with empty ID: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestGetExecution_NoDB(t *testing.T) {
	h := &ExecutionsHandler{DB: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/executions/abc", nil)
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")
	r = testWithChiParam(r, "executionID", "abc")

	h.Get(w, r)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Get without DB: got %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestCancelExecution_Unauthorized(t *testing.T) {
	h := &ExecutionsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("DELETE", "/api/v1/executions/abc", nil)
	r = testWithChiParam(r, "executionID", "abc")

	h.Cancel(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Cancel without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestCancelExecution_MissingID(t *testing.T) {
	h := &ExecutionsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("DELETE", "/api/v1/executions/", nil)
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")
	r = testWithChiParam(r, "executionID", "")

	h.Cancel(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Cancel with empty ID: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestCancelExecution_NoDB(t *testing.T) {
	h := &ExecutionsHandler{DB: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("DELETE", "/api/v1/executions/abc", nil)
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")
	r = testWithChiParam(r, "executionID", "abc")

	h.Cancel(w, r)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Cancel without DB: got %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestUpdateStatus_Unauthorized(t *testing.T) {
	h := &ExecutionsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("PUT", "/api/v1/executions/abc/status", strings.NewReader(`{"status":"running"}`))
	r = testWithChiParam(r, "executionID", "abc")

	h.UpdateStatus(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("UpdateStatus without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestUpdateStatus_InvalidBody(t *testing.T) {
	h := &ExecutionsHandler{DB: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("PUT", "/api/v1/executions/abc/status", strings.NewReader(`{invalid}`))
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")
	r = testWithChiParam(r, "executionID", "abc")

	h.UpdateStatus(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("UpdateStatus with invalid body: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestUpdateStatus_InvalidStatus(t *testing.T) {
	h := &ExecutionsHandler{DB: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("PUT", "/api/v1/executions/abc/status", strings.NewReader(`{"status":"invalid"}`))
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")
	r = testWithChiParam(r, "executionID", "abc")

	h.UpdateStatus(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("UpdateStatus with bad status: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestUpdateStatus_NoDB(t *testing.T) {
	h := &ExecutionsHandler{DB: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("PUT", "/api/v1/executions/abc/status", strings.NewReader(`{"status":"running"}`))
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")
	r = testWithChiParam(r, "executionID", "abc")

	h.UpdateStatus(w, r)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("UpdateStatus without DB: got %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestReportProgress_MissingID(t *testing.T) {
	h := &ExecutionsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/executions//progress", strings.NewReader(`{"total":10}`))
	r.Header.Set("Content-Type", "application/json")
	r = testWithClaims(r, testClaims)
	h.ReportProgress(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("ReportProgress missing ID: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestReportTestResult_MissingID(t *testing.T) {
	h := &ExecutionsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/executions//test-result", strings.NewReader(`{"name":"t1","status":"passed"}`))
	r.Header.Set("Content-Type", "application/json")
	r = testWithClaims(r, testClaims)
	h.ReportTestResult(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("ReportTestResult missing ID: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestReportWorkerStatus_MissingID(t *testing.T) {
	h := &ExecutionsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/executions//worker-status", strings.NewReader(`{"worker_id":"w1","status":"running"}`))
	r.Header.Set("Content-Type", "application/json")
	r = testWithClaims(r, testClaims)
	h.ReportWorkerStatus(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("ReportWorkerStatus missing ID: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestReportProgress_InvalidBody(t *testing.T) {
	h := &ExecutionsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/executions/exec-1/progress", strings.NewReader(`{bad json`))
	r.Header.Set("Content-Type", "application/json")
	r = testWithClaims(r, testClaims)
	r = testWithChiParam(r, "executionID", "exec-1")
	h.ReportProgress(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("ReportProgress invalid body: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestReportTestResult_InvalidBody(t *testing.T) {
	h := &ExecutionsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/executions/exec-1/test-result", strings.NewReader(`{bad`))
	r.Header.Set("Content-Type", "application/json")
	r = testWithClaims(r, testClaims)
	r = testWithChiParam(r, "executionID", "exec-1")
	h.ReportTestResult(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("ReportTestResult invalid body: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestReportWorkerStatus_InvalidBody(t *testing.T) {
	h := &ExecutionsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/executions/exec-1/worker-status", strings.NewReader(`{bad`))
	r.Header.Set("Content-Type", "application/json")
	r = testWithClaims(r, testClaims)
	r = testWithChiParam(r, "executionID", "exec-1")
	h.ReportWorkerStatus(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("ReportWorkerStatus invalid body: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestErrorResponse_Format(t *testing.T) {
	w := httptest.NewRecorder()
	Error(w, http.StatusBadRequest, "test error")

	if w.Code != http.StatusBadRequest {
		t.Errorf("Error status: got %d, want %d", w.Code, http.StatusBadRequest)
	}

	var resp map[string]string
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode error response: %v", err)
	}
	if resp["error"] != "test error" {
		t.Errorf("Error message: got %q, want %q", resp["error"], "test error")
	}
}
