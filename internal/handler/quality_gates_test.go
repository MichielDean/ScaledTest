package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/scaledtest/scaledtest/internal/auth"
)

func withClaims(r *http.Request) *http.Request {
	claims := &auth.Claims{
		UserID: "user-1",
		Email:  "test@example.com",
		Role:   "owner",
		TeamID: "team-1",
	}
	ctx := auth.SetClaims(r.Context(), claims)
	return r.WithContext(ctx)
}

func withChiParam(r *http.Request, key, value string) *http.Request {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add(key, value)
	return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
}

func TestQualityGatesListWithoutDB(t *testing.T) {
	h := &QualityGatesHandler{Store: nil}

	req := httptest.NewRequest("GET", "/api/v1/quality-gates", nil)
	req = withClaims(req)
	w := httptest.NewRecorder()

	h.List(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("List status = %d, want %d", w.Code, http.StatusOK)
	}
	if !strings.Contains(w.Body.String(), `"quality_gates"`) {
		t.Errorf("List body missing quality_gates key: %s", w.Body.String())
	}
}

func TestQualityGatesListUnauthorized(t *testing.T) {
	h := &QualityGatesHandler{Store: nil}

	req := httptest.NewRequest("GET", "/api/v1/quality-gates", nil)
	w := httptest.NewRecorder()

	h.List(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("List without auth status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestQualityGatesCreateWithoutDB(t *testing.T) {
	h := &QualityGatesHandler{Store: nil}

	body := `{"name":"Release Gate","rules":[{"type":"pass_rate","params":{"threshold":95}}]}`
	req := httptest.NewRequest("POST", "/api/v1/quality-gates", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = withClaims(req)
	w := httptest.NewRecorder()

	h.Create(w, req)

	if w.Code != http.StatusNotImplemented {
		t.Errorf("Create without DB status = %d, want %d", w.Code, http.StatusNotImplemented)
	}
}

func TestQualityGatesCreateInvalidBody(t *testing.T) {
	h := &QualityGatesHandler{Store: nil}

	req := httptest.NewRequest("POST", "/api/v1/quality-gates", strings.NewReader(`{invalid}`))
	req.Header.Set("Content-Type", "application/json")
	req = withClaims(req)
	w := httptest.NewRecorder()

	h.Create(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Create with invalid body status = %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestQualityGatesCreateMissingName(t *testing.T) {
	h := &QualityGatesHandler{Store: nil}

	body := `{"rules":[{"type":"pass_rate"}]}`
	req := httptest.NewRequest("POST", "/api/v1/quality-gates", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = withClaims(req)
	w := httptest.NewRecorder()

	h.Create(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Create missing name status = %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestQualityGatesGetWithoutDB(t *testing.T) {
	h := &QualityGatesHandler{Store: nil}

	req := httptest.NewRequest("GET", "/api/v1/quality-gates/gate-1", nil)
	req = withClaims(req)
	req = withChiParam(req, "gateID", "gate-1")
	w := httptest.NewRecorder()

	h.Get(w, req)

	if w.Code != http.StatusNotImplemented {
		t.Errorf("Get without DB status = %d, want %d", w.Code, http.StatusNotImplemented)
	}
}

func TestQualityGatesGetMissingID(t *testing.T) {
	h := &QualityGatesHandler{Store: nil}

	req := httptest.NewRequest("GET", "/api/v1/quality-gates/", nil)
	req = withClaims(req)
	req = withChiParam(req, "gateID", "")
	w := httptest.NewRecorder()

	h.Get(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Get missing ID status = %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestQualityGatesUpdateWithoutDB(t *testing.T) {
	h := &QualityGatesHandler{Store: nil}

	body := `{"name":"Updated Gate","rules":[{"type":"zero_failures"}]}`
	req := httptest.NewRequest("PUT", "/api/v1/quality-gates/gate-1", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = withClaims(req)
	req = withChiParam(req, "gateID", "gate-1")
	w := httptest.NewRecorder()

	h.Update(w, req)

	if w.Code != http.StatusNotImplemented {
		t.Errorf("Update without DB status = %d, want %d", w.Code, http.StatusNotImplemented)
	}
}

func TestQualityGatesDeleteWithoutDB(t *testing.T) {
	h := &QualityGatesHandler{Store: nil}

	req := httptest.NewRequest("DELETE", "/api/v1/quality-gates/gate-1", nil)
	req = withClaims(req)
	req = withChiParam(req, "gateID", "gate-1")
	w := httptest.NewRecorder()

	h.Delete(w, req)

	if w.Code != http.StatusNotImplemented {
		t.Errorf("Delete without DB status = %d, want %d", w.Code, http.StatusNotImplemented)
	}
}

func TestQualityGatesEvaluateWithoutDB(t *testing.T) {
	h := &QualityGatesHandler{Store: nil}

	req := httptest.NewRequest("POST", "/api/v1/quality-gates/gate-1/evaluate", nil)
	req = withClaims(req)
	req = withChiParam(req, "gateID", "gate-1")
	w := httptest.NewRecorder()

	h.Evaluate(w, req)

	if w.Code != http.StatusNotImplemented {
		t.Errorf("Evaluate without DB status = %d, want %d", w.Code, http.StatusNotImplemented)
	}
}

func TestQualityGatesListEvaluationsWithoutDB(t *testing.T) {
	h := &QualityGatesHandler{Store: nil}

	req := httptest.NewRequest("GET", "/api/v1/quality-gates/gate-1/evaluations", nil)
	req = withClaims(req)
	req = withChiParam(req, "gateID", "gate-1")
	w := httptest.NewRecorder()

	h.ListEvaluations(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("ListEvaluations status = %d, want %d (body: %s)", w.Code, http.StatusOK, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), `"evaluations"`) {
		t.Errorf("ListEvaluations body missing evaluations key: %s", w.Body.String())
	}
}
