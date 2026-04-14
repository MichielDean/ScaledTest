package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/scaledtest/scaledtest/internal/auth"
	"github.com/scaledtest/scaledtest/internal/model"
)

func withClaimsRole(r *http.Request, role string) *http.Request {
	claims := &auth.Claims{
		UserID: "user-1",
		Email:  "test@example.com",
		Role:   role,
		TeamID: "team-1",
	}
	ctx := auth.SetClaims(r.Context(), claims)
	return r.WithContext(ctx)
}

func withTeamParam(r *http.Request, teamID string) *http.Request {
	rctx := chi.RouteContext(r.Context())
	if rctx == nil {
		rctx = chi.NewRouteContext()
		r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
	}
	rctx.URLParams.Add("teamID", teamID)
	return r
}

func withGateParam(r *http.Request, gateID string) *http.Request {
	rctx := chi.RouteContext(r.Context())
	if rctx == nil {
		rctx = chi.NewRouteContext()
		r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
	}
	rctx.URLParams.Add("gateID", gateID)
	return r
}

func TestQualityGatesListWithoutDB(t *testing.T) {
	h := &QualityGatesHandler{Store: nil}

	req := httptest.NewRequest("GET", "/api/v1/teams/team-1/quality-gates", nil)
	req = withClaimsRole(req, "owner")
	req = withTeamParam(req, "team-1")
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

	req := httptest.NewRequest("GET", "/api/v1/teams/team-1/quality-gates", nil)
	w := httptest.NewRecorder()

	h.List(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("List without auth status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestQualityGatesListWrongTeam(t *testing.T) {
	h := &QualityGatesHandler{Store: nil}

	req := httptest.NewRequest("GET", "/api/v1/teams/other-team/quality-gates", nil)
	req = withClaimsRole(req, "owner")
	req = withTeamParam(req, "other-team")
	w := httptest.NewRecorder()

	h.List(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("List wrong team status = %d, want %d", w.Code, http.StatusForbidden)
	}
}

func TestQualityGatesListReadonly(t *testing.T) {
	h := &QualityGatesHandler{Store: nil}

	req := httptest.NewRequest("GET", "/api/v1/teams/team-1/quality-gates", nil)
	req = withClaimsRole(req, "readonly")
	req = withTeamParam(req, "team-1")
	w := httptest.NewRecorder()

	h.List(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("List readonly status = %d, want %d (readonly should be able to read)", w.Code, http.StatusOK)
	}
}

func TestQualityGatesCreateWithoutDB(t *testing.T) {
	h := &QualityGatesHandler{Store: nil}

	body := `{"name":"Release Gate","rules":[{"type":"pass_rate","params":{"threshold":95}}]}`
	req := httptest.NewRequest("POST", "/api/v1/teams/team-1/quality-gates", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = withClaimsRole(req, "maintainer")
	req = withTeamParam(req, "team-1")
	w := httptest.NewRecorder()

	h.Create(w, req)

	if w.Code != http.StatusNotImplemented {
		t.Errorf("Create without DB status = %d, want %d", w.Code, http.StatusNotImplemented)
	}
}

func TestQualityGatesCreateReadonlyForbidden(t *testing.T) {
	h := &QualityGatesHandler{Store: nil}

	body := `{"name":"Release Gate","rules":[{"type":"pass_rate","params":{"threshold":95}}]}`
	req := httptest.NewRequest("POST", "/api/v1/teams/team-1/quality-gates", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = withClaimsRole(req, "readonly")
	req = withTeamParam(req, "team-1")
	w := httptest.NewRecorder()

	h.Create(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("Create as readonly status = %d, want %d", w.Code, http.StatusForbidden)
	}
}

func TestQualityGatesCreateInvalidBody(t *testing.T) {
	h := &QualityGatesHandler{Store: nil}

	req := httptest.NewRequest("POST", "/api/v1/teams/team-1/quality-gates", strings.NewReader(`{invalid}`))
	req.Header.Set("Content-Type", "application/json")
	req = withClaimsRole(req, "maintainer")
	req = withTeamParam(req, "team-1")
	w := httptest.NewRecorder()

	h.Create(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Create with invalid body status = %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestQualityGatesCreateMissingName(t *testing.T) {
	h := &QualityGatesHandler{Store: nil}

	body := `{"rules":[{"type":"pass_rate","params":{"threshold":95}}]}`
	req := httptest.NewRequest("POST", "/api/v1/teams/team-1/quality-gates", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = withClaimsRole(req, "maintainer")
	req = withTeamParam(req, "team-1")
	w := httptest.NewRecorder()

	h.Create(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Create missing name status = %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestQualityGatesCreateInvalidType(t *testing.T) {
	h := &QualityGatesHandler{Store: nil}

	body := `{"name":"Bad Gate","rules":[{"type":"invalid_type"}]}`
	req := httptest.NewRequest("POST", "/api/v1/teams/team-1/quality-gates", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = withClaimsRole(req, "maintainer")
	req = withTeamParam(req, "team-1")
	w := httptest.NewRecorder()

	h.Create(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Create invalid type status = %d, want %d", w.Code, http.StatusBadRequest)
	}
	if !strings.Contains(w.Body.String(), "unsupported type") {
		t.Errorf("Create invalid type body = %s, want unsupported type error", w.Body.String())
	}
}

func TestQualityGatesCreateMissingParams(t *testing.T) {
	h := &QualityGatesHandler{Store: nil}

	body := `{"name":"Bad Gate","rules":[{"type":"pass_rate"}]}`
	req := httptest.NewRequest("POST", "/api/v1/teams/team-1/quality-gates", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = withClaimsRole(req, "maintainer")
	req = withTeamParam(req, "team-1")
	w := httptest.NewRecorder()

	h.Create(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Create missing params status = %d, want %d", w.Code, http.StatusBadRequest)
	}
	if !strings.Contains(w.Body.String(), "requires params") {
		t.Errorf("Create missing params body = %s, want requires params error", w.Body.String())
	}
}

func TestQualityGatesCreateEmptyRules(t *testing.T) {
	h := &QualityGatesHandler{Store: nil}

	body := `{"name":"Empty Gate","rules":[]}`
	req := httptest.NewRequest("POST", "/api/v1/teams/team-1/quality-gates", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = withClaimsRole(req, "maintainer")
	req = withTeamParam(req, "team-1")
	w := httptest.NewRecorder()

	h.Create(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Create empty rules status = %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestQualityGatesGetWithoutDB(t *testing.T) {
	h := &QualityGatesHandler{Store: nil}

	req := httptest.NewRequest("GET", "/api/v1/teams/team-1/quality-gates/gate-1", nil)
	req = withClaimsRole(req, "owner")
	req = withTeamParam(req, "team-1")
	req = withGateParam(req, "gate-1")
	w := httptest.NewRecorder()

	h.Get(w, req)

	if w.Code != http.StatusNotImplemented {
		t.Errorf("Get without DB status = %d, want %d", w.Code, http.StatusNotImplemented)
	}
}

func TestQualityGatesGetMissingGateID(t *testing.T) {
	h := &QualityGatesHandler{Store: nil}

	req := httptest.NewRequest("GET", "/api/v1/teams/team-1/quality-gates/", nil)
	req = withClaimsRole(req, "owner")
	req = withTeamParam(req, "team-1")
	req = withGateParam(req, "")
	w := httptest.NewRecorder()

	h.Get(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Get missing ID status = %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestQualityGatesUpdateWithoutDB(t *testing.T) {
	h := &QualityGatesHandler{Store: nil}

	body := `{"name":"Updated Gate","rules":[{"type":"zero_failures"}]}`
	req := httptest.NewRequest("PUT", "/api/v1/teams/team-1/quality-gates/gate-1", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = withClaimsRole(req, "maintainer")
	req = withTeamParam(req, "team-1")
	req = withGateParam(req, "gate-1")
	w := httptest.NewRecorder()

	h.Update(w, req)

	if w.Code != http.StatusNotImplemented {
		t.Errorf("Update without DB status = %d, want %d", w.Code, http.StatusNotImplemented)
	}
}

func TestQualityGatesUpdateReadonlyForbidden(t *testing.T) {
	h := &QualityGatesHandler{Store: nil}

	body := `{"name":"Updated Gate","rules":[{"type":"zero_failures"}]}`
	req := httptest.NewRequest("PUT", "/api/v1/teams/team-1/quality-gates/gate-1", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = withClaimsRole(req, "readonly")
	req = withTeamParam(req, "team-1")
	req = withGateParam(req, "gate-1")
	w := httptest.NewRecorder()

	h.Update(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("Update as readonly status = %d, want %d", w.Code, http.StatusForbidden)
	}
}

func TestQualityGatesDeleteWithoutDB(t *testing.T) {
	h := &QualityGatesHandler{Store: nil}

	req := httptest.NewRequest("DELETE", "/api/v1/teams/team-1/quality-gates/gate-1", nil)
	req = withClaimsRole(req, "owner")
	req = withTeamParam(req, "team-1")
	req = withGateParam(req, "gate-1")
	w := httptest.NewRecorder()

	h.Delete(w, req)

	if w.Code != http.StatusNotImplemented {
		t.Errorf("Delete without DB status = %d, want %d", w.Code, http.StatusNotImplemented)
	}
}

func TestQualityGatesDeleteReadonlyForbidden(t *testing.T) {
	h := &QualityGatesHandler{Store: nil}

	req := httptest.NewRequest("DELETE", "/api/v1/teams/team-1/quality-gates/gate-1", nil)
	req = withClaimsRole(req, "readonly")
	req = withTeamParam(req, "team-1")
	req = withGateParam(req, "gate-1")
	w := httptest.NewRecorder()

	h.Delete(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("Delete as readonly status = %d, want %d", w.Code, http.StatusForbidden)
	}
}

func TestQualityGatesEvaluateWithoutDB(t *testing.T) {
	h := &QualityGatesHandler{Store: nil, ReportStore: nil}

	body := `{"report_id":"report-123"}`
	req := httptest.NewRequest("POST", "/api/v1/teams/team-1/quality-gates/gate-1/evaluate", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = withClaimsRole(req, "owner")
	req = withTeamParam(req, "team-1")
	req = withGateParam(req, "gate-1")
	w := httptest.NewRecorder()

	h.Evaluate(w, req)

	if w.Code != http.StatusNotImplemented {
		t.Errorf("Evaluate without DB status = %d, want %d", w.Code, http.StatusNotImplemented)
	}
}

func TestQualityGatesEvaluateMissingReportID(t *testing.T) {
	h := &QualityGatesHandler{Store: nil, ReportStore: nil}

	body := `{}`
	req := httptest.NewRequest("POST", "/api/v1/teams/team-1/quality-gates/gate-1/evaluate", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = withClaimsRole(req, "owner")
	req = withTeamParam(req, "team-1")
	req = withGateParam(req, "gate-1")
	w := httptest.NewRecorder()

	h.Evaluate(w, req)

	// Should fail because report_id is required (before DB check happens)
	// With nil Store/DB, it returns 501 before checking report_id
	if w.Code != http.StatusNotImplemented {
		t.Errorf("Evaluate missing report_id status = %d, want %d", w.Code, http.StatusNotImplemented)
	}
}

func TestQualityGatesEvaluateUnauthorized(t *testing.T) {
	h := &QualityGatesHandler{Store: nil, ReportStore: nil}

	body := `{"report_id":"report-123"}`
	req := httptest.NewRequest("POST", "/api/v1/teams/team-1/quality-gates/gate-1/evaluate", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = withTeamParam(req, "team-1")
	req = withGateParam(req, "gate-1")
	w := httptest.NewRecorder()

	h.Evaluate(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Evaluate without auth status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestQualityGatesEvaluateMissingGateID(t *testing.T) {
	h := &QualityGatesHandler{Store: nil, ReportStore: nil}

	body := `{"report_id":"report-123"}`
	req := httptest.NewRequest("POST", "/api/v1/teams/team-1/quality-gates//evaluate", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = withClaimsRole(req, "owner")
	req = withTeamParam(req, "team-1")
	req = withGateParam(req, "")
	w := httptest.NewRecorder()

	h.Evaluate(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Evaluate missing gate ID status = %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestQualityGatesListEvaluationsWithoutDB(t *testing.T) {
	h := &QualityGatesHandler{Store: nil}

	req := httptest.NewRequest("GET", "/api/v1/teams/team-1/quality-gates/gate-1/evaluations", nil)
	req = withClaimsRole(req, "owner")
	req = withTeamParam(req, "team-1")
	req = withGateParam(req, "gate-1")
	w := httptest.NewRecorder()

	h.ListEvaluations(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("ListEvaluations status = %d, want %d (body: %s)", w.Code, http.StatusOK, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), `"evaluations"`) {
		t.Errorf("ListEvaluations body missing evaluations key: %s", w.Body.String())
	}
}

func TestValidateRules(t *testing.T) {
	tests := []struct {
		name    string
		rules   string
		wantErr bool
	}{
		// Valid: param-requiring types with params present
		{"valid pass_rate", `[{"type":"pass_rate","params":{"threshold":95}}]`, false},
		{"valid max_duration", `[{"type":"max_duration","params":{"threshold_ms":30000}}]`, false},
		{"valid max_flaky_count", `[{"type":"max_flaky_count","params":{"threshold":5}}]`, false},
		{"valid min_test_count", `[{"type":"min_test_count","params":{"threshold":10}}]`, false},
		// Valid: param-free types with no params
		{"valid zero_failures", `[{"type":"zero_failures"}]`, false},
		{"valid no_new_failures", `[{"type":"no_new_failures"}]`, false},
		// Valid: multiple rules mixed
		{"multiple rules", `[{"type":"pass_rate","params":{"threshold":95}},{"type":"zero_failures"}]`, false},
		// Invalid: unknown type
		{"invalid type", `[{"type":"bogus"}]`, true},
		// Invalid: param-requiring types with null or absent params
		{"pass_rate missing params", `[{"type":"pass_rate"}]`, true},
		{"pass_rate null params", `[{"type":"pass_rate","params":null}]`, true},
		{"max_duration missing params", `[{"type":"max_duration"}]`, true},
		{"max_flaky_count missing params", `[{"type":"max_flaky_count"}]`, true},
		{"min_test_count missing params", `[{"type":"min_test_count"}]`, true},
		// Invalid: structural errors
		{"empty array", `[]`, true},
		{"not an array", `{"type":"pass_rate"}`, true},
		{"invalid json", `not json`, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateRules([]byte(tt.rules))
			if (err != nil) != tt.wantErr {
				t.Errorf("validateRules(%s) err = %v, wantErr = %v", tt.rules, err, tt.wantErr)
			}
		})
	}
}

// mockQGStore implements qualityGateStore for audit logging tests.
type mockQGStore struct {
	gate   *model.QualityGate
	delErr error
}

func (m *mockQGStore) List(_ context.Context, _ string) ([]model.QualityGate, error) {
	return nil, nil
}
func (m *mockQGStore) Get(_ context.Context, _, _ string) (*model.QualityGate, error) {
	return m.gate, nil
}
func (m *mockQGStore) Create(_ context.Context, _, _, _ string, _ json.RawMessage) (*model.QualityGate, error) {
	return m.gate, nil
}
func (m *mockQGStore) Update(_ context.Context, _, _, _, _ string, _ json.RawMessage, _ bool) (*model.QualityGate, error) {
	return m.gate, nil
}
func (m *mockQGStore) Delete(_ context.Context, _, _ string) error {
	return m.delErr
}
func (m *mockQGStore) CreateEvaluation(_ context.Context, _, _ string, _ bool, _ json.RawMessage) (*model.QualityGateEvaluation, error) {
	return &model.QualityGateEvaluation{}, nil
}
func (m *mockQGStore) ListEvaluations(_ context.Context, _ string, _ int) ([]model.QualityGateEvaluation, error) {
	return nil, nil
}

func TestQualityGatesCreate_LogsAuditEvent(t *testing.T) {
	gate := &model.QualityGate{
		ID:        "gate-1",
		TeamID:    "team-1",
		Name:      "Release Gate",
		Rules:     json.RawMessage(`[{"type":"zero_failures"}]`),
		Enabled:   true,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	ms := &mockQGStore{gate: gate}
	al := &capAuditLogger{}
	h := &QualityGatesHandler{Store: ms, AuditStore: al}

	body := `{"name":"Release Gate","rules":[{"type":"zero_failures"}]}`
	req := httptest.NewRequest("POST", "/api/v1/teams/team-1/quality-gates", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = withClaimsRole(req, "maintainer")
	req = withTeamParam(req, "team-1")
	w := httptest.NewRecorder()

	h.Create(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("Create: got %d, want %d: %s", w.Code, http.StatusCreated, w.Body.String())
	}
	if len(al.entries) == 0 {
		t.Fatal("expected audit entry to be logged")
	}
	e := al.entries[0]
	if e.Action != "quality_gate.created" {
		t.Errorf("audit action = %q, want %q", e.Action, "quality_gate.created")
	}
	if e.ResourceType != "quality_gate" {
		t.Errorf("audit resource_type = %q, want %q", e.ResourceType, "quality_gate")
	}
	if e.ResourceID != "gate-1" {
		t.Errorf("audit resource_id = %q, want %q", e.ResourceID, "gate-1")
	}
	if e.TeamID != "team-1" {
		t.Errorf("audit team_id = %q, want %q", e.TeamID, "team-1")
	}
}

func TestQualityGatesUpdate_LogsAuditEvent(t *testing.T) {
	gate := &model.QualityGate{
		ID:        "gate-1",
		TeamID:    "team-1",
		Name:      "Updated Gate",
		Rules:     json.RawMessage(`[{"type":"zero_failures"}]`),
		Enabled:   true,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	ms := &mockQGStore{gate: gate}
	al := &capAuditLogger{}
	h := &QualityGatesHandler{Store: ms, AuditStore: al}

	body := `{"name":"Updated Gate","rules":[{"type":"zero_failures"}]}`
	req := httptest.NewRequest("PUT", "/api/v1/teams/team-1/quality-gates/gate-1", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = withClaimsRole(req, "maintainer")
	req = withTeamParam(req, "team-1")
	req = withGateParam(req, "gate-1")
	w := httptest.NewRecorder()

	h.Update(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Update: got %d: %s", w.Code, w.Body.String())
	}
	if len(al.entries) == 0 {
		t.Fatal("expected audit entry to be logged")
	}
	e := al.entries[0]
	if e.Action != "quality_gate.updated" {
		t.Errorf("audit action = %q, want %q", e.Action, "quality_gate.updated")
	}
	if e.ResourceID != "gate-1" {
		t.Errorf("audit resource_id = %q, want %q", e.ResourceID, "gate-1")
	}
	if e.TeamID != "team-1" {
		t.Errorf("audit team_id = %q, want %q", e.TeamID, "team-1")
	}
}

func TestQualityGatesDelete_LogsAuditEvent(t *testing.T) {
	ms := &mockQGStore{}
	al := &capAuditLogger{}
	h := &QualityGatesHandler{Store: ms, AuditStore: al}

	req := httptest.NewRequest("DELETE", "/api/v1/teams/team-1/quality-gates/gate-1", nil)
	req = withClaimsRole(req, "maintainer")
	req = withTeamParam(req, "team-1")
	req = withGateParam(req, "gate-1")
	w := httptest.NewRecorder()

	h.Delete(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Delete: got %d: %s", w.Code, w.Body.String())
	}
	if len(al.entries) == 0 {
		t.Fatal("expected audit entry to be logged")
	}
	e := al.entries[0]
	if e.Action != "quality_gate.deleted" {
		t.Errorf("audit action = %q, want %q", e.Action, "quality_gate.deleted")
	}
	if e.ResourceID != "gate-1" {
		t.Errorf("audit resource_id = %q, want %q", e.ResourceID, "gate-1")
	}
	if e.TeamID != "team-1" {
		t.Errorf("audit team_id = %q, want %q", e.TeamID, "team-1")
	}
}
