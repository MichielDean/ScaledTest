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
	r = withClaims(r, "user-1", "team-1", "owner")

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
	r = withClaims(r, "user-1", "team-1", "owner")

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
	r = withClaims(r, "user-1", "team-1", "owner")

	h.Create(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Create without command: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestCreateExecution_NoDB(t *testing.T) {
	h := &ExecutionsHandler{DB: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/executions", strings.NewReader(`{"command":"npm test"}`))
	r = withClaims(r, "user-1", "team-1", "owner")

	h.Create(w, r)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Create without DB: got %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestGetExecution_Unauthorized(t *testing.T) {
	h := &ExecutionsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/executions/abc", nil)
	r = withChiParam(r, "executionID", "abc")

	h.Get(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Get without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestGetExecution_MissingID(t *testing.T) {
	h := &ExecutionsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/executions/", nil)
	r = withClaims(r, "user-1", "team-1", "owner")
	r = withChiParam(r, "executionID", "")

	h.Get(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Get with empty ID: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestGetExecution_NoDB(t *testing.T) {
	h := &ExecutionsHandler{DB: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/executions/abc", nil)
	r = withClaims(r, "user-1", "team-1", "owner")
	r = withChiParam(r, "executionID", "abc")

	h.Get(w, r)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Get without DB: got %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestCancelExecution_Unauthorized(t *testing.T) {
	h := &ExecutionsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("DELETE", "/api/v1/executions/abc", nil)
	r = withChiParam(r, "executionID", "abc")

	h.Cancel(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Cancel without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestCancelExecution_MissingID(t *testing.T) {
	h := &ExecutionsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("DELETE", "/api/v1/executions/", nil)
	r = withClaims(r, "user-1", "team-1", "owner")
	r = withChiParam(r, "executionID", "")

	h.Cancel(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Cancel with empty ID: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestCancelExecution_NoDB(t *testing.T) {
	h := &ExecutionsHandler{DB: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("DELETE", "/api/v1/executions/abc", nil)
	r = withClaims(r, "user-1", "team-1", "owner")
	r = withChiParam(r, "executionID", "abc")

	h.Cancel(w, r)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Cancel without DB: got %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestUpdateStatus_Unauthorized(t *testing.T) {
	h := &ExecutionsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("PUT", "/api/v1/executions/abc/status", strings.NewReader(`{"status":"running"}`))
	r = withChiParam(r, "executionID", "abc")

	h.UpdateStatus(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("UpdateStatus without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestUpdateStatus_InvalidBody(t *testing.T) {
	h := &ExecutionsHandler{DB: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("PUT", "/api/v1/executions/abc/status", strings.NewReader(`{invalid}`))
	r = withClaims(r, "user-1", "team-1", "owner")
	r = withChiParam(r, "executionID", "abc")

	h.UpdateStatus(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("UpdateStatus with invalid body: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestUpdateStatus_InvalidStatus(t *testing.T) {
	h := &ExecutionsHandler{DB: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("PUT", "/api/v1/executions/abc/status", strings.NewReader(`{"status":"invalid"}`))
	r = withClaims(r, "user-1", "team-1", "owner")
	r = withChiParam(r, "executionID", "abc")

	h.UpdateStatus(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("UpdateStatus with bad status: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestUpdateStatus_NoDB(t *testing.T) {
	h := &ExecutionsHandler{DB: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("PUT", "/api/v1/executions/abc/status", strings.NewReader(`{"status":"running"}`))
	r = withClaims(r, "user-1", "team-1", "owner")
	r = withChiParam(r, "executionID", "abc")

	h.UpdateStatus(w, r)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("UpdateStatus without DB: got %d, want %d", w.Code, http.StatusServiceUnavailable)
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
		r := httptest.NewRequest("GET", "/api/v1/executions"+tt.query, nil)
		limit, offset := parsePagination(r)
		if limit != tt.wantLimit || offset != tt.wantOffset {
			t.Errorf("parsePagination(%q) = (%d, %d), want (%d, %d)",
				tt.query, limit, offset, tt.wantLimit, tt.wantOffset)
		}
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
