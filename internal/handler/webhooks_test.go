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

func webhookWithClaims(r *http.Request, role string) *http.Request {
	claims := &auth.Claims{
		UserID: "user-1",
		Email:  "test@example.com",
		Role:   role,
		TeamID: "team-1",
	}
	ctx := auth.SetClaims(r.Context(), claims)
	return r.WithContext(ctx)
}

func webhookWithTeamParam(r *http.Request, teamID string) *http.Request {
	rctx := chi.RouteContext(r.Context())
	if rctx == nil {
		rctx = chi.NewRouteContext()
		r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
	}
	rctx.URLParams.Add("teamID", teamID)
	return r
}

func webhookWithIDParam(r *http.Request, webhookID string) *http.Request {
	rctx := chi.RouteContext(r.Context())
	if rctx == nil {
		rctx = chi.NewRouteContext()
		r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
	}
	rctx.URLParams.Add("webhookID", webhookID)
	return r
}

func TestWebhooksListWithoutDB(t *testing.T) {
	h := &WebhooksHandler{Store: nil}

	req := httptest.NewRequest("GET", "/api/v1/teams/team-1/webhooks", nil)
	req = webhookWithClaims(req, "owner")
	req = webhookWithTeamParam(req, "team-1")
	w := httptest.NewRecorder()

	h.List(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("List status = %d, want %d", w.Code, http.StatusOK)
	}
	if !strings.Contains(w.Body.String(), `"webhooks"`) {
		t.Errorf("List body missing webhooks key: %s", w.Body.String())
	}
}

