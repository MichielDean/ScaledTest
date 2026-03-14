package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/scaledtest/scaledtest/internal/auth"
)

func TestCreateInvitation_Unauthorized(t *testing.T) {
	h := &InvitationsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/teams/t1/invitations", strings.NewReader(`{}`))

	h.Create(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Create without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestCreateInvitation_MissingTeamID(t *testing.T) {
	h := &InvitationsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/teams//invitations", strings.NewReader(`{}`))
	r = testWithClaimsSimple(r, "user-1", "team-1", "owner")
	r = testWithChiParam(r, "teamID", "")

	h.Create(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Create with empty teamID: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestCreateInvitation_ReadonlyForbidden(t *testing.T) {
	h := &InvitationsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/teams/t1/invitations", strings.NewReader(`{}`))
	r = testWithClaimsAndParam(r, invClaims("user-1", "team-1", "readonly"), "teamID", "team-1")

	h.Create(w, r)

	if w.Code != http.StatusForbidden {
		t.Errorf("Create as readonly: got %d, want %d", w.Code, http.StatusForbidden)
	}
}

func TestCreateInvitation_InvalidRole(t *testing.T) {
	h := &InvitationsHandler{}
	w := httptest.NewRecorder()
	body := `{"email":"test@example.com","role":"superadmin"}`
	r := httptest.NewRequest("POST", "/api/v1/teams/t1/invitations", strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	r = testWithClaimsAndParam(r, invClaims("user-1", "team-1", "owner"), "teamID", "team-1")

	h.Create(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Create with invalid role: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestCreateInvitation_NoDB(t *testing.T) {
	h := &InvitationsHandler{Store: nil, DB: nil}
	w := httptest.NewRecorder()
	body := `{"email":"test@example.com","role":"readonly"}`
	r := httptest.NewRequest("POST", "/api/v1/teams/t1/invitations", strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	r = testWithClaimsAndParam(r, invClaims("user-1", "team-1", "owner"), "teamID", "team-1")

	h.Create(w, r)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Create without DB: got %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestListInvitations_Unauthorized(t *testing.T) {
	h := &InvitationsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/teams/t1/invitations", nil)

	h.List(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("List without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestListInvitations_NilStore(t *testing.T) {
	h := &InvitationsHandler{Store: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/teams/t1/invitations", nil)
	r = testWithClaimsAndParam(r, invClaims("user-1", "team-1", "owner"), "teamID", "team-1")

	h.List(w, r)

	if w.Code != http.StatusOK {
		t.Errorf("List with nil store: got %d, want %d", w.Code, http.StatusOK)
	}

	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	invitations, ok := resp["invitations"].([]interface{})
	if !ok || len(invitations) != 0 {
		t.Errorf("expected empty invitations array, got %v", resp["invitations"])
	}
}

func TestPreviewInvitation_MissingToken(t *testing.T) {
	h := &InvitationsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/invitations/", nil)
	r = testWithChiParam(r, "token", "")

	h.Preview(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Preview with empty token: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestPreviewInvitation_NoDB(t *testing.T) {
	h := &InvitationsHandler{Store: nil, DB: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v1/invitations/inv_abc", nil)
	r = testWithChiParam(r, "token", "inv_abc")

	h.Preview(w, r)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Preview without DB: got %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestAcceptInvitation_MissingToken(t *testing.T) {
	h := &InvitationsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/invitations//accept", strings.NewReader(`{}`))
	r = testWithChiParam(r, "token", "")

	h.Accept(w, r)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Accept with empty token: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestAcceptInvitation_NoDB(t *testing.T) {
	h := &InvitationsHandler{Store: nil, DB: nil}
	w := httptest.NewRecorder()
	body := `{"password":"password123","display_name":"Test User"}`
	r := httptest.NewRequest("POST", "/api/v1/invitations/inv_abc/accept", strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	r = testWithChiParam(r, "token", "inv_abc")

	h.Accept(w, r)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Accept without DB: got %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestAcceptInvitation_InvalidBody(t *testing.T) {
	// With nil DB, handler returns 503 before parsing body
	h := &InvitationsHandler{Store: nil, DB: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/invitations/inv_abc/accept", strings.NewReader(`{invalid}`))
	r.Header.Set("Content-Type", "application/json")
	r = testWithChiParam(r, "token", "inv_abc")

	h.Accept(w, r)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Accept with nil DB: got %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestRevokeInvitation_Unauthorized(t *testing.T) {
	h := &InvitationsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("DELETE", "/api/v1/teams/t1/invitations/inv1", nil)
	r = testWithChiParam(r, "teamID", "t1")

	h.Revoke(w, r)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Revoke without claims: got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestRevokeInvitation_ReadonlyForbidden(t *testing.T) {
	h := &InvitationsHandler{}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("DELETE", "/api/v1/teams/t1/invitations/inv1", nil)
	r = testWithClaimsAndParams(r, invClaims("user-1", "team-1", "readonly"), map[string]string{
		"teamID":       "t1",
		"invitationID": "inv1",
	})

	h.Revoke(w, r)

	if w.Code != http.StatusForbidden {
		t.Errorf("Revoke as readonly: got %d, want %d", w.Code, http.StatusForbidden)
	}
}

func TestRevokeInvitation_NoDB(t *testing.T) {
	h := &InvitationsHandler{Store: nil}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("DELETE", "/api/v1/teams/t1/invitations/inv1", nil)
	r = testWithClaimsAndParams(r, invClaims("user-1", "team-1", "owner"), map[string]string{
		"teamID":       "t1",
		"invitationID": "inv1",
	})

	h.Revoke(w, r)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Revoke without store: got %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestInvitationTokenGeneration(t *testing.T) {
	tok, hash, err := generateInvitationToken()
	if err != nil {
		t.Fatalf("generateInvitationToken() error: %v", err)
	}
	if !strings.HasPrefix(tok, "inv_") {
		t.Errorf("token should have inv_ prefix, got %q", tok)
	}
	if len(hash) != 64 { // SHA-256 hex
		t.Errorf("hash length = %d, want 64", len(hash))
	}

	// Verify hash matches
	rehash := hashInvitationToken(tok)
	if rehash != hash {
		t.Error("hashInvitationToken does not match generated hash")
	}
}

func TestInvitationTokenUniqueness(t *testing.T) {
	t1, _, _ := generateInvitationToken()
	t2, _, _ := generateInvitationToken()
	if t1 == t2 {
		t.Error("two generated tokens are identical")
	}
}

// invClaims is a helper to create auth.Claims for invitation tests.
func invClaims(userID, teamID, role string) *auth.Claims {
	return &auth.Claims{
		UserID: userID,
		TeamID: teamID,
		Role:   role,
	}
}
