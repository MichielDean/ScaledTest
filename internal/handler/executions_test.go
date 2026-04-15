package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/scaledtest/scaledtest/internal/model"
)

type mockExecutionsStore struct {
	listFn                       func(ctx context.Context, teamID string, limit, offset int) ([]model.TestExecution, int, error)
	createFn                     func(ctx context.Context, teamID, command string, configJSON []byte) (string, error)
	getFn                        func(ctx context.Context, id, teamID string) (*model.TestExecution, error)
	cancelFn                     func(ctx context.Context, id, teamID string, now time.Time) (int64, error)
	updateStatusFn               func(ctx context.Context, id, teamID, status string, now time.Time, errorMsg *string) (int64, error)
	existsFn                     func(ctx context.Context, id, teamID string) (bool, error)
	getK8sJobNameFn              func(ctx context.Context, id string) (*string, error)
	getK8sJobNameByTeamFn        func(ctx context.Context, id, teamID string) (*string, error)
	setK8sJobNameFn              func(ctx context.Context, id, jobName string, now time.Time) error
	getWorkerTokenSecretFn       func(ctx context.Context, id string) (*string, error)
	getWorkerTokenSecretByTeamFn func(ctx context.Context, id, teamID string) (*string, error)
	markFailedFn                 func(ctx context.Context, id, errorMsg string, now time.Time) error
}

