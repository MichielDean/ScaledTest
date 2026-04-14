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
	"github.com/scaledtest/scaledtest/internal/store"
)

type mockReportsStore struct {
	listFunc                   func(ctx context.Context, filter store.ReportListFilter) ([]map[string]interface{}, int, error)
	createWithResultsFunc      func(ctx context.Context, p store.CreateReportParams, results []model.TestResult) error
	getFunc                    func(ctx context.Context, id, teamID string) (*model.TestReport, error)
	deleteFunc                 func(ctx context.Context, id, teamID string) (int64, error)
	executionExistsFunc        func(ctx context.Context, executionID, teamID string) (bool, error)
	getReportAndResultsFunc    func(ctx context.Context, id, teamID string) (*model.TestReport, map[string]*model.TestResult, error)
	getPreviousFailedTestsFunc func(ctx context.Context, teamID, currentReportID string) (map[string]bool, error)
}

func (m *mockReportsStore) List(ctx context.Context, filter store.ReportListFilter) ([]map[string]interface{}, int, error) {
	return m.listFunc(ctx, filter)
}
func (m *mockReportsStore) CreateWithResults(ctx context.Context, p store.CreateReportParams, results []model.TestResult) error {
	return m.createWithResultsFunc(ctx, p, results)
}
func (m *mockReportsStore) Get(ctx context.Context, id, teamID string) (*model.TestReport, error) {
	return m.getFunc(ctx, id, teamID)
}
func (m *mockReportsStore) Delete(ctx context.Context, id, teamID string) (int64, error) {
	return m.deleteFunc(ctx, id, teamID)
}
func (m *mockReportsStore) ExecutionExists(ctx context.Context, executionID, teamID string) (bool, error) {
	return m.executionExistsFunc(ctx, executionID, teamID)
}
func (m *mockReportsStore) GetReportAndResults(ctx context.Context, id, teamID string) (*model.TestReport, map[string]*model.TestResult, error) {
	return m.getReportAndResultsFunc(ctx, id, teamID)
}
func (m *mockReportsStore) GetPreviousFailedTests(ctx context.Context, teamID, currentReportID string) (map[string]bool, error) {
	return m.getPreviousFailedTestsFunc(ctx, teamID, currentReportID)
}

func TestReportsHandler_Get_WithStore(t *testing.T) {
	now := time.Now()
	ms := &mockReportsStore{
		getFunc: func(_ context.Context, id, teamID string) (*model.TestReport, error) {
			if id == "report-1" && teamID == "team-1" {
				return &model.TestReport{
					ID:        "report-1",
					TeamID:    "team-1",
					ToolName:  "jest",
					Summary:   json.RawMessage(`{"tests":5,"passed":4,"failed":1}`),
					CreatedAt: now,
				}, nil
			}
			return nil, pgx.ErrNoRows
		},
	}
	h := &ReportsHandler{ReportStore: ms}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/reports/report-1", nil)
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")
	r = testWithChiParam(r, "reportID", "report-1")

	h.Get(w, r)

	if w.Code != 200 {
		t.Errorf("Get with store: status = %d, want 200 (body: %s)", w.Code, w.Body.String())
	}
}

func TestReportsHandler_Get_WithStore_NotFound(t *testing.T) {
	ms := &mockReportsStore{
		getFunc: func(_ context.Context, _, _ string) (*model.TestReport, error) {
			return nil, pgx.ErrNoRows
		},
	}
	h := &ReportsHandler{ReportStore: ms}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/reports/nonexistent", nil)
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")
	r = testWithChiParam(r, "reportID", "nonexistent")

	h.Get(w, r)

	if w.Code != 404 {
		t.Errorf("Get not found: status = %d, want 404", w.Code)
	}
}

func TestReportsHandler_Delete_WithStore(t *testing.T) {
	ms := &mockReportsStore{
		deleteFunc: func(_ context.Context, id, teamID string) (int64, error) {
			return 1, nil
		},
	}
	h := &ReportsHandler{ReportStore: ms}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("DELETE", "/api/v1/reports/report-1", nil)
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")
	r = testWithChiParam(r, "reportID", "report-1")

	h.Delete(w, r)

	if w.Code != 200 {
		t.Errorf("Delete with store: status = %d, want 200", w.Code)
	}
}

