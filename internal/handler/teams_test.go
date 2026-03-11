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

func withClaims(r *http.Request, claims *auth.Claims) *http.Request {
	ctx := context.WithValue(r.Context(), auth.ClaimsContextKey, claims)
	return r.WithContext(ctx)
}

func withChiURLParam(r *http.Request, key, value string) *http.Request {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add(key, value)
	return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
}

func withClaimsAndParam(r *http.Request, claims *auth.Claims, key, value string) *http.Request {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add(key, value)
	ctx := context.WithValue(r.Context(), chi.RouteCtxKey, rctx)
	ctx = context.WithValue(ctx, auth.ClaimsContextKey, claims)
	return r.WithContext(ctx)
}

func withClaimsAndParams(r *http.Request, claims *auth.Claims, params map[string]string) *http.Request {
	rctx := chi.NewRouteContext()
	for k, v := range params {
		rctx.URLParams.Add(k, v)
	}
	ctx := context.WithValue(r.Context(), chi.RouteCtxKey, rctx)
	ctx = context.WithValue(ctx, auth.ClaimsContextKey, claims)
	return r.WithContext(ctx)
}

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
	req = withClaims(req, testClaims)
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
	req = withClaims(req, testClaims)
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
	req = withClaims(req, testClaims)
	w := httptest.NewRecorder()
	h.Create(w, req)
	if w.Code != http.StatusNotImplemented {
		t.Errorf("Create with nil DB: got %d, want %d", w.Code, http.StatusNotImplemented)
	}
}

func TestGetTeam_Unauthorized(t *testing.T) {
	h := &TeamsHandler{}
	req := httptest.NewRequest("GET", "/api/v1/teams/team-1", nil)
	req = withChiURLParam(req, "teamID", "team-1")
	w := httptest.NewRecorder()
	h.Get(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("Get without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestGetTeam_MissingID(t *testing.T) {
	h := &TeamsHandler{}
	req := httptest.NewRequest("GET", "/api/v1/teams/", nil)
	req = withClaims(req, testClaims)
	w := httptest.NewRecorder()
	h.Get(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("Get with missing ID: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestGetTeam_NoDB(t *testing.T) {
	h := &TeamsHandler{}
	req := httptest.NewRequest("GET", "/api/v1/teams/team-1", nil)
	req = withClaimsAndParam(req, testClaims, "teamID", "team-1")
	w := httptest.NewRecorder()
	h.Get(w, req)
	if w.Code != http.StatusNotImplemented {
		t.Errorf("Get with nil DB: got %d, want %d", w.Code, http.StatusNotImplemented)
	}
}

func TestDeleteTeam_Unauthorized(t *testing.T) {
	h := &TeamsHandler{}
	req := httptest.NewRequest("DELETE", "/api/v1/teams/team-1", nil)
	req = withChiURLParam(req, "teamID", "team-1")
	w := httptest.NewRecorder()
	h.Delete(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("Delete without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestDeleteTeam_NoDB(t *testing.T) {
	h := &TeamsHandler{}
	req := httptest.NewRequest("DELETE", "/api/v1/teams/team-1", nil)
	req = withClaimsAndParam(req, testClaims, "teamID", "team-1")
	w := httptest.NewRecorder()
	h.Delete(w, req)
	if w.Code != http.StatusNotImplemented {
		t.Errorf("Delete with nil DB: got %d, want %d", w.Code, http.StatusNotImplemented)
	}
}

func TestListTokens_Unauthorized(t *testing.T) {
	h := &TeamsHandler{}
	req := httptest.NewRequest("GET", "/api/v1/teams/team-1/tokens", nil)
	req = withChiURLParam(req, "teamID", "team-1")
	w := httptest.NewRecorder()
	h.ListTokens(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("ListTokens without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestListTokens_NoDB(t *testing.T) {
	h := &TeamsHandler{}
	req := httptest.NewRequest("GET", "/api/v1/teams/team-1/tokens", nil)
	req = withClaimsAndParam(req, testClaims, "teamID", "team-1")
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
	req = withChiURLParam(req, "teamID", "team-1")
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
	req = withClaimsAndParam(req, testClaims, "teamID", "team-1")
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
	req = withClaimsAndParam(req, testClaims, "teamID", "team-1")
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
	req = withClaimsAndParam(req, testClaims, "teamID", "team-1")
	w := httptest.NewRecorder()
	h.DeleteToken(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("DeleteToken with missing token ID: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestDeleteToken_NoDB(t *testing.T) {
	h := &TeamsHandler{}
	req := httptest.NewRequest("DELETE", "/api/v1/teams/team-1/tokens/tok-1", nil)
	req = withClaimsAndParams(req, testClaims, map[string]string{"teamID": "team-1", "tokenID": "tok-1"})
	w := httptest.NewRecorder()
	h.DeleteToken(w, req)
	if w.Code != http.StatusNotImplemented {
		t.Errorf("DeleteToken with nil DB: got %d, want %d", w.Code, http.StatusNotImplemented)
	}
}
