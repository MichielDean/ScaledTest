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

var qgDefaultClaims = &auth.Claims{
	UserID: "user-1",
	Email:  "test@example.com",
	Role:   "owner",
	TeamID: "team-1",
}

func qgWithClaims(r *http.Request) *http.Request {
	return testWithClaims(r, qgDefaultClaims)
}

func qgWithClaimsAndParam(r *http.Request, key, value string) *http.Request {
	return testWithClaimsAndParam(r, qgDefaultClaims, key, value)
}

func TestQGList_Unauthorized(t *testing.T) {
	h := &QualityGatesHandler{}
	req := httptest.NewRequest("GET", "/api/v1/quality-gates", nil)
	w := httptest.NewRecorder()
	h.List(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("List without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestQGList_NoDB(t *testing.T) {
	h := &QualityGatesHandler{}
	req := httptest.NewRequest("GET", "/api/v1/quality-gates", nil)
	req = qgWithClaims(req)
	w := httptest.NewRecorder()
	h.List(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("List with nil DB: got %d, want %d", w.Code, http.StatusOK)
	}
	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	gates, ok := resp["quality_gates"].([]interface{})
	if !ok || len(gates) != 0 {
		t.Errorf("expected empty quality_gates array, got %v", resp["quality_gates"])
	}
	total, _ := resp["total"].(float64)
	if total != 0 {
		t.Errorf("expected total 0, got %v", total)
	}
}

func TestQGCreate_Unauthorized(t *testing.T) {
	h := &QualityGatesHandler{}
	body := `{"name":"gate","rules":[{"type":"pass_rate","params":{"threshold":90}}]}`
	req := httptest.NewRequest("POST", "/api/v1/quality-gates", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.Create(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("Create without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestQGCreate_InvalidRequest(t *testing.T) {
	h := &QualityGatesHandler{}
	req := httptest.NewRequest("POST", "/api/v1/quality-gates", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	req = qgWithClaims(req)
	w := httptest.NewRecorder()
	h.Create(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("Create with empty body: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestQGCreate_InvalidRules(t *testing.T) {
	h := &QualityGatesHandler{}
	body := `{"name":"gate","rules":[{"type":"bogus_rule","params":{}}]}`
	req := httptest.NewRequest("POST", "/api/v1/quality-gates", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = qgWithClaims(req)
	w := httptest.NewRecorder()
	h.Create(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("Create with invalid rule type: got %d, want %d", w.Code, http.StatusBadRequest)
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if !strings.Contains(resp["error"], "unknown rule type") {
		t.Errorf("expected unknown rule type error, got %q", resp["error"])
	}
}

func TestQGCreate_EmptyRules(t *testing.T) {
	h := &QualityGatesHandler{}
	body := `{"name":"gate","rules":[]}`
	req := httptest.NewRequest("POST", "/api/v1/quality-gates", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = qgWithClaims(req)
	w := httptest.NewRecorder()
	h.Create(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("Create with empty rules: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestQGCreate_ValidRules_NoDB(t *testing.T) {
	h := &QualityGatesHandler{}
	body := `{"name":"gate","rules":[{"type":"pass_rate","params":{"threshold":90}}]}`
	req := httptest.NewRequest("POST", "/api/v1/quality-gates", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = qgWithClaims(req)
	w := httptest.NewRecorder()
	h.Create(w, req)
	if w.Code != http.StatusNotImplemented {
		t.Errorf("Create with nil DB: got %d, want %d", w.Code, http.StatusNotImplemented)
	}
}

func TestQGGet_Unauthorized(t *testing.T) {
	h := &QualityGatesHandler{}
	req := httptest.NewRequest("GET", "/api/v1/quality-gates/gate-1", nil)
	req = func() *http.Request {
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("gateID", "gate-1")
		return req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	}()
	w := httptest.NewRecorder()
	h.Get(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("Get without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestQGGet_MissingID(t *testing.T) {
	h := &QualityGatesHandler{}
	req := httptest.NewRequest("GET", "/api/v1/quality-gates/", nil)
	req = qgWithClaims(req)
	w := httptest.NewRecorder()
	h.Get(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("Get with missing ID: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestQGGet_NoDB(t *testing.T) {
	h := &QualityGatesHandler{}
	req := httptest.NewRequest("GET", "/api/v1/quality-gates/gate-1", nil)
	req = qgWithClaimsAndParam(req, "gateID", "gate-1")
	w := httptest.NewRecorder()
	h.Get(w, req)
	if w.Code != http.StatusNotImplemented {
		t.Errorf("Get with nil DB: got %d, want %d", w.Code, http.StatusNotImplemented)
	}
}

func TestQGUpdate_Unauthorized(t *testing.T) {
	h := &QualityGatesHandler{}
	req := httptest.NewRequest("PUT", "/api/v1/quality-gates/gate-1", strings.NewReader(`{"name":"new"}`))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("gateID", "gate-1")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	w := httptest.NewRecorder()
	h.Update(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("Update without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestQGUpdate_InvalidRules(t *testing.T) {
	h := &QualityGatesHandler{}
	body := `{"rules":[{"type":"fake_rule"}]}`
	req := httptest.NewRequest("PUT", "/api/v1/quality-gates/gate-1", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = qgWithClaimsAndParam(req, "gateID", "gate-1")
	w := httptest.NewRecorder()
	h.Update(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("Update with invalid rules: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestQGUpdate_NoDB(t *testing.T) {
	h := &QualityGatesHandler{}
	body := `{"name":"updated"}`
	req := httptest.NewRequest("PUT", "/api/v1/quality-gates/gate-1", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = qgWithClaimsAndParam(req, "gateID", "gate-1")
	w := httptest.NewRecorder()
	h.Update(w, req)
	if w.Code != http.StatusNotImplemented {
		t.Errorf("Update with nil DB: got %d, want %d", w.Code, http.StatusNotImplemented)
	}
}

func TestQGDelete_Unauthorized(t *testing.T) {
	h := &QualityGatesHandler{}
	req := httptest.NewRequest("DELETE", "/api/v1/quality-gates/gate-1", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("gateID", "gate-1")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	w := httptest.NewRecorder()
	h.Delete(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("Delete without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestQGDelete_NoDB(t *testing.T) {
	h := &QualityGatesHandler{}
	req := httptest.NewRequest("DELETE", "/api/v1/quality-gates/gate-1", nil)
	req = qgWithClaimsAndParam(req, "gateID", "gate-1")
	w := httptest.NewRecorder()
	h.Delete(w, req)
	if w.Code != http.StatusNotImplemented {
		t.Errorf("Delete with nil DB: got %d, want %d", w.Code, http.StatusNotImplemented)
	}
}

func TestQGEvaluate_Unauthorized(t *testing.T) {
	h := &QualityGatesHandler{}
	body := `{"report_id":"rep-1"}`
	req := httptest.NewRequest("POST", "/api/v1/quality-gates/gate-1/evaluate", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("gateID", "gate-1")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	w := httptest.NewRecorder()
	h.Evaluate(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("Evaluate without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestQGEvaluate_InvalidRequest(t *testing.T) {
	h := &QualityGatesHandler{}
	req := httptest.NewRequest("POST", "/api/v1/quality-gates/gate-1/evaluate", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	req = qgWithClaimsAndParam(req, "gateID", "gate-1")
	w := httptest.NewRecorder()
	h.Evaluate(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("Evaluate with missing report_id: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestQGEvaluate_NoDB(t *testing.T) {
	h := &QualityGatesHandler{}
	body := `{"report_id":"rep-1"}`
	req := httptest.NewRequest("POST", "/api/v1/quality-gates/gate-1/evaluate", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = qgWithClaimsAndParam(req, "gateID", "gate-1")
	w := httptest.NewRecorder()
	h.Evaluate(w, req)
	if w.Code != http.StatusNotImplemented {
		t.Errorf("Evaluate with nil DB: got %d, want %d", w.Code, http.StatusNotImplemented)
	}
}

func TestValidateRules_Valid(t *testing.T) {
	rules := json.RawMessage(`[{"type":"pass_rate","params":{"threshold":90}},{"type":"zero_failures"}]`)
	if err := validateRules(rules); err != nil {
		t.Errorf("expected valid rules, got error: %v", err)
	}
}

func TestValidateRules_UnknownType(t *testing.T) {
	rules := json.RawMessage(`[{"type":"nonexistent"}]`)
	if err := validateRules(rules); err == nil {
		t.Error("expected error for unknown rule type")
	}
}

func TestValidateRules_Empty(t *testing.T) {
	rules := json.RawMessage(`[]`)
	if err := validateRules(rules); err == nil {
		t.Error("expected error for empty rules")
	}
}

func TestValidateRules_InvalidJSON(t *testing.T) {
	rules := json.RawMessage(`not json`)
	if err := validateRules(rules); err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestValidateRules_AllTypes(t *testing.T) {
	rules := json.RawMessage(`[
		{"type":"pass_rate","params":{"threshold":90}},
		{"type":"zero_failures"},
		{"type":"no_new_failures"},
		{"type":"max_duration","params":{"threshold_ms":5000}},
		{"type":"max_flaky_count","params":{"threshold":2}},
		{"type":"min_test_count","params":{"threshold":10}}
	]`)
	if err := validateRules(rules); err != nil {
		t.Errorf("expected all rule types to be valid, got error: %v", err)
	}
}
