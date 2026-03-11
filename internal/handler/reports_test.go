package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/scaledtest/scaledtest/internal/auth"
)

// withClaims creates a request with auth claims in context.
func withClaims(r *http.Request, userID, teamID, role string) *http.Request {
	claims := &auth.Claims{
		UserID: userID,
		TeamID: teamID,
		Role:   role,
	}
	ctx := context.WithValue(r.Context(), auth.ClaimsContextKey, claims)
	return r.WithContext(ctx)
}

// withChiParam adds a chi URL parameter to a request.
func withChiParam(r *http.Request, key, value string) *http.Request {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add(key, value)
	return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
}

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
	r = withClaims(r, "user-1", "team-1", "owner")

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
	r = withClaims(r, "user-1", "team-1", "owner")

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
	r = withClaims(r, "user-1", "team-1", "owner")

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
	r = withClaims(r, "user-1", "team-1", "owner")

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
	r = withClaims(r, "user-1", "team-1", "owner")

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
	r = withChiParam(r, "reportID", "abc")

	h.Get(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Get without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestGetReport_MissingID(t *testing.T) {
	h := &ReportsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/reports/", nil)
	r = withClaims(r, "user-1", "team-1", "owner")
	r = withChiParam(r, "reportID", "")

	h.Get(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Get with empty ID: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestGetReport_NoDB(t *testing.T) {
	h := &ReportsHandler{DB: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/reports/abc", nil)
	r = withClaims(r, "user-1", "team-1", "owner")
	r = withChiParam(r, "reportID", "abc")

	h.Get(w, r)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Get without DB: got %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestDeleteReport_Unauthorized(t *testing.T) {
	h := &ReportsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("DELETE", "/api/v1/reports/abc", nil)
	r = withChiParam(r, "reportID", "abc")

	h.Delete(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Delete without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestDeleteReport_MissingID(t *testing.T) {
	h := &ReportsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("DELETE", "/api/v1/reports/", nil)
	r = withClaims(r, "user-1", "team-1", "owner")
	r = withChiParam(r, "reportID", "")

	h.Delete(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Delete with empty ID: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestDeleteReport_NoDB(t *testing.T) {
	h := &ReportsHandler{DB: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("DELETE", "/api/v1/reports/abc", nil)
	r = withClaims(r, "user-1", "team-1", "owner")
	r = withChiParam(r, "reportID", "abc")

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