func (m *mockExecutionsStore) List(ctx context.Context, teamID string, limit, offset int) ([]model.TestExecution, int, error) {
	return m.listFn(ctx, teamID, limit, offset)
}
func (m *mockExecutionsStore) Create(ctx context.Context, teamID, command string, configJSON []byte) (string, error) {
	return m.createFn(ctx, teamID, command, configJSON)
}
func (m *mockExecutionsStore) Get(ctx context.Context, id, teamID string) (*model.TestExecution, error) {
	return m.getFn(ctx, id, teamID)
}
func (m *mockExecutionsStore) Cancel(ctx context.Context, id, teamID string, now time.Time) (int64, error) {
	return m.cancelFn(ctx, id, teamID, now)
}
func (m *mockExecutionsStore) UpdateStatus(ctx context.Context, id, teamID, status string, now time.Time, errorMsg *string) (int64, error) {
	return m.updateStatusFn(ctx, id, teamID, status, now, errorMsg)
}
func (m *mockExecutionsStore) Exists(ctx context.Context, id, teamID string) (bool, error) {
	return m.existsFn(ctx, id, teamID)
}
func (m *mockExecutionsStore) GetK8sJobName(ctx context.Context, id string) (*string, error) {
	return m.getK8sJobNameFn(ctx, id)
}
func (m *mockExecutionsStore) GetK8sJobNameByTeam(ctx context.Context, id, teamID string) (*string, error) {
	if m.getK8sJobNameByTeamFn != nil {
		return m.getK8sJobNameByTeamFn(ctx, id, teamID)
	}
	return m.getK8sJobNameFn(ctx, id)
}
func (m *mockExecutionsStore) SetK8sJobName(ctx context.Context, id, jobName string, now time.Time) error {
	return m.setK8sJobNameFn(ctx, id, jobName, now)
}
func (m *mockExecutionsStore) GetWorkerTokenSecret(ctx context.Context, id string) (*string, error) {
	if m.getWorkerTokenSecretFn != nil {
		return m.getWorkerTokenSecretFn(ctx, id)
	}
	return nil, nil
}
func (m *mockExecutionsStore) GetWorkerTokenSecretByTeam(ctx context.Context, id, teamID string) (*string, error) {
	if m.getWorkerTokenSecretByTeamFn != nil {
		return m.getWorkerTokenSecretByTeamFn(ctx, id, teamID)
	}
	return m.GetWorkerTokenSecret(ctx, id)
}
func (m *mockExecutionsStore) MarkFailed(ctx context.Context, id, errorMsg string, now time.Time) error {
	return m.markFailedFn(ctx, id, errorMsg, now)
}
func (m *mockExecutionsStore) ListRunning(ctx context.Context) ([]model.TestExecution, error) {
	return nil, nil
}

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
	h := &ExecutionsHandler{ExecStore: nil}
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
	h := &ExecutionsHandler{ExecStore: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/executions", strings.NewReader(`{invalid}`))
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.Create(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Create with invalid body: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestCreateExecution_MissingCommand(t *testing.T) {
	h := &ExecutionsHandler{ExecStore: nil}
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
	h := &ExecutionsHandler{ExecStore: nil, DB: nil}
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
	h := &ExecutionsHandler{ExecStore: nil}
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
	h := &ExecutionsHandler{ExecStore: nil}
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
	h := &ExecutionsHandler{ExecStore: nil}
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
	h := &ExecutionsHandler{ExecStore: nil}
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
	h := &ExecutionsHandler{ExecStore: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("PUT", "/api/v1/executions/abc/status", strings.NewReader(`{"status":"running"}`))
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")
	r = testWithChiParam(r, "executionID", "abc")

	h.UpdateStatus(w, r)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("UpdateStatus without DB: got %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestReportProgress_Unauthorized(t *testing.T) {
	h := &ExecutionsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/executions/abc/progress", strings.NewReader(`{"total":1,"passed":1}`))
	r.Header.Set("Content-Type", "application/json")
	r = testWithChiParam(r, "executionID", "abc")

	h.ReportProgress(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("ReportProgress without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestReportProgress_NoDB(t *testing.T) {
	h := &ExecutionsHandler{ExecStore: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/executions/abc/progress", strings.NewReader(`{"total":1,"passed":1}`))
	r.Header.Set("Content-Type", "application/json")
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")
	r = testWithChiParam(r, "executionID", "abc")

	h.ReportProgress(w, r)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("ReportProgress without DB: got %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestReportTestResult_Unauthorized(t *testing.T) {
	h := &ExecutionsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/executions/abc/test-result", strings.NewReader(`{"name":"test","status":"passed"}`))
	r.Header.Set("Content-Type", "application/json")
	r = testWithChiParam(r, "executionID", "abc")

	h.ReportTestResult(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("ReportTestResult without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestReportTestResult_NoDB(t *testing.T) {
	h := &ExecutionsHandler{ExecStore: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/executions/abc/test-result", strings.NewReader(`{"name":"test","status":"passed"}`))
	r.Header.Set("Content-Type", "application/json")
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")
	r = testWithChiParam(r, "executionID", "abc")

	h.ReportTestResult(w, r)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("ReportTestResult without DB: got %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestReportWorkerStatus_Unauthorized(t *testing.T) {
	h := &ExecutionsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/executions/abc/worker-status", strings.NewReader(`{"worker_id":"w1","status":"running"}`))
	r.Header.Set("Content-Type", "application/json")
	r = testWithChiParam(r, "executionID", "abc")

	h.ReportWorkerStatus(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("ReportWorkerStatus without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestReportWorkerStatus_NoDB(t *testing.T) {
	h := &ExecutionsHandler{ExecStore: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/executions/abc/worker-status", strings.NewReader(`{"worker_id":"w1","status":"running"}`))
	r.Header.Set("Content-Type", "application/json")
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")
	r = testWithChiParam(r, "executionID", "abc")

	h.ReportWorkerStatus(w, r)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("ReportWorkerStatus without DB: got %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestReportProgress_CrossTeam_Forbidden(t *testing.T) {
	ms := &mockExecutionsStore{
		existsFn: func(_ context.Context, _, _ string) (bool, error) {
			return false, nil
		},
	}
	h := &ExecutionsHandler{ExecStore: ms}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/executions/exec-1/progress", strings.NewReader(`{"total":1,"passed":1}`))
	r.Header.Set("Content-Type", "application/json")
	r = testWithClaimsSimple(r, "user-1", "team-other", "owner")
	r = testWithChiParam(r, "executionID", "exec-1")

	h.ReportProgress(w, r)

	if w.Code != http.StatusNotFound {
		t.Errorf("ReportProgress cross-team: got %d, want %d", w.Code, http.StatusNotFound)
	}
}

func TestReportTestResult_CrossTeam_Forbidden(t *testing.T) {
	ms := &mockExecutionsStore{
		existsFn: func(_ context.Context, _, _ string) (bool, error) {
			return false, nil
		},
	}
	h := &ExecutionsHandler{ExecStore: ms}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/executions/exec-1/test-result", strings.NewReader(`{"name":"test","status":"passed"}`))
	r.Header.Set("Content-Type", "application/json")
	r = testWithClaimsSimple(r, "user-1", "team-other", "owner")
	r = testWithChiParam(r, "executionID", "exec-1")

	h.ReportTestResult(w, r)

	if w.Code != http.StatusNotFound {
		t.Errorf("ReportTestResult cross-team: got %d, want %d", w.Code, http.StatusNotFound)
	}
}

func TestReportWorkerStatus_CrossTeam_Forbidden(t *testing.T) {
	ms := &mockExecutionsStore{
		existsFn: func(_ context.Context, _, _ string) (bool, error) {
			return false, nil
		},
	}
	h := &ExecutionsHandler{ExecStore: ms}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/executions/exec-1/worker-status", strings.NewReader(`{"worker_id":"w1","status":"running"}`))
	r.Header.Set("Content-Type", "application/json")
	r = testWithClaimsSimple(r, "user-1", "team-other", "owner")
	r = testWithChiParam(r, "executionID", "exec-1")

	h.ReportWorkerStatus(w, r)

	if w.Code != http.StatusNotFound {
		t.Errorf("ReportWorkerStatus cross-team: got %d, want %d", w.Code, http.StatusNotFound)
	}
}

func TestReportProgress_DBError_Returns500(t *testing.T) {
	ms := &mockExecutionsStore{
		existsFn: func(_ context.Context, _, _ string) (bool, error) {
			return false, fmt.Errorf("connection refused")
		},
	}
	h := &ExecutionsHandler{ExecStore: ms}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/executions/exec-1/progress", strings.NewReader(`{"total":1,"passed":1}`))
	r.Header.Set("Content-Type", "application/json")
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")
	r = testWithChiParam(r, "executionID", "exec-1")

	h.ReportProgress(w, r)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("ReportProgress DB error: got %d, want %d", w.Code, http.StatusInternalServerError)
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

// Store-aware handler tests

func TestExecutionsHandler_List_WithStore(t *testing.T) {
	ms := &mockExecutionsStore{
		listFn: func(_ context.Context, _ string, _, _ int) ([]model.TestExecution, int, error) {
			return []model.TestExecution{{ID: "exec-1", Status: "pending"}}, 1, nil
		},
	}
	h := &ExecutionsHandler{ExecStore: ms}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/executions", nil)
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.List(w, r)

	if w.Code != http.StatusOK {
		t.Errorf("List with store: status = %d, want %d", w.Code, http.StatusOK)
	}
}

func TestExecutionsHandler_Get_WithStore_Found(t *testing.T) {
	ms := &mockExecutionsStore{
		getFn: func(_ context.Context, id, _ string) (*model.TestExecution, error) {
			return &model.TestExecution{ID: id, Status: "running"}, nil
		},
	}
	h := &ExecutionsHandler{ExecStore: ms}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/executions/exec-1", nil)
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")
	r = testWithChiParam(r, "executionID", "exec-1")

	h.Get(w, r)

	if w.Code != http.StatusOK {
		t.Errorf("Get with store: status = %d, want %d", w.Code, http.StatusOK)
	}
}

func TestExecutionsHandler_Get_WithStore_NotFound(t *testing.T) {
	ms := &mockExecutionsStore{
		getFn: func(_ context.Context, _, _ string) (*model.TestExecution, error) {
			return nil, pgx.ErrNoRows
		},
	}
	h := &ExecutionsHandler{ExecStore: ms}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/executions/nonexistent", nil)
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")
	r = testWithChiParam(r, "executionID", "nonexistent")

	h.Get(w, r)

	if w.Code != http.StatusNotFound {
		t.Errorf("Get not found: status = %d, want %d", w.Code, http.StatusNotFound)
	}
}

func TestExecutionsHandler_Cancel_WithStore(t *testing.T) {
	ms := &mockExecutionsStore{
		cancelFn: func(_ context.Context, _, _ string, _ time.Time) (int64, error) {
			return 1, nil
		},
	}
	h := &ExecutionsHandler{ExecStore: ms}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("DELETE", "/api/v1/executions/exec-1", nil)
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")
	r = testWithChiParam(r, "executionID", "exec-1")

	h.Cancel(w, r)

	if w.Code != http.StatusOK {
		t.Errorf("Cancel with store: status = %d, want %d", w.Code, http.StatusOK)
	}
}

func TestExecutionsHandler_Cancel_WithStore_NotFound(t *testing.T) {
	ms := &mockExecutionsStore{
		cancelFn: func(_ context.Context, _, _ string, _ time.Time) (int64, error) {
			return 0, nil
		},
	}
	h := &ExecutionsHandler{ExecStore: ms}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("DELETE", "/api/v1/executions/nonexistent", nil)
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")
	r = testWithChiParam(r, "executionID", "nonexistent")

	h.Cancel(w, r)

	if w.Code != http.StatusNotFound {
		t.Errorf("Cancel not found: status = %d, want %d", w.Code, http.StatusNotFound)
	}
}

func TestExecutionsHandler_Create_RequiresDB(t *testing.T) {
	ms := &mockExecutionsStore{
		createFn: func(_ context.Context, _, _ string, _ []byte) (string, error) {
			return "exec-new", nil
		},
	}
	h := &ExecutionsHandler{ExecStore: ms, DB: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/executions", strings.NewReader(`{"command":"npm test"}`))
	r.Header.Set("Content-Type", "application/json")
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.Create(w, r)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Create without DB pool: status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestExecutionsHandler_UpdateStatus_WithStore(t *testing.T) {
	ms := &mockExecutionsStore{
		updateStatusFn: func(_ context.Context, _, _, _ string, _ time.Time, _ *string) (int64, error) {
			return 1, nil
		},
	}
	h := &ExecutionsHandler{ExecStore: ms}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("PUT", "/api/v1/executions/exec-1/status", strings.NewReader(`{"status":"running"}`))
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")
	r = testWithChiParam(r, "executionID", "exec-1")

	h.UpdateStatus(w, r)

	if w.Code != http.StatusOK {
		t.Errorf("UpdateStatus with store: status = %d, want %d (body: %s)", w.Code, http.StatusOK, w.Body.String())
	}
}

func TestExecutionsHandler_UpdateStatus_WithStore_NotFound(t *testing.T) {
	ms := &mockExecutionsStore{
		updateStatusFn: func(_ context.Context, _, _, _ string, _ time.Time, _ *string) (int64, error) {
			return 0, nil
		},
	}
	h := &ExecutionsHandler{ExecStore: ms}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("PUT", "/api/v1/executions/nonexistent/status", strings.NewReader(`{"status":"running"}`))
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")
	r = testWithChiParam(r, "executionID", "nonexistent")

	h.UpdateStatus(w, r)

	if w.Code != http.StatusNotFound {
		t.Errorf("UpdateStatus not found: status = %d, want %d", w.Code, http.StatusNotFound)
	}
}

func TestExecutionsHandler_ReportProgress_Owned(t *testing.T) {
	ms := &mockExecutionsStore{
		existsFn: func(_ context.Context, _, _ string) (bool, error) {
			return true, nil
		},
	}
	h := &ExecutionsHandler{ExecStore: ms}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/executions/exec-1/progress", strings.NewReader(`{"total":1,"passed":1}`))
	r.Header.Set("Content-Type", "application/json")
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")
	r = testWithChiParam(r, "executionID", "exec-1")

	h.ReportProgress(w, r)

	if w.Code != http.StatusOK {
		t.Errorf("ReportProgress owned: status = %d, want %d", w.Code, http.StatusOK)
	}
}