func TestReportsHandler_Delete_WithStore_NotFound(t *testing.T) {
	ms := &mockReportsStore{
		deleteFunc: func(_ context.Context, _, _ string) (int64, error) {
			return 0, nil
		},
	}
	h := &ReportsHandler{ReportStore: ms}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("DELETE", "/api/v1/reports/nonexistent", nil)
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")
	r = testWithChiParam(r, "reportID", "nonexistent")

	h.Delete(w, r)

	if w.Code != 404 {
		t.Errorf("Delete not found: status = %d, want 404", w.Code)
	}
}

func TestReportsHandler_Create_WithStore_BulkInsert(t *testing.T) {
	var capturedResults []model.TestResult
	ms := &mockReportsStore{
		executionExistsFunc: func(_ context.Context, _, _ string) (bool, error) {
			return false, nil
		},
		createWithResultsFunc: func(_ context.Context, p store.CreateReportParams, results []model.TestResult) error {
			capturedResults = results
			return nil
		},
	}
	h := &ReportsHandler{ReportStore: ms}
	w := httptest.NewRecorder()
	report := `{"results":{"tool":{"name":"jest"},"summary":{"tests":3,"passed":2,"failed":1,"skipped":0,"pending":0,"other":0},"tests":[{"name":"t1","status":"passed","duration":100},{"name":"t2","status":"passed","duration":200},{"name":"t3","status":"failed","duration":300,"message":"oops"}]}}`
	r := httptest.NewRequest("POST", "/api/v1/reports", strings.NewReader(report))
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.Create(w, r)

	if w.Code != 201 {
		t.Errorf("Create with store: status = %d, want 201 (body: %s)", w.Code, w.Body.String())
	}
	if len(capturedResults) != 3 {
		t.Errorf("Create with store: expected 3 results, got %d", len(capturedResults))
	}
}

func TestReportsHandler_List_WithStore(t *testing.T) {
	ms := &mockReportsStore{
		listFunc: func(_ context.Context, filter store.ReportListFilter) ([]map[string]interface{}, int, error) {
			reports := []map[string]interface{}{
				{"id": "r1", "tool_name": "jest", "total": 10},
				{"id": "r2", "tool_name": "mocha", "total": 20},
			}
			return reports, 2, nil
		},
	}
	h := &ReportsHandler{ReportStore: ms}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/reports", nil)
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.List(w, r)

	if w.Code != 200 {
		t.Errorf("List with store: status = %d, want 200", w.Code)
	}
}

func TestReportsHandler_Create_WithStore_ExecutionExists(t *testing.T) {
	ms := &mockReportsStore{
		executionExistsFunc: func(_ context.Context, executionID, teamID string) (bool, error) {
			return executionID == "550e8400-e29b-41d4-a716-446655440000" && teamID == "team-1", nil
		},
		createWithResultsFunc: func(_ context.Context, p store.CreateReportParams, results []model.TestResult) error {
			return nil
		},
	}
	h := &ReportsHandler{ReportStore: ms}
	w := httptest.NewRecorder()
	report := `{"results":{"tool":{"name":"jest"},"summary":{"tests":1,"passed":1,"failed":0,"skipped":0,"pending":0,"other":0},"tests":[{"name":"t1","status":"passed","duration":10}]}}`
	r := httptest.NewRequest("POST", "/api/v1/reports?execution_id=550e8400-e29b-41d4-a716-446655440000", strings.NewReader(report))
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.Create(w, r)

	if w.Code != 201 {
		t.Errorf("Create with exec_id: status = %d, want 201 (body: %s)", w.Code, w.Body.String())
	}
}

