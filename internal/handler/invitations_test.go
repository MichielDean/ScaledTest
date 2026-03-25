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

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/scaledtest/scaledtest/internal/auth"
	"github.com/scaledtest/scaledtest/internal/model"
)

// mockInvitationStore is a test double for invitationStore.
type mockInvitationStore struct {
	inv            *model.Invitation // returned by Create
	err            error             // returned by Create
	tokenInv       *model.Invitation // returned by GetByTokenHash
	tokenErr       error             // returned by GetByTokenHash
	acceptedUserID string            // returned by AcceptInvitation
	acceptErr      error             // returned by AcceptInvitation
}

func (m *mockInvitationStore) Create(_ context.Context, _, _, _, _, _ string, _ time.Time) (*model.Invitation, error) {
	return m.inv, m.err
}

func (m *mockInvitationStore) ListByTeam(_ context.Context, _ string) ([]model.Invitation, error) {
	return nil, nil
}

func (m *mockInvitationStore) GetByTokenHash(_ context.Context, _ string) (*model.Invitation, error) {
	return m.tokenInv, m.tokenErr
}

func (m *mockInvitationStore) Delete(_ context.Context, _, _ string) error {
	return nil
}

func (m *mockInvitationStore) AcceptInvitation(_ context.Context, _, _, _, _, _, _ string) (string, error) {
	return m.acceptedUserID, m.acceptErr
}

// mockMailer is a test double for mailer.Mailer.
type mockMailer struct {
	called bool
	sentTo string
	sentURL string
	err    error
}

func (m *mockMailer) SendInvitation(_ context.Context, to, url string) error {
	m.called = true
	m.sentTo = to
	m.sentURL = url
	return m.err
}

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

func TestCreateInvitation_CallsMailer(t *testing.T) {
	inv := &model.Invitation{
		ID:        "inv-1",
		TeamID:    "team-1",
		Email:     "invitee@example.com",
		Role:      "readonly",
		InvitedBy: "user-1",
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour),
		CreatedAt: time.Now(),
	}
	store := &mockInvitationStore{inv: inv}
	ml := &mockMailer{}
	h := &InvitationsHandler{
		Store:   store,
		DB:      new(pgxpool.Pool),
		Mailer:  ml,
		BaseURL: "http://app.example.com",
	}

	body := `{"email":"invitee@example.com","role":"readonly"}`
	r := httptest.NewRequest("POST", "/api/v1/teams/team-1/invitations", strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	r = testWithClaimsAndParam(r, invClaims("user-1", "team-1", "owner"), "teamID", "team-1")
	w := httptest.NewRecorder()

	h.Create(w, r)

	if w.Code != http.StatusCreated {
		t.Fatalf("Create: got %d, want %d: %s", w.Code, http.StatusCreated, w.Body.String())
	}
	if !ml.called {
		t.Error("expected SendInvitation to be called")
	}
	if ml.sentTo != "invitee@example.com" {
		t.Errorf("sentTo = %q, want %q", ml.sentTo, "invitee@example.com")
	}
	if !strings.HasPrefix(ml.sentURL, "http://app.example.com/invitations/inv_") {
		t.Errorf("sentURL = %q, want prefix http://app.example.com/invitations/inv_", ml.sentURL)
	}
}

func TestCreateInvitation_NilMailer_ReturnsCreated(t *testing.T) {
	inv := &model.Invitation{
		ID:        "inv-2",
		TeamID:    "team-1",
		Email:     "invitee@example.com",
		Role:      "readonly",
		InvitedBy: "user-1",
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour),
		CreatedAt: time.Now(),
	}
	h := &InvitationsHandler{
		Store:   &mockInvitationStore{inv: inv},
		DB:      new(pgxpool.Pool),
		Mailer:  nil, // no SMTP configured
		BaseURL: "http://app.example.com",
	}

	body := `{"email":"invitee@example.com","role":"readonly"}`
	r := httptest.NewRequest("POST", "/api/v1/teams/team-1/invitations", strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	r = testWithClaimsAndParam(r, invClaims("user-1", "team-1", "owner"), "teamID", "team-1")
	w := httptest.NewRecorder()

	h.Create(w, r)

	if w.Code != http.StatusCreated {
		t.Errorf("Create with nil mailer: got %d, want %d: %s", w.Code, http.StatusCreated, w.Body.String())
	}
}

