package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/scaledtest/scaledtest/internal/ctrf"
	"github.com/scaledtest/scaledtest/internal/model"
)


func TestListReports_Unauthorized(t *testing.T) {
	h := &ReportsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/reports", nil)

	h.List(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("List without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestListReports_NoDB(t *testing.T) {
	h := &ReportsHandler{DB: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/reports", nil)
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.List(w, r)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("List without DB: got %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestCreateReport_Unauthorized(t *testing.T) {
	h := &ReportsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/reports", strings.NewReader(`{}`))

	h.Create(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Create without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestCreateReport_InvalidJSON(t *testing.T) {
	h := &ReportsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/reports", strings.NewReader(`{invalid}`))
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.Create(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Create with invalid JSON: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestCreateReport_InvalidCTRF(t *testing.T) {
	h := &ReportsHandler{}
	w := httptest.NewRecorder()
	// Valid JSON but invalid CTRF (missing tool name)
	r := httptest.NewRequest("POST", "/api/v1/reports", strings.NewReader(`{"results":{"tool":{},"summary":{"tests":1},"tests":[{"name":"t","status":"passed"}]}}`))
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.Create(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Create with invalid CTRF: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestCreateReport_NoDB_Fallback(t *testing.T) {
	h := &ReportsHandler{DB: nil}
	w := httptest.NewRecorder()
	report := `{"results":{"tool":{"name":"jest"},"summary":{"tests":2,"passed":1,"failed":1,"skipped":0,"pending":0,"other":0},"tests":[{"name":"test1","status":"passed","duration":100},{"name":"test2","status":"failed","duration":200,"message":"oops"}]}}`
	r := httptest.NewRequest("POST", "/api/v1/reports", strings.NewReader(report))
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.Create(w, r)

	if w.Code != http.StatusCreated {
		t.Errorf("Create without DB (fallback): got %d, want %d (body: %s)", w.Code, http.StatusCreated, w.Body.String())
	}

	var resp map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp["tool"] != "jest" {
		t.Errorf("tool = %v, want jest", resp["tool"])
	}
	if resp["tests"] != float64(2) {
		t.Errorf("tests = %v, want 2", resp["tests"])
	}
}

func TestCreateReport_NoDB_WithExecutionID(t *testing.T) {
	h := &ReportsHandler{DB: nil}
	w := httptest.NewRecorder()
	report := `{"results":{"tool":{"name":"mocha"},"summary":{"tests":1,"passed":1,"failed":0,"skipped":0,"pending":0,"other":0},"tests":[{"name":"t1","status":"passed","duration":50}]}}`
	r := httptest.NewRequest("POST", "/api/v1/reports?execution_id=exec-123", strings.NewReader(report))
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.Create(w, r)

	if w.Code != http.StatusCreated {
		t.Errorf("Create with execution_id: got %d, want %d", w.Code, http.StatusCreated)
	}

	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["execution_id"] != "exec-123" {
		t.Errorf("execution_id = %v, want exec-123", resp["execution_id"])
	}
}

func TestGetReport_Unauthorized(t *testing.T) {
	h := &ReportsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/reports/abc", nil)
	r = testWithChiParam(r, "reportID", "abc")

	h.Get(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Get without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestGetReport_MissingID(t *testing.T) {
	h := &ReportsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/reports/", nil)
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")
	r = testWithChiParam(r, "reportID", "")

	h.Get(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Get with empty ID: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestGetReport_NoDB(t *testing.T) {
	h := &ReportsHandler{DB: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/reports/abc", nil)
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")
	r = testWithChiParam(r, "reportID", "abc")

	h.Get(w, r)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Get without DB: got %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestDeleteReport_Unauthorized(t *testing.T) {
	h := &ReportsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("DELETE", "/api/v1/reports/abc", nil)
	r = testWithChiParam(r, "reportID", "abc")

	h.Delete(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Delete without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestDeleteReport_MissingID(t *testing.T) {
	h := &ReportsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("DELETE", "/api/v1/reports/", nil)
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")
	r = testWithChiParam(r, "reportID", "")

	h.Delete(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Delete with empty ID: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestDeleteReport_NoDB(t *testing.T) {
	h := &ReportsHandler{DB: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("DELETE", "/api/v1/reports/abc", nil)
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")
	r = testWithChiParam(r, "reportID", "abc")

	h.Delete(w, r)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Delete without DB: got %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestParsePagination(t *testing.T) {
	tests := []struct {
		query      string
		wantLimit  int
		wantOffset int
	}{
		{"", 50, 0},
		{"?limit=10&offset=20", 10, 20},
		{"?limit=200", 50, 0},     // exceeds max
		{"?limit=-1", 50, 0},      // negative
		{"?limit=abc", 50, 0},     // non-numeric
		{"?offset=-5", 50, 0},     // negative offset
		{"?limit=100", 100, 0},    // max allowed
		{"?limit=0", 50, 0},       // zero not allowed
	}

	for _, tt := range tests {
		r := httptest.NewRequest("GET", "/api/v1/reports"+tt.query, nil)
		limit, offset := parsePagination(r)
		if limit != tt.wantLimit || offset != tt.wantOffset {
			t.Errorf("parsePagination(%q) = (%d, %d), want (%d, %d)",
				tt.query, limit, offset, tt.wantLimit, tt.wantOffset)
		}
	}
}

func TestNullString(t *testing.T) {
	if got := nullString(""); got != nil {
		t.Errorf("nullString(\"\") = %v, want nil", got)
	}
	if got := nullString("hello"); got == nil || *got != "hello" {
		t.Errorf("nullString(\"hello\") = %v, want &\"hello\"", got)
	}
}

func TestCompareReports_Unauthorized(t *testing.T) {
	h := &ReportsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/reports/compare?base=a&head=b", nil)

	h.Compare(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Compare without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestCompareReports_MissingParams(t *testing.T) {
	h := &ReportsHandler{}
	tests := []struct {
		query string
	}{
		{"?base=a"},
		{"?head=b"},
		{""},
	}
	for _, tt := range tests {
		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", "/api/v1/reports/compare"+tt.query, nil)
		r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

		h.Compare(w, r)

		if w.Code != http.StatusBadRequest {
			t.Errorf("Compare(%s): got %d, want %d", tt.query, w.Code, http.StatusBadRequest)
		}
	}
}

func TestCompareReports_SameID(t *testing.T) {
	h := &ReportsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/reports/compare?base=abc&head=abc", nil)
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.Compare(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Compare with same IDs: got %d, want %d", w.Code, http.StatusBadRequest)
	}
	var body map[string]string
	json.NewDecoder(w.Body).Decode(&body)
	if body["error"] == "" {
		t.Error("expected error message in response")
	}
}

func TestCompareReports_NoDB(t *testing.T) {
	h := &ReportsHandler{DB: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/reports/compare?base=a&head=b", nil)
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.Compare(w, r)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Compare without DB: got %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

// --- CTRF report creation edge cases ---

func TestCreateReport_EmptyBody(t *testing.T) {
	h := &ReportsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/reports", strings.NewReader(""))
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.Create(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Create with empty body: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestCreateReport_NoTests(t *testing.T) {
	h := &ReportsHandler{}
	w := httptest.NewRecorder()
	report := `{"results":{"tool":{"name":"jest"},"summary":{"tests":0},"tests":[]}}`
	r := httptest.NewRequest("POST", "/api/v1/reports", strings.NewReader(report))
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.Create(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Create with no tests: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestCreateReport_InvalidTestStatus(t *testing.T) {
	h := &ReportsHandler{}
	w := httptest.NewRecorder()
	report := `{"results":{"tool":{"name":"jest"},"summary":{"tests":1},"tests":[{"name":"t1","status":"unknown_status","duration":10}]}}`
	r := httptest.NewRequest("POST", "/api/v1/reports", strings.NewReader(report))
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.Create(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Create with invalid status: got %d, want %d", w.Code, http.StatusBadRequest)
	}
	var body map[string]string
	json.NewDecoder(w.Body).Decode(&body)
	if body["error"] == "" {
		t.Error("expected error message in response")
	}
}

func TestCreateReport_TestMissingName(t *testing.T) {
	h := &ReportsHandler{}
	w := httptest.NewRecorder()
	report := `{"results":{"tool":{"name":"jest"},"summary":{"tests":1},"tests":[{"name":"","status":"passed","duration":10}]}}`
	r := httptest.NewRequest("POST", "/api/v1/reports", strings.NewReader(report))
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.Create(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Create with missing test name: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestCreateReport_NoDB_AllTestStatuses(t *testing.T) {
	h := &ReportsHandler{DB: nil}
	w := httptest.NewRecorder()
	report := `{"results":{"tool":{"name":"pytest"},"summary":{"tests":5,"passed":1,"failed":1,"skipped":1,"pending":1,"other":1},"tests":[
		{"name":"t1","status":"passed","duration":10},
		{"name":"t2","status":"failed","duration":20,"message":"assertion error","trace":"line 42"},
		{"name":"t3","status":"skipped","duration":0},
		{"name":"t4","status":"pending","duration":0},
		{"name":"t5","status":"other","duration":5}
	]}}`
	r := httptest.NewRequest("POST", "/api/v1/reports", strings.NewReader(report))
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.Create(w, r)

	if w.Code != http.StatusCreated {
		t.Errorf("Create with all statuses: got %d, want %d (body: %s)", w.Code, http.StatusCreated, w.Body.String())
	}

	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["tool"] != "pytest" {
		t.Errorf("tool = %v, want pytest", resp["tool"])
	}
	if resp["tests"] != float64(5) {
		t.Errorf("tests = %v, want 5", resp["tests"])
	}
	if resp["message"] != "report accepted" {
		t.Errorf("message = %v, want 'report accepted'", resp["message"])
	}
}

func TestCreateReport_NoDB_RichCTRFData(t *testing.T) {
	h := &ReportsHandler{DB: nil}
	w := httptest.NewRecorder()
	report := `{"results":{
		"tool":{"name":"playwright","version":"1.40.0"},
		"summary":{"tests":2,"passed":1,"failed":1,"skipped":0,"pending":0,"other":0,"start":1700000000,"stop":1700000060},
		"tests":[
			{"name":"login test","status":"passed","duration":1500,"suite":"auth","filePath":"tests/auth.spec.ts","tags":["smoke","auth"]},
			{"name":"signup test","status":"failed","duration":3000,"suite":"auth","filePath":"tests/auth.spec.ts","message":"timeout","trace":"at signup.ts:15","retry":2,"flaky":true}
		],
		"environment":{"appName":"myapp","appVersion":"2.0","branchName":"main","buildNumber":"42"}
	}}`
	r := httptest.NewRequest("POST", "/api/v1/reports", strings.NewReader(report))
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.Create(w, r)

	if w.Code != http.StatusCreated {
		t.Errorf("Create with rich CTRF: got %d, want %d (body: %s)", w.Code, http.StatusCreated, w.Body.String())
	}

	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["tool"] != "playwright" {
		t.Errorf("tool = %v, want playwright", resp["tool"])
	}
	if resp["tests"] != float64(2) {
		t.Errorf("tests = %v, want 2", resp["tests"])
	}
}

func TestCreateReport_NoDB_NoExecutionIDInResponse(t *testing.T) {
	h := &ReportsHandler{DB: nil}
	w := httptest.NewRecorder()
	report := `{"results":{"tool":{"name":"jest"},"summary":{"tests":1,"passed":1,"failed":0,"skipped":0,"pending":0,"other":0},"tests":[{"name":"t1","status":"passed","duration":10}]}}`
	r := httptest.NewRequest("POST", "/api/v1/reports", strings.NewReader(report))
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.Create(w, r)

	if w.Code != http.StatusCreated {
		t.Errorf("got %d, want %d", w.Code, http.StatusCreated)
	}

	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	if _, ok := resp["execution_id"]; ok {
		t.Error("execution_id should not be present when not provided")
	}
}

// --- Date filtering tests ---

func TestListReports_DateFilterParams_NoDB(t *testing.T) {
	// Verify that date filter params don't cause crashes when DB is nil.
	// The handler parses dates before hitting the DB, so this tests the parse path.
	tests := []struct {
		name  string
		query string
	}{
		{"valid since", "?since=2026-01-01T00:00:00Z"},
		{"valid until", "?until=2026-12-31T23:59:59Z"},
		{"both dates", "?since=2026-01-01T00:00:00Z&until=2026-12-31T23:59:59Z"},
		{"invalid since format", "?since=not-a-date"},
		{"invalid until format", "?until=2026-13-45"},
		{"empty since", "?since="},
		{"empty until", "?until="},
		{"since with timezone offset", "?since=2026-01-01T00:00:00+05:00"},
		{"until with timezone offset", "?until=2026-12-31T23:59:59-08:00"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := &ReportsHandler{DB: nil}
			w := httptest.NewRecorder()
			r := httptest.NewRequest("GET", "/api/v1/reports"+tt.query, nil)
			r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

			h.List(w, r)

			// With nil DB, we always get 503 — the important thing is we don't panic
			if w.Code != http.StatusServiceUnavailable {
				t.Errorf("List(%s): got %d, want %d", tt.query, w.Code, http.StatusServiceUnavailable)
			}
		})
	}
}

func TestListReports_DateFilterWithPagination_NoDB(t *testing.T) {
	h := &ReportsHandler{DB: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/reports?since=2026-01-01T00:00:00Z&until=2026-06-01T00:00:00Z&limit=25&offset=10", nil)
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.List(w, r)

	// Verifies date filters and pagination params combine without error
	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("got %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

// --- Team scoping tests ---

func TestListReports_RequiresClaims(t *testing.T) {
	// Without any claims, List must return 401 regardless of query params
	h := &ReportsHandler{DB: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/reports?limit=10", nil)

	h.List(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("List without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestCreateReport_DifferentTeams_NoDB(t *testing.T) {
	// Verify that reports created by different teams work in no-DB fallback mode
	teams := []struct {
		teamID string
		tool   string
	}{
		{"team-alpha", "jest"},
		{"team-beta", "pytest"},
		{"team-gamma", "mocha"},
	}

	for _, tt := range teams {
		t.Run(tt.teamID, func(t *testing.T) {
			h := &ReportsHandler{DB: nil}
			w := httptest.NewRecorder()
			report := `{"results":{"tool":{"name":"` + tt.tool + `"},"summary":{"tests":1,"passed":1,"failed":0,"skipped":0,"pending":0,"other":0},"tests":[{"name":"t1","status":"passed","duration":10}]}}`
			r := httptest.NewRequest("POST", "/api/v1/reports", strings.NewReader(report))
			r = testWithClaimsSimple(r, "user-1", tt.teamID, "owner")

			h.Create(w, r)

			if w.Code != http.StatusCreated {
				t.Errorf("Create for %s: got %d, want %d", tt.teamID, w.Code, http.StatusCreated)
			}
		})
	}
}

func TestGetReport_RequiresBothClaimsAndID(t *testing.T) {
	// Missing claims → 401 (takes priority over missing ID)
	h := &ReportsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/reports/some-id", nil)
	r = testWithChiParam(r, "reportID", "some-id")

	h.Get(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Get without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestDeleteReport_RequiresBothClaimsAndID(t *testing.T) {
	// Missing claims → 401 (takes priority over missing ID)
	h := &ReportsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("DELETE", "/api/v1/reports/some-id", nil)
	r = testWithChiParam(r, "reportID", "some-id")

	h.Delete(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Delete without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

// --- Error response structure tests ---

func TestErrorResponses_HaveErrorField(t *testing.T) {
	tests := []struct {
		name    string
		method  string
		path    string
		setup   func(r *http.Request) *http.Request
		handler func(h *ReportsHandler, w http.ResponseWriter, r *http.Request)
	}{
		{
			name:   "List unauthorized",
			method: "GET", path: "/api/v1/reports",
			setup:   func(r *http.Request) *http.Request { return r },
			handler: func(h *ReportsHandler, w http.ResponseWriter, r *http.Request) { h.List(w, r) },
		},
		{
			name:   "Create unauthorized",
			method: "POST", path: "/api/v1/reports",
			setup:   func(r *http.Request) *http.Request { return r },
			handler: func(h *ReportsHandler, w http.ResponseWriter, r *http.Request) { h.Create(w, r) },
		},
		{
			name:   "Get missing ID",
			method: "GET", path: "/api/v1/reports/",
			setup: func(r *http.Request) *http.Request {
				r = testWithClaimsSimple(r, "user-1", "team-1", "owner")
				return testWithChiParam(r, "reportID", "")
			},
			handler: func(h *ReportsHandler, w http.ResponseWriter, r *http.Request) { h.Get(w, r) },
		},
		{
			name:   "Delete missing ID",
			method: "DELETE", path: "/api/v1/reports/",
			setup: func(r *http.Request) *http.Request {
				r = testWithClaimsSimple(r, "user-1", "team-1", "owner")
				return testWithChiParam(r, "reportID", "")
			},
			handler: func(h *ReportsHandler, w http.ResponseWriter, r *http.Request) { h.Delete(w, r) },
		},
		{
			name:   "Compare missing params",
			method: "GET", path: "/api/v1/reports/compare",
			setup: func(r *http.Request) *http.Request {
				return testWithClaimsSimple(r, "user-1", "team-1", "owner")
			},
			handler: func(h *ReportsHandler, w http.ResponseWriter, r *http.Request) { h.Compare(w, r) },
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := &ReportsHandler{}
			w := httptest.NewRecorder()
			r := httptest.NewRequest(tt.method, tt.path, strings.NewReader("{}"))
			r = tt.setup(r)

			tt.handler(h, w, r)

			var body map[string]string
			if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
				t.Fatalf("failed to decode error response: %v", err)
			}
			if body["error"] == "" {
				t.Errorf("expected non-empty 'error' field in response body")
			}
		})
	}
}

// --- Pagination edge cases ---

func TestParsePagination_AdditionalCases(t *testing.T) {
	tests := []struct {
		query      string
		wantLimit  int
		wantOffset int
	}{
		{"?limit=1", 1, 0},          // minimum valid limit
		{"?limit=99&offset=0", 99, 0},
		{"?limit=50&offset=1000", 50, 1000}, // large offset
		{"?limit=101", 50, 0},               // just over max
		{"?offset=abc", 50, 0},              // non-numeric offset
		{"?limit=10.5", 50, 0},              // float limit
		{"?offset=10.5", 50, 0},             // float offset
	}

	for _, tt := range tests {
		r := httptest.NewRequest("GET", "/api/v1/reports"+tt.query, nil)
		limit, offset := parsePagination(r)
		if limit != tt.wantLimit || offset != tt.wantOffset {
			t.Errorf("parsePagination(%q) = (%d, %d), want (%d, %d)",
				tt.query, limit, offset, tt.wantLimit, tt.wantOffset)
		}
	}
}

// --- Compare endpoint edge cases ---

func TestCompareReports_BothParamsEmpty(t *testing.T) {
	h := &ReportsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/reports/compare?base=&head=", nil)
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.Compare(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Compare with empty params: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestCompareReports_OnlyBaseEmpty(t *testing.T) {
	h := &ReportsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/reports/compare?base=&head=abc", nil)
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.Compare(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Compare with empty base: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestCompareReports_OnlyHeadEmpty(t *testing.T) {
	h := &ReportsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/reports/compare?base=abc&head=", nil)
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")

	h.Compare(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Compare with empty head: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

// --- buildReportData tests ---

func TestBuildReportData_BasicCounts(t *testing.T) {
	report := &ctrf.Report{
		Results: ctrf.Results{
			Summary: ctrf.Summary{
				Tests:   10,
				Passed:  7,
				Failed:  2,
				Skipped: 1,
			},
		},
	}

	results := []model.TestResult{
		{Name: "t1", Status: "passed", DurationMs: 100},
		{Name: "t2", Status: "passed", DurationMs: 200},
		{Name: "t3", Status: "failed", DurationMs: 300},
		{Name: "t4", Status: "failed", DurationMs: 150},
		{Name: "t5", Status: "skipped", DurationMs: 0},
	}

	data := buildReportData(report, results)

	if data.TotalTests != 10 {
		t.Errorf("TotalTests = %d, want 10", data.TotalTests)
	}
	if data.PassedTests != 7 {
		t.Errorf("PassedTests = %d, want 7", data.PassedTests)
	}
	if data.FailedTests != 2 {
		t.Errorf("FailedTests = %d, want 2", data.FailedTests)
	}
	if data.SkippedTests != 1 {
		t.Errorf("SkippedTests = %d, want 1", data.SkippedTests)
	}
	if data.TotalDurationMs != 750 {
		t.Errorf("TotalDurationMs = %d, want 750", data.TotalDurationMs)
	}
}

func TestBuildReportData_FailedTests(t *testing.T) {
	report := &ctrf.Report{
		Results: ctrf.Results{
			Summary: ctrf.Summary{Tests: 3, Passed: 1, Failed: 2},
		},
	}

	results := []model.TestResult{
		{Name: "passing", Status: "passed", DurationMs: 100},
		{Name: "failing1", Status: "failed", DurationMs: 200},
		{Name: "failing2", Status: "failed", DurationMs: 300},
	}

	data := buildReportData(report, results)

	if len(data.CurrentFailedTests) != 2 {
		t.Errorf("CurrentFailedTests count = %d, want 2", len(data.CurrentFailedTests))
	}
	if !data.CurrentFailedTests["failing1"] {
		t.Error("expected failing1 in CurrentFailedTests")
	}
	if !data.CurrentFailedTests["failing2"] {
		t.Error("expected failing2 in CurrentFailedTests")
	}
	if data.CurrentFailedTests["passing"] {
		t.Error("passing test should not be in CurrentFailedTests")
	}
}

func TestBuildReportData_FlakyTests(t *testing.T) {
	report := &ctrf.Report{
		Results: ctrf.Results{
			Summary: ctrf.Summary{Tests: 3, Passed: 3},
		},
	}

	results := []model.TestResult{
		{Name: "stable", Status: "passed", DurationMs: 100, Flaky: false},
		{Name: "flaky1", Status: "passed", DurationMs: 200, Flaky: true, Suite: "auth", FilePath: "tests/auth.go"},
		{Name: "flaky2", Status: "passed", DurationMs: 300, Flaky: true},
	}

	data := buildReportData(report, results)

	if len(data.FlakyTests) != 2 {
		t.Errorf("FlakyTests count = %d, want 2", len(data.FlakyTests))
	}
	if data.FlakyTests[0].Name != "flaky1" {
		t.Errorf("FlakyTests[0].Name = %s, want flaky1", data.FlakyTests[0].Name)
	}
	if data.FlakyTests[0].Suite != "auth" {
		t.Errorf("FlakyTests[0].Suite = %s, want auth", data.FlakyTests[0].Suite)
	}
}

func TestBuildReportData_EmptyResults(t *testing.T) {
	report := &ctrf.Report{
		Results: ctrf.Results{
			Summary: ctrf.Summary{Tests: 0},
		},
	}

	data := buildReportData(report, nil)

	if data.TotalTests != 0 {
		t.Errorf("TotalTests = %d, want 0", data.TotalTests)
	}
	if data.TotalDurationMs != 0 {
		t.Errorf("TotalDurationMs = %d, want 0", data.TotalDurationMs)
	}
	if len(data.CurrentFailedTests) != 0 {
		t.Errorf("CurrentFailedTests count = %d, want 0", len(data.CurrentFailedTests))
	}
	if data.FlakyTests != nil {
		t.Errorf("FlakyTests should be nil, got %v", data.FlakyTests)
	}
}

func TestBuildReportData_PreviousFailedTestsNil(t *testing.T) {
	report := &ctrf.Report{
		Results: ctrf.Results{
			Summary: ctrf.Summary{Tests: 1, Passed: 1},
		},
	}

	results := []model.TestResult{
		{Name: "t1", Status: "passed", DurationMs: 100},
	}

	data := buildReportData(report, results)

	// PreviousFailedTests should be nil (not populated from a single report)
	if data.PreviousFailedTests != nil {
		t.Error("PreviousFailedTests should be nil for single report submission")
	}
}
