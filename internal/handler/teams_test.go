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

var testClaims = &auth.Claims{
	UserID: "user-1",
	Email:  "test@example.com",
	Role:   "owner",
	TeamID: "team-1",
}

func TestListTeams_Unauthorized(t *testing.T) {
	h := &TeamsHandler{}
	req := httptest.NewRequest("GET", "/api/v1/teams", nil)
	w := httptest.NewRecorder()
	h.List(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("List without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestListTeams_NoDB(t *testing.T) {
	h := &TeamsHandler{}
	req := httptest.NewRequest("GET", "/api/v1/teams", nil)
	req = testWithClaims(req, testClaims)
	w := httptest.NewRecorder()
	h.List(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("List with nil DB: got %d, want %d", w.Code, http.StatusOK)
	}
	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	teams, ok := resp["teams"].([]interface{})
	if !ok || len(teams) != 0 {
		t.Errorf("expected empty teams array, got %v", resp["teams"])
	}
}

func TestCreateTeam_Unauthorized(t *testing.T) {
	h := &TeamsHandler{}
	req := httptest.NewRequest("POST", "/api/v1/teams", strings.NewReader(`{"name":"test"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.Create(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("Create without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestCreateTeam_InvalidRequest(t *testing.T) {
	h := &TeamsHandler{}
	req := httptest.NewRequest("POST", "/api/v1/teams", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	req = testWithClaims(req, testClaims)
	w := httptest.NewRecorder()
	h.Create(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("Create with empty name: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestCreateTeam_NoDB(t *testing.T) {
	h := &TeamsHandler{}
	req := httptest.NewRequest("POST", "/api/v1/teams", strings.NewReader(`{"name":"test-team"}`))
	req.Header.Set("Content-Type", "application/json")
	req = testWithClaims(req, testClaims)
	w := httptest.NewRecorder()
	h.Create(w, req)
	if w.Code != http.StatusNotImplemented {
		t.Errorf("Create with nil DB: got %d, want %d", w.Code, http.StatusNotImplemented)
	}
}

func TestGetTeam_Unauthorized(t *testing.T) {
	h := &TeamsHandler{}
	req := httptest.NewRequest("GET", "/api/v1/teams/team-1", nil)
	req = testWithChiParam(req, "teamID", "team-1")
	w := httptest.NewRecorder()
	h.Get(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("Get without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestGetTeam_MissingID(t *testing.T) {
	h := &TeamsHandler{}
	req := httptest.NewRequest("GET", "/api/v1/teams/", nil)
	req = testWithClaims(req, testClaims)
	w := httptest.NewRecorder()
	h.Get(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("Get with missing ID: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestGetTeam_NoDB(t *testing.T) {
	h := &TeamsHandler{}
	req := httptest.NewRequest("GET", "/api/v1/teams/team-1", nil)
	req = testWithClaimsAndParam(req, testClaims, "teamID", "team-1")
	w := httptest.NewRecorder()
	h.Get(w, req)
	if w.Code != http.StatusNotImplemented {
		t.Errorf("Get with nil DB: got %d, want %d", w.Code, http.StatusNotImplemented)
	}
}

func TestDeleteTeam_Unauthorized(t *testing.T) {
	h := &TeamsHandler{}
	req := httptest.NewRequest("DELETE", "/api/v1/teams/team-1", nil)
	req = testWithChiParam(req, "teamID", "team-1")
	w := httptest.NewRecorder()
	h.Delete(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("Delete without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestDeleteTeam_NoDB(t *testing.T) {
	h := &TeamsHandler{}
	req := httptest.NewRequest("DELETE", "/api/v1/teams/team-1", nil)
	req = testWithClaimsAndParam(req, testClaims, "teamID", "team-1")
	w := httptest.NewRecorder()
	h.Delete(w, req)
	if w.Code != http.StatusNotImplemented {
		t.Errorf("Delete with nil DB: got %d, want %d", w.Code, http.StatusNotImplemented)
	}
}

func TestListTokens_Unauthorized(t *testing.T) {
	h := &TeamsHandler{}
	req := httptest.NewRequest("GET", "/api/v1/teams/team-1/tokens", nil)
	req = testWithChiParam(req, "teamID", "team-1")
	w := httptest.NewRecorder()
	h.ListTokens(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("ListTokens without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestListTokens_NoDB(t *testing.T) {
	h := &TeamsHandler{}
	req := httptest.NewRequest("GET", "/api/v1/teams/team-1/tokens", nil)
	req = testWithClaimsAndParam(req, testClaims, "teamID", "team-1")
	w := httptest.NewRecorder()
	h.ListTokens(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("ListTokens with nil DB: got %d, want %d", w.Code, http.StatusOK)
	}
	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	tokens, ok := resp["tokens"].([]interface{})
	if !ok || len(tokens) != 0 {
		t.Errorf("expected empty tokens array, got %v", resp["tokens"])
	}
}

func TestCreateToken_Unauthorized(t *testing.T) {
	h := &TeamsHandler{}
	req := httptest.NewRequest("POST", "/api/v1/teams/team-1/tokens", strings.NewReader(`{"name":"ci"}`))
	req.Header.Set("Content-Type", "application/json")
	req = testWithChiParam(req, "teamID", "team-1")
	w := httptest.NewRecorder()
	h.CreateToken(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("CreateToken without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestCreateToken_InvalidRequest(t *testing.T) {
	h := &TeamsHandler{}
	req := httptest.NewRequest("POST", "/api/v1/teams/team-1/tokens", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	req = testWithClaimsAndParam(req, testClaims, "teamID", "team-1")
	w := httptest.NewRecorder()
	h.CreateToken(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("CreateToken with empty name: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestCreateToken_NoDB(t *testing.T) {
	h := &TeamsHandler{}
	req := httptest.NewRequest("POST", "/api/v1/teams/team-1/tokens", strings.NewReader(`{"name":"ci"}`))
	req.Header.Set("Content-Type", "application/json")
	req = testWithClaimsAndParam(req, testClaims, "teamID", "team-1")
	w := httptest.NewRecorder()
	h.CreateToken(w, req)
	if w.Code != http.StatusNotImplemented {
		t.Errorf("CreateToken with nil DB: got %d, want %d", w.Code, http.StatusNotImplemented)
	}
}

func TestDeleteToken_Unauthorized(t *testing.T) {
	h := &TeamsHandler{}
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("teamID", "team-1")
	rctx.URLParams.Add("tokenID", "tok-1")
	req := httptest.NewRequest("DELETE", "/api/v1/teams/team-1/tokens/tok-1", nil)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	w := httptest.NewRecorder()
	h.DeleteToken(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("DeleteToken without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestDeleteToken_MissingTokenID(t *testing.T) {
	h := &TeamsHandler{}
	req := httptest.NewRequest("DELETE", "/api/v1/teams/team-1/tokens/", nil)
	req = testWithClaimsAndParam(req, testClaims, "teamID", "team-1")
	w := httptest.NewRecorder()
	h.DeleteToken(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("DeleteToken with missing token ID: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestDeleteToken_NoDB(t *testing.T) {
	h := &TeamsHandler{}
	req := httptest.NewRequest("DELETE", "/api/v1/teams/team-1/tokens/tok-1", nil)
	req = testWithClaimsAndParams(req, testClaims, map[string]string{"teamID": "team-1", "tokenID": "tok-1"})
	w := httptest.NewRecorder()
	h.DeleteToken(w, req)
	if w.Code != http.StatusNotImplemented {
		t.Errorf("DeleteToken with nil DB: got %d, want %d", w.Code, http.StatusNotImplemented)
	}
}

// mockTeamsStore implements teamsStore for audit logging tests.
type mockTeamsStore struct {
	team    *model.Team
	token   *model.APIToken
	role    string
	roleErr error
	delErr  error
	delRows int64
}

func (m *mockTeamsStore) CreateTeam(_ context.Context, _, _ string) (*model.Team, error) {
	return m.team, nil
}

func (m *mockTeamsStore) GetUserRole(_ context.Context, _, _ string) (string, error) {
	return m.role, m.roleErr
}

func (m *mockTeamsStore) DeleteTeam(_ context.Context, _ string) error {
	return m.delErr
}

func (m *mockTeamsStore) CreateToken(_ context.Context, _, _, _, _, _ string) (*model.APIToken, error) {
	return m.token, nil
}

func (m *mockTeamsStore) DeleteToken(_ context.Context, _, _ string) (int64, error) {
	return m.delRows, m.delErr
}

// --- Audit logging tests ---

func TestTeamsCreate_LogsAuditEvent(t *testing.T) {
	team := &model.Team{ID: "team-1", Name: "My Team", CreatedAt: time.Now()}
	ms := &mockTeamsStore{team: team}
	al := &capAuditLogger{}
	h := &TeamsHandler{Store: ms, AuditStore: al}

	body := `{"name":"My Team"}`
	req := httptest.NewRequest("POST", "/api/v1/teams", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = testWithClaims(req, testClaims)
	w := httptest.NewRecorder()

	h.Create(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("Create: got %d, want %d: %s", w.Code, http.StatusCreated, w.Body.String())
	}
	if len(al.entries) == 0 {
		t.Fatal("expected audit entry to be logged")
	}
	e := al.entries[0]
	if e.Action != "team.created" {
		t.Errorf("audit action = %q, want %q", e.Action, "team.created")
	}
	if e.ResourceType != "team" {
		t.Errorf("audit resource_type = %q, want %q", e.ResourceType, "team")
	}
	if e.ResourceID != "team-1" {
		t.Errorf("audit resource_id = %q, want %q", e.ResourceID, "team-1")
	}
}

func TestTeamsDelete_LogsAuditEvent(t *testing.T) {
	ms := &mockTeamsStore{role: "owner", delRows: 1}
	al := &capAuditLogger{}
	h := &TeamsHandler{Store: ms, AuditStore: al}

	req := httptest.NewRequest("DELETE", "/api/v1/teams/team-1", nil)
	req = testWithClaimsAndParam(req, testClaims, "teamID", "team-1")
	w := httptest.NewRecorder()

	h.Delete(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Delete: got %d: %s", w.Code, w.Body.String())
	}
	if len(al.entries) == 0 {
		t.Fatal("expected audit entry to be logged")
	}
	e := al.entries[0]
	if e.Action != "team.deleted" {
		t.Errorf("audit action = %q, want %q", e.Action, "team.deleted")
	}
	if e.ResourceType != "team" {
		t.Errorf("audit resource_type = %q, want %q", e.ResourceType, "team")
	}
	if e.ResourceID != "team-1" {
		t.Errorf("audit resource_id = %q, want %q", e.ResourceID, "team-1")
	}
}

func TestTeamsCreateToken_LogsAuditEvent(t *testing.T) {
	tok := &model.APIToken{ID: "tok-1", TeamID: "team-1", UserID: "user-1", Name: "ci", Prefix: "sct_ci", CreatedAt: time.Now()}
	ms := &mockTeamsStore{role: "owner", token: tok}
	al := &capAuditLogger{}
	h := &TeamsHandler{Store: ms, AuditStore: al}

	body := `{"name":"ci"}`
	req := httptest.NewRequest("POST", "/api/v1/teams/team-1/tokens", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = testWithClaimsAndParam(req, testClaims, "teamID", "team-1")
	w := httptest.NewRecorder()

	h.CreateToken(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("CreateToken: got %d: %s", w.Code, w.Body.String())
	}
	if len(al.entries) == 0 {
		t.Fatal("expected audit entry to be logged")
	}
	e := al.entries[0]
	if e.Action != "token.created" {
		t.Errorf("audit action = %q, want %q", e.Action, "token.created")
	}
	if e.ResourceType != "token" {
		t.Errorf("audit resource_type = %q, want %q", e.ResourceType, "token")
	}
	if e.ResourceID != "tok-1" {
		t.Errorf("audit resource_id = %q, want %q", e.ResourceID, "tok-1")
	}
}

func TestTeamsDeleteToken_LogsAuditEvent(t *testing.T) {
	ms := &mockTeamsStore{role: "owner", delRows: 1}
	al := &capAuditLogger{}
	h := &TeamsHandler{Store: ms, AuditStore: al}

	req := httptest.NewRequest("DELETE", "/api/v1/teams/team-1/tokens/tok-1", nil)
	req = testWithClaimsAndParams(req, testClaims, map[string]string{"teamID": "team-1", "tokenID": "tok-1"})
	w := httptest.NewRecorder()

	h.DeleteToken(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("DeleteToken: got %d: %s", w.Code, w.Body.String())
	}
	if len(al.entries) == 0 {
		t.Fatal("expected audit entry to be logged")
	}
	e := al.entries[0]
	if e.Action != "token.deleted" {
		t.Errorf("audit action = %q, want %q", e.Action, "token.deleted")
	}
	if e.ResourceType != "token" {
		t.Errorf("audit resource_type = %q, want %q", e.ResourceType, "token")
	}
	if e.ResourceID != "tok-1" {
		t.Errorf("audit resource_id = %q, want %q", e.ResourceID, "tok-1")
	}
}