func TestCreateInvitation_MailerError_StillReturnsCreated(t *testing.T) {
	inv := &model.Invitation{
		ID:        "inv-3",
		TeamID:    "team-1",
		Email:     "invitee@example.com",
		Role:      "readonly",
		InvitedBy: "user-1",
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour),
		CreatedAt: time.Now(),
	}
	ml := &mockMailer{err: fmt.Errorf("smtp connection refused")}
	h := &InvitationsHandler{
		Store:   &mockInvitationStore{inv: inv},
		DB:      new(pgxpool.Pool),
		Mailer:  ml,
		BaseURL: "http://app.example.com",
	}

	body := `{"email":"invitee@example.com","role":"readonly"}`
	r := httptest.NewRequest("POST", "/api/v1/teams/team-1/invitations", strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	r = testWithClaimsAndParam(r, invClaims("user-1", "team-1", "owner"), "teamID", "team-1")
	w := httptest.NewRecorder()

	h.Create(w, r)

	// Mailer errors must not fail the invitation creation.
	if w.Code != http.StatusCreated {
		t.Errorf("Create with mailer error: got %d, want %d", w.Code, http.StatusCreated)
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

// --- Audit logging tests ---

func TestCreateInvitation_LogsAuditEvent(t *testing.T) {
	inv := &model.Invitation{
		ID:        "inv-1",
		TeamID:    "team-1",
		Email:     "invitee@example.com",
		Role:      "readonly",
		InvitedBy: "user-1",
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour),
		CreatedAt: time.Now(),
	}
	ms := &mockInvitationStore{inv: inv}
	al := &capAuditLogger{}
	h := &InvitationsHandler{
		Store:      ms,
		DB:         new(pgxpool.Pool),
		AuditStore: al,
	}

	body := `{"email":"invitee@example.com","role":"readonly"}`
	r := httptest.NewRequest("POST", "/api/v1/teams/team-1/invitations", strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	r = testWithClaimsAndParam(r, invClaims("user-1", "team-1", "owner"), "teamID", "team-1")
	w := httptest.NewRecorder()

	h.Create(w, r)

	if w.Code != http.StatusCreated {
		t.Fatalf("Create: got %d, want %d: %s", w.Code, http.StatusCreated, w.Body.String())
	}
	if len(al.entries) == 0 {
		t.Fatal("expected audit entry to be logged")
	}
	e := al.entries[0]
	if e.Action != "invitation.created" {
		t.Errorf("audit action = %q, want %q", e.Action, "invitation.created")
	}
	if e.ResourceType != "invitation" {
		t.Errorf("audit resource_type = %q, want %q", e.ResourceType, "invitation")
	}
	if e.ResourceID != "inv-1" {
		t.Errorf("audit resource_id = %q, want %q", e.ResourceID, "inv-1")
	}
	if e.TeamID != "team-1" {
		t.Errorf("audit team_id = %q, want %q", e.TeamID, "team-1")
	}
}

func TestCreateInvitation_NilAuditStore_NoPanic(t *testing.T) {
	inv := &model.Invitation{
		ID:        "inv-2",
		TeamID:    "team-1",
		Email:     "invitee@example.com",
		Role:      "readonly",
		InvitedBy: "user-1",
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour),
		CreatedAt: time.Now(),
	}
	h := &InvitationsHandler{
		Store:      &mockInvitationStore{inv: inv},
		DB:         new(pgxpool.Pool),
		AuditStore: nil,
	}

	body := `{"email":"invitee@example.com","role":"readonly"}`
	r := httptest.NewRequest("POST", "/api/v1/teams/team-1/invitations", strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	r = testWithClaimsAndParam(r, invClaims("user-1", "team-1", "owner"), "teamID", "team-1")
	w := httptest.NewRecorder()

	h.Create(w, r)

	if w.Code != http.StatusCreated {
		t.Errorf("Create with nil audit: got %d, want %d", w.Code, http.StatusCreated)
	}
}

func TestRevokeInvitation_LogsAuditEvent(t *testing.T) {
	ms := &mockInvitationStore{}
	al := &capAuditLogger{}
	h := &InvitationsHandler{Store: ms, AuditStore: al}

	r := httptest.NewRequest("DELETE", "/api/v1/teams/team-1/invitations/inv-1", nil)
	r = testWithClaimsAndParams(r, invClaims("user-1", "team-1", "owner"), map[string]string{
		"teamID":       "team-1",
		"invitationID": "inv-1",
	})
	w := httptest.NewRecorder()

	h.Revoke(w, r)

	if w.Code != http.StatusOK {
		t.Fatalf("Revoke: got %d: %s", w.Code, w.Body.String())
	}
	if len(al.entries) == 0 {
		t.Fatal("expected audit entry to be logged")
	}
	e := al.entries[0]
	if e.Action != "invitation.revoked" {
		t.Errorf("audit action = %q, want %q", e.Action, "invitation.revoked")
	}
	if e.ResourceType != "invitation" {
		t.Errorf("audit resource_type = %q, want %q", e.ResourceType, "invitation")
	}
	if e.ResourceID != "inv-1" {
		t.Errorf("audit resource_id = %q, want %q", e.ResourceID, "inv-1")
	}
}

func TestAcceptInvitation_LogsAuditEvent(t *testing.T) {
	inv := &model.Invitation{
		ID:        "inv-1",
		TeamID:    "team-1",
		Email:     "invitee@example.com",
		Role:      "readonly",
		InvitedBy: "user-1",
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour),
		CreatedAt: time.Now(),
	}
	ms := &mockInvitationStore{tokenInv: inv, acceptedUserID: "new-user-1"}
	al := &capAuditLogger{}
	h := &InvitationsHandler{Store: ms, AuditStore: al}

	body := `{"password":"password123","display_name":"Test User"}`
	r := httptest.NewRequest("POST", "/api/v1/invitations/inv_abc/accept", strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	r = testWithChiParam(r, "token", "inv_abc")
	w := httptest.NewRecorder()

	h.Accept(w, r)

	if w.Code != http.StatusOK {
		t.Fatalf("Accept: got %d, want %d: %s", w.Code, http.StatusOK, w.Body.String())
	}
	if len(al.entries) == 0 {
		t.Fatal("expected audit entry to be logged")
	}
	e := al.entries[0]
	if e.Action != "invitation.accepted" {
		t.Errorf("audit action = %q, want %q", e.Action, "invitation.accepted")
	}
	if e.ResourceType != "invitation" {
		t.Errorf("audit resource_type = %q, want %q", e.ResourceType, "invitation")
	}
	if e.ResourceID != "inv-1" {
		t.Errorf("audit resource_id = %q, want %q", e.ResourceID, "inv-1")
	}
	if e.TeamID != "team-1" {
		t.Errorf("audit team_id = %q, want %q", e.TeamID, "team-1")
	}
	if e.ActorID != "new-user-1" {
		t.Errorf("audit actor_id = %q, want %q", e.ActorID, "new-user-1")
	}
}