func TestReportsHandler_Create_WithStore_ExecutionNotFound(t *testing.T) {
	ms := &mockReportsStore{
		executionExistsFunc: func(_ context.Context, _, _ string) (bool, error) {
			return false, nil
		},
	}
	h := &ReportsHandler{ReportStore: ms}
	w := httptest.NewRecorder()
	report := `{"results":{"tool":{"name":"jest"},"summary":{"tests":1,"passed":1,"failed":0,"skipped":0,"pending":0,"other":0},"tests":[{"name":"t1","status":"passed","duration":10}]}}`
	r := httptest.NewRequest("POST", "/api/v1/reports?execution_id=exec-nonexistent", strings.NewReader(report))
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.Create(w, r)

	if w.Code != 400 {
		t.Errorf("Create with bad exec_id: status = %d, want 400", w.Code)
	}
}

type mockAdminStore struct {
	listUsersFunc func(ctx context.Context, limit, offset int) ([]model.User, int, error)
}

func (m *mockAdminStore) ListUsers(ctx context.Context, limit, offset int) ([]model.User, int, error) {
	return m.listUsersFunc(ctx, limit, offset)
}

func TestReportsHandler_Create_WithStore_BulkInsert_LargeBatch(t *testing.T) {
	var capturedResults []model.TestResult
	ms := &mockReportsStore{
		executionExistsFunc: func(_ context.Context, _, _ string) (bool, error) {
			return false, nil
		},
		createWithResultsFunc: func(_ context.Context, p store.CreateReportParams, results []model.TestResult) error {
			capturedResults = results
			return nil
		},
	}
	h := &ReportsHandler{ReportStore: ms}
	w := httptest.NewRecorder()

	var testsJSON strings.Builder
	testsJSON.WriteString(`{"results":{"tool":{"name":"jest"},"summary":{"tests":200,"passed":180,"failed":15,"skipped":5,"pending":0,"other":0},"tests":[`)
	for i := 0; i < 200; i++ {
		if i > 0 {
			testsJSON.WriteByte(',')
		}
		status := "passed"
		if i%13 == 0 {
			status = "failed"
		}
		if i%40 == 0 {
			status = "skipped"
		}
		fmt.Fprintf(&testsJSON, `{"name":"bulk-test-%d","status":"%s","duration":%d}`, i, status, i*10)
	}
	testsJSON.WriteString(`]}}`)

	r := httptest.NewRequest("POST", "/api/v1/reports", strings.NewReader(testsJSON.String()))
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.Create(w, r)

	if w.Code != 201 {
		t.Errorf("Create with store bulk: status = %d, want 201 (body: %s)", w.Code, w.Body.String())
	}
	if len(capturedResults) != 200 {
		t.Errorf("Create with store bulk: expected 200 results passed in single CreateWithResults call, got %d", len(capturedResults))
	}
}

func TestAdminHandler_ListUsers_WithStore(t *testing.T) {
	ms := &mockAdminStore{
		listUsersFunc: func(_ context.Context, limit, offset int) ([]model.User, int, error) {
			return []model.User{
				{ID: "u1", Email: "admin@test.com", DisplayName: "Admin", Role: "owner"},
			}, 1, nil
		},
	}
	h := &AdminHandler{AdminStore: ms}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/admin/users", nil)
	r = testWithClaims(r, testClaims)

	h.ListUsers(w, r)

	if w.Code != http.StatusOK {
		t.Errorf("ListUsers with store: status = %d, want %d", w.Code, http.StatusOK)
	}

	var resp map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("unmarshal ListUsers: %v", err)
	}
	users, ok := resp["users"].([]interface{})
	if !ok {
		t.Fatal("expected users array in response")
	}
	if len(users) != 1 {
		t.Errorf("expected 1 user, got %d", len(users))
	}
}

func TestAdminHandler_ListUsers_WithStore_Empty(t *testing.T) {
	ms := &mockAdminStore{
		listUsersFunc: func(_ context.Context, _, _ int) ([]model.User, int, error) {
			return nil, 0, nil
		},
	}
	h := &AdminHandler{AdminStore: ms}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/admin/users", nil)
	r = testWithClaims(r, testClaims)

	h.ListUsers(w, r)

	if w.Code != http.StatusOK {
		t.Errorf("ListUsers empty: status = %d, want %d", w.Code, http.StatusOK)
	}
}