func TestWebhooksListUnauthorized(t *testing.T) {
	h := &WebhooksHandler{Store: nil}

	req := httptest.NewRequest("GET", "/api/v1/teams/team-1/webhooks", nil)
	w := httptest.NewRecorder()

	h.List(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("List without auth status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestWebhooksListWrongTeam(t *testing.T) {
	h := &WebhooksHandler{Store: nil}

	req := httptest.NewRequest("GET", "/api/v1/teams/other-team/webhooks", nil)
	req = webhookWithClaims(req, "owner")
	req = webhookWithTeamParam(req, "other-team")
	w := httptest.NewRecorder()

	h.List(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("List wrong team status = %d, want %d", w.Code, http.StatusForbidden)
	}
}

func TestWebhooksListReadonly(t *testing.T) {
	h := &WebhooksHandler{Store: nil}

	req := httptest.NewRequest("GET", "/api/v1/teams/team-1/webhooks", nil)
	req = webhookWithClaims(req, "readonly")
	req = webhookWithTeamParam(req, "team-1")
	w := httptest.NewRecorder()

	h.List(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("List readonly status = %d, want %d (readonly should be able to read)", w.Code, http.StatusOK)
	}
}

func TestWebhooksCreateWithoutDB(t *testing.T) {
	h := &WebhooksHandler{Store: nil}

	body := `{"url":"https://example.com/webhook","events":["report.submitted"]}`
	req := httptest.NewRequest("POST", "/api/v1/teams/team-1/webhooks", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = webhookWithClaims(req, "maintainer")
	req = webhookWithTeamParam(req, "team-1")
	w := httptest.NewRecorder()

	h.Create(w, req)

	if w.Code != http.StatusNotImplemented {
		t.Errorf("Create without DB status = %d, want %d", w.Code, http.StatusNotImplemented)
	}
}

func TestWebhooksCreateReadonlyForbidden(t *testing.T) {
	h := &WebhooksHandler{Store: nil}

	body := `{"url":"https://example.com/webhook","events":["report.submitted"]}`
	req := httptest.NewRequest("POST", "/api/v1/teams/team-1/webhooks", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = webhookWithClaims(req, "readonly")
	req = webhookWithTeamParam(req, "team-1")
	w := httptest.NewRecorder()

	h.Create(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("Create as readonly status = %d, want %d", w.Code, http.StatusForbidden)
	}
}

func TestWebhooksCreateInvalidBody(t *testing.T) {
	h := &WebhooksHandler{Store: nil}

	req := httptest.NewRequest("POST", "/api/v1/teams/team-1/webhooks", strings.NewReader(`{invalid}`))
	req.Header.Set("Content-Type", "application/json")
	req = webhookWithClaims(req, "maintainer")
	req = webhookWithTeamParam(req, "team-1")
	w := httptest.NewRecorder()

	h.Create(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Create invalid body status = %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestWebhooksCreateInvalidEvent(t *testing.T) {
	h := &WebhooksHandler{Store: nil}

	body := `{"url":"https://example.com/webhook","events":["invalid.event"]}`
	req := httptest.NewRequest("POST", "/api/v1/teams/team-1/webhooks", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = webhookWithClaims(req, "maintainer")
	req = webhookWithTeamParam(req, "team-1")
	w := httptest.NewRecorder()

	h.Create(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Create invalid event status = %d, want %d", w.Code, http.StatusBadRequest)
	}
	if !strings.Contains(w.Body.String(), "unsupported event") {
		t.Errorf("Create invalid event body = %s, want unsupported event error", w.Body.String())
	}
}

func TestWebhooksCreateEmptyEvents(t *testing.T) {
	h := &WebhooksHandler{Store: nil}

	body := `{"url":"https://example.com/webhook","events":[]}`
	req := httptest.NewRequest("POST", "/api/v1/teams/team-1/webhooks", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = webhookWithClaims(req, "maintainer")
	req = webhookWithTeamParam(req, "team-1")
	w := httptest.NewRecorder()

	h.Create(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Create empty events status = %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestWebhooksGetWithoutDB(t *testing.T) {
	h := &WebhooksHandler{Store: nil}

	req := httptest.NewRequest("GET", "/api/v1/teams/team-1/webhooks/wh-1", nil)
	req = webhookWithClaims(req, "owner")
	req = webhookWithTeamParam(req, "team-1")
	req = webhookWithIDParam(req, "wh-1")
	w := httptest.NewRecorder()

	h.Get(w, req)

	if w.Code != http.StatusNotImplemented {
		t.Errorf("Get without DB status = %d, want %d", w.Code, http.StatusNotImplemented)
	}
}

func TestWebhooksGetMissingID(t *testing.T) {
	h := &WebhooksHandler{Store: nil}

	req := httptest.NewRequest("GET", "/api/v1/teams/team-1/webhooks/", nil)
	req = webhookWithClaims(req, "owner")
	req = webhookWithTeamParam(req, "team-1")
	req = webhookWithIDParam(req, "")
	w := httptest.NewRecorder()

	h.Get(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Get missing ID status = %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestWebhooksUpdateWithoutDB(t *testing.T) {
	h := &WebhooksHandler{Store: nil}

	body := `{"url":"https://example.com/updated","events":["execution.completed"]}`
	req := httptest.NewRequest("PUT", "/api/v1/teams/team-1/webhooks/wh-1", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = webhookWithClaims(req, "maintainer")
	req = webhookWithTeamParam(req, "team-1")
	req = webhookWithIDParam(req, "wh-1")
	w := httptest.NewRecorder()

	h.Update(w, req)

	if w.Code != http.StatusNotImplemented {
		t.Errorf("Update without DB status = %d, want %d", w.Code, http.StatusNotImplemented)
	}
}

func TestWebhooksUpdateReadonlyForbidden(t *testing.T) {
	h := &WebhooksHandler{Store: nil}

	body := `{"url":"https://example.com/updated","events":["execution.completed"]}`
	req := httptest.NewRequest("PUT", "/api/v1/teams/team-1/webhooks/wh-1", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = webhookWithClaims(req, "readonly")
	req = webhookWithTeamParam(req, "team-1")
	req = webhookWithIDParam(req, "wh-1")
	w := httptest.NewRecorder()

	h.Update(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("Update as readonly status = %d, want %d", w.Code, http.StatusForbidden)
	}
}

func TestWebhooksDeleteWithoutDB(t *testing.T) {
	h := &WebhooksHandler{Store: nil}

	req := httptest.NewRequest("DELETE", "/api/v1/teams/team-1/webhooks/wh-1", nil)
	req = webhookWithClaims(req, "owner")
	req = webhookWithTeamParam(req, "team-1")
	req = webhookWithIDParam(req, "wh-1")
	w := httptest.NewRecorder()

	h.Delete(w, req)

	if w.Code != http.StatusNotImplemented {
		t.Errorf("Delete without DB status = %d, want %d", w.Code, http.StatusNotImplemented)
	}
}

func TestWebhooksDeleteReadonlyForbidden(t *testing.T) {
	h := &WebhooksHandler{Store: nil}

	req := httptest.NewRequest("DELETE", "/api/v1/teams/team-1/webhooks/wh-1", nil)
	req = webhookWithClaims(req, "readonly")
	req = webhookWithTeamParam(req, "team-1")
	req = webhookWithIDParam(req, "wh-1")
	w := httptest.NewRecorder()

	h.Delete(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("Delete as readonly status = %d, want %d", w.Code, http.StatusForbidden)
	}
}

func TestValidateWebhookEvents(t *testing.T) {
	tests := []struct {
		name    string
		events  []string
		wantErr bool
	}{
		{"valid report.submitted", []string{"report.submitted"}, false},
		{"valid gate.failed", []string{"gate.failed"}, false},
		{"valid execution.completed", []string{"execution.completed"}, false},
		{"valid execution.failed", []string{"execution.failed"}, false},
		{"multiple valid", []string{"report.submitted", "gate.failed", "execution.completed"}, false},
		{"invalid event", []string{"invalid.event"}, true},
		{"mix valid and invalid", []string{"report.submitted", "bogus"}, true},
		{"empty array", []string{}, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateWebhookEvents(tt.events)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateWebhookEvents(%v) err = %v, wantErr = %v", tt.events, err, tt.wantErr)
			}
		})
	}
}

func TestGenerateWebhookSecret(t *testing.T) {
	plaintext, hash, err := generateWebhookSecret()
	if err != nil {
		t.Fatalf("generateWebhookSecret() error: %v", err)
	}

	if !strings.HasPrefix(plaintext, "whsec_") {
		t.Errorf("plaintext should start with whsec_, got %q", plaintext)
	}

	if len(hash) != 64 { // SHA-256 hex = 64 chars
		t.Errorf("hash length = %d, want 64", len(hash))
	}

	// Generate another and ensure they're different
	plaintext2, hash2, err := generateWebhookSecret()
	if err != nil {
		t.Fatalf("generateWebhookSecret() second call error: %v", err)
	}

	if plaintext == plaintext2 {
		t.Error("two generated secrets should be different")
	}
	if hash == hash2 {
		t.Error("two generated hashes should be different")
	}
}
