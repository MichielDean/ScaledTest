package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/scaledtest/scaledtest/internal/auth"
	"github.com/scaledtest/scaledtest/internal/model"
	"github.com/scaledtest/scaledtest/internal/store"
	"github.com/scaledtest/scaledtest/internal/webhook"
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

// webhookWithDeliveryParam adds a deliveryID URL param to the request context.
func webhookWithDeliveryParam(r *http.Request, deliveryID string) *http.Request {
	rctx := chi.RouteContext(r.Context())
	if rctx == nil {
		rctx = chi.NewRouteContext()
		r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
	}
	rctx.URLParams.Add("deliveryID", deliveryID)
	return r
}

func TestWebhooksRetryDeliveryUnauthorized(t *testing.T) {
	h := &WebhooksHandler{}

	req := httptest.NewRequest("POST", "/api/v1/teams/team-1/webhooks/wh-1/deliveries/d-1/retry", nil)
	w := httptest.NewRecorder()

	h.RetryDelivery(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("RetryDelivery without auth = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestWebhooksRetryDeliveryWrongTeam(t *testing.T) {
	h := &WebhooksHandler{}

	req := httptest.NewRequest("POST", "/api/v1/teams/other-team/webhooks/wh-1/deliveries/d-1/retry", nil)
	req = webhookWithClaims(req, "maintainer") // claims have team-1
	req = webhookWithTeamParam(req, "other-team")
	req = webhookWithIDParam(req, "wh-1")
	req = webhookWithDeliveryParam(req, "d-1")
	w := httptest.NewRecorder()

	h.RetryDelivery(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("RetryDelivery wrong team = %d, want %d", w.Code, http.StatusForbidden)
	}
}

func TestWebhooksRetryDeliveryReadonlyForbidden(t *testing.T) {
	h := &WebhooksHandler{}

	req := httptest.NewRequest("POST", "/api/v1/teams/team-1/webhooks/wh-1/deliveries/d-1/retry", nil)
	req = webhookWithClaims(req, "readonly")
	req = webhookWithTeamParam(req, "team-1")
	req = webhookWithIDParam(req, "wh-1")
	req = webhookWithDeliveryParam(req, "d-1")
	w := httptest.NewRecorder()

	h.RetryDelivery(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("RetryDelivery as readonly = %d, want %d", w.Code, http.StatusForbidden)
	}
}

func TestWebhooksRetryDeliveryMissingDeliveryID(t *testing.T) {
	h := &WebhooksHandler{}

	req := httptest.NewRequest("POST", "/api/v1/teams/team-1/webhooks/wh-1/deliveries//retry", nil)
	req = webhookWithClaims(req, "maintainer")
	req = webhookWithTeamParam(req, "team-1")
	req = webhookWithIDParam(req, "wh-1")
	req = webhookWithDeliveryParam(req, "")
	w := httptest.NewRecorder()

	h.RetryDelivery(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("RetryDelivery missing delivery ID = %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestWebhooksRetryDeliveryWithoutDB(t *testing.T) {
	h := &WebhooksHandler{Store: nil, DeliveryStore: nil}

	req := httptest.NewRequest("POST", "/api/v1/teams/team-1/webhooks/wh-1/deliveries/d-1/retry", nil)
	req = webhookWithClaims(req, "maintainer")
	req = webhookWithTeamParam(req, "team-1")
	req = webhookWithIDParam(req, "wh-1")
	req = webhookWithDeliveryParam(req, "d-1")
	w := httptest.NewRecorder()

	h.RetryDelivery(w, req)

	if w.Code != http.StatusNotImplemented {
		t.Errorf("RetryDelivery without DB = %d, want %d", w.Code, http.StatusNotImplemented)
	}
}

// mockWebhookStore implements WebhookStoreProvider for unit tests.
type mockWebhookStore struct {
	getFunc func(ctx context.Context, teamID, webhookID string) (*model.Webhook, error)
}

func (m *mockWebhookStore) List(_ context.Context, _ string) ([]model.Webhook, error) { return nil, nil }
func (m *mockWebhookStore) Get(ctx context.Context, teamID, webhookID string) (*model.Webhook, error) {
	if m.getFunc != nil {
		return m.getFunc(ctx, teamID, webhookID)
	}
	return &model.Webhook{ID: webhookID, TeamID: teamID, URL: "https://example.com/hook", SecretHash: "hash"}, nil
}
func (m *mockWebhookStore) Create(_ context.Context, _, _, _ string, _ []string) (*model.Webhook, error) {
	return nil, nil
}
func (m *mockWebhookStore) Update(_ context.Context, _, _, _ string, _ []string, _ bool) (*model.Webhook, error) {
	return nil, nil
}
func (m *mockWebhookStore) Delete(_ context.Context, _, _ string) error { return nil }

// mockWebhookDeliveryStore implements WebhookDeliveryStoreProvider for unit tests.
type mockWebhookDeliveryStore struct {
	getByWebhookFunc  func(ctx context.Context, webhookID, deliveryID string) (*store.WebhookDelivery, error)
	listByWebhookFunc func(ctx context.Context, webhookID string, cursor string, limit int) ([]store.WebhookDelivery, string, error)
}

func (m *mockWebhookDeliveryStore) Record(_ context.Context, _, _, _ string, _ []byte, _, _ int, _ string, _ int) error {
	return nil
}
func (m *mockWebhookDeliveryStore) GetByWebhook(ctx context.Context, webhookID, deliveryID string) (*store.WebhookDelivery, error) {
	if m.getByWebhookFunc != nil {
		return m.getByWebhookFunc(ctx, webhookID, deliveryID)
	}
	return nil, fmt.Errorf("not found")
}
func (m *mockWebhookDeliveryStore) ListByWebhook(ctx context.Context, webhookID string, cursor string, limit int) ([]store.WebhookDelivery, string, error) {
	if m.listByWebhookFunc != nil {
		return m.listByWebhookFunc(ctx, webhookID, cursor, limit)
	}
	return nil, "", nil
}

// mockWebhookSender implements WebhookSender for unit tests.
type mockWebhookSender struct {
	sendFunc func(ctx context.Context, url, secret string, payload webhook.Payload) (*webhook.Delivery, error)
}

func (m *mockWebhookSender) Send(ctx context.Context, url, secret string, payload webhook.Payload) (*webhook.Delivery, error) {
	if m.sendFunc != nil {
		return m.sendFunc(ctx, url, secret, payload)
	}
	return &webhook.Delivery{StatusCode: 200, Attempt: 1}, nil
}

// validRetryPayload is a well-formed webhook.Payload JSON for dispatch tests.
var validRetryPayload = json.RawMessage(`{"event":"report.submitted","timestamp":"2024-01-01T00:00:00Z","data":{}}`)

func makeDelivery(payload json.RawMessage) *store.WebhookDelivery {
	return &store.WebhookDelivery{
		ID:        "d-1",
		WebhookID: "wh-1",
		EventType: "report.submitted",
		Payload:   payload,
	}
}

func retryReq() (*http.Request, *httptest.ResponseRecorder) {
	req := httptest.NewRequest("POST", "/api/v1/teams/team-1/webhooks/wh-1/deliveries/d-1/retry", nil)
	req = webhookWithClaims(req, "maintainer")
	req = webhookWithTeamParam(req, "team-1")
	req = webhookWithIDParam(req, "wh-1")
	req = webhookWithDeliveryParam(req, "d-1")
	return req, httptest.NewRecorder()
}

func TestRetryDeliverySuccess(t *testing.T) {
	h := &WebhooksHandler{
		Store: &mockWebhookStore{},
		DeliveryStore: &mockWebhookDeliveryStore{
			getByWebhookFunc: func(_ context.Context, _, _ string) (*store.WebhookDelivery, error) {
				return makeDelivery(validRetryPayload), nil
			},
		},
		Dispatcher: &mockWebhookSender{
			sendFunc: func(_ context.Context, _, _ string, _ webhook.Payload) (*webhook.Delivery, error) {
				return &webhook.Delivery{StatusCode: 200, Attempt: 1}, nil
			},
		},
	}
	req, w := retryReq()
	h.RetryDelivery(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("RetryDelivery success status = %d, want %d", w.Code, http.StatusOK)
	}
	if !strings.Contains(w.Body.String(), `"success":true`) {
		t.Errorf("RetryDelivery success body missing success:true: %s", w.Body.String())
	}
}

func TestRetryDeliveryRemoteError(t *testing.T) {
	// dispatchErr==nil but result.Error non-empty: success must be false.
	h := &WebhooksHandler{
		Store: &mockWebhookStore{},
		DeliveryStore: &mockWebhookDeliveryStore{
			getByWebhookFunc: func(_ context.Context, _, _ string) (*store.WebhookDelivery, error) {
				return makeDelivery(validRetryPayload), nil
			},
		},
		Dispatcher: &mockWebhookSender{
			sendFunc: func(_ context.Context, _, _ string, _ webhook.Payload) (*webhook.Delivery, error) {
				return &webhook.Delivery{StatusCode: 404, Error: "HTTP 404", Attempt: 1}, nil
			},
		},
	}
	req, w := retryReq()
	h.RetryDelivery(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("RetryDelivery remote error status = %d, want %d", w.Code, http.StatusOK)
	}
	body := w.Body.String()
	if !strings.Contains(body, `"success":false`) {
		t.Errorf("RetryDelivery remote error: expected success:false, got: %s", body)
	}
	if !strings.Contains(body, "HTTP 404") {
		t.Errorf("RetryDelivery remote error: expected HTTP 404 in body, got: %s", body)
	}
}

func TestRetryDeliveryTransportError(t *testing.T) {
	// dispatchErr!=nil: success must be false and error message propagated.
	h := &WebhooksHandler{
		Store: &mockWebhookStore{},
		DeliveryStore: &mockWebhookDeliveryStore{
			getByWebhookFunc: func(_ context.Context, _, _ string) (*store.WebhookDelivery, error) {
				return makeDelivery(validRetryPayload), nil
			},
		},
		Dispatcher: &mockWebhookSender{
			sendFunc: func(_ context.Context, _, _ string, _ webhook.Payload) (*webhook.Delivery, error) {
				return nil, errors.New("connection refused")
			},
		},
	}
	req, w := retryReq()
	h.RetryDelivery(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("RetryDelivery transport error status = %d, want %d", w.Code, http.StatusOK)
	}
	body := w.Body.String()
	if !strings.Contains(body, `"success":false`) {
		t.Errorf("RetryDelivery transport error: expected success:false, got: %s", body)
	}
	if !strings.Contains(body, "connection refused") {
		t.Errorf("RetryDelivery transport error: expected error message in body, got: %s", body)
	}
}

func TestRetryDeliveryEmptyPayload(t *testing.T) {
	h := &WebhooksHandler{
		Store: &mockWebhookStore{},
		DeliveryStore: &mockWebhookDeliveryStore{
			getByWebhookFunc: func(_ context.Context, _, _ string) (*store.WebhookDelivery, error) {
				return makeDelivery(nil), nil
			},
		},
		Dispatcher: &mockWebhookSender{},
	}
	req, w := retryReq()
	h.RetryDelivery(w, req)

	if w.Code != http.StatusUnprocessableEntity {
		t.Errorf("RetryDelivery empty payload status = %d, want %d", w.Code, http.StatusUnprocessableEntity)
	}
}

func TestRetryDeliveryBadJSONPayload(t *testing.T) {
	h := &WebhooksHandler{
		Store: &mockWebhookStore{},
		DeliveryStore: &mockWebhookDeliveryStore{
			getByWebhookFunc: func(_ context.Context, _, _ string) (*store.WebhookDelivery, error) {
				return makeDelivery(json.RawMessage(`not valid json`)), nil
			},
		},
		Dispatcher: &mockWebhookSender{},
	}
	req, w := retryReq()
	h.RetryDelivery(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("RetryDelivery bad JSON status = %d, want %d", w.Code, http.StatusInternalServerError)
	}
}

func TestRetryDeliveryNilDispatcher(t *testing.T) {
	h := &WebhooksHandler{
		Store: &mockWebhookStore{},
		DeliveryStore: &mockWebhookDeliveryStore{
			getByWebhookFunc: func(_ context.Context, _, _ string) (*store.WebhookDelivery, error) {
				return makeDelivery(validRetryPayload), nil
			},
		},
		Dispatcher: nil,
	}
	req, w := retryReq()
	h.RetryDelivery(w, req)

	if w.Code != http.StatusNotImplemented {
		t.Errorf("RetryDelivery nil dispatcher status = %d, want %d", w.Code, http.StatusNotImplemented)
	}
}

func TestListDeliveriesWithoutDB(t *testing.T) {
	h := &WebhooksHandler{DeliveryStore: nil}

	req := httptest.NewRequest("GET", "/api/v1/teams/team-1/webhooks/wh-1/deliveries", nil)
	req = webhookWithClaims(req, "owner")
	req = webhookWithTeamParam(req, "team-1")
	req = webhookWithIDParam(req, "wh-1")
	w := httptest.NewRecorder()

	h.ListDeliveries(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("ListDeliveries without DB = %d, want %d", w.Code, http.StatusOK)
	}
}

func TestListDeliveriesPassesBeforeID(t *testing.T) {
	var capturedBeforeID string
	h := &WebhooksHandler{
		DeliveryStore: &mockWebhookDeliveryStore{
			listByWebhookFunc: func(_ context.Context, _ string, _ int, beforeID string) ([]store.WebhookDelivery, error) {
				capturedBeforeID = beforeID
				return []store.WebhookDelivery{}, nil
			},
		},
	}

	req := httptest.NewRequest("GET", "/api/v1/teams/team-1/webhooks/wh-1/deliveries?before_id=d-99", nil)
	req = webhookWithClaims(req, "owner")
	req = webhookWithTeamParam(req, "team-1")
	req = webhookWithIDParam(req, "wh-1")
	w := httptest.NewRecorder()

	h.ListDeliveries(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("ListDeliveries before_id status = %d, want %d", w.Code, http.StatusOK)
	}
	if capturedBeforeID != "d-99" {
		t.Errorf("before_id not passed through: got %q, want %q", capturedBeforeID, "d-99")
	}
}

func TestListDeliveriesPassesLimit(t *testing.T) {
	var capturedLimit int
	h := &WebhooksHandler{
		DeliveryStore: &mockWebhookDeliveryStore{
			listByWebhookFunc: func(_ context.Context, _ string, limit int, _ string) ([]store.WebhookDelivery, error) {
				capturedLimit = limit
				return []store.WebhookDelivery{}, nil
			},
		},
	}

	req := httptest.NewRequest("GET", "/api/v1/teams/team-1/webhooks/wh-1/deliveries?limit=5", nil)
	req = webhookWithClaims(req, "owner")
	req = webhookWithTeamParam(req, "team-1")
	req = webhookWithIDParam(req, "wh-1")
	w := httptest.NewRecorder()

	h.ListDeliveries(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("ListDeliveries limit status = %d, want %d", w.Code, http.StatusOK)
	}
	if capturedLimit != 5 {
		t.Errorf("limit not passed through: got %d, want %d", capturedLimit, 5)
	}
}

func TestListDeliveriesDefaultLimit(t *testing.T) {
	var capturedLimit int
	h := &WebhooksHandler{
		DeliveryStore: &mockWebhookDeliveryStore{
			listByWebhookFunc: func(_ context.Context, _ string, limit int, _ string) ([]store.WebhookDelivery, error) {
				capturedLimit = limit
				return []store.WebhookDelivery{}, nil
			},
		},
	}

	req := httptest.NewRequest("GET", "/api/v1/teams/team-1/webhooks/wh-1/deliveries", nil)
	req = webhookWithClaims(req, "owner")
	req = webhookWithTeamParam(req, "team-1")
	req = webhookWithIDParam(req, "wh-1")
	w := httptest.NewRecorder()

	h.ListDeliveries(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("ListDeliveries default limit status = %d, want %d", w.Code, http.StatusOK)
	}
	if capturedLimit != 20 {
		t.Errorf("default limit = %d, want 20", capturedLimit)
	}
}

func TestListDeliveriesEmptyBeforeID(t *testing.T) {
	var capturedBeforeID string
	h := &WebhooksHandler{
		DeliveryStore: &mockWebhookDeliveryStore{
			listByWebhookFunc: func(_ context.Context, _ string, _ int, beforeID string) ([]store.WebhookDelivery, error) {
				capturedBeforeID = beforeID
				return []store.WebhookDelivery{}, nil
			},
		},
	}

	req := httptest.NewRequest("GET", "/api/v1/teams/team-1/webhooks/wh-1/deliveries", nil)
	req = webhookWithClaims(req, "owner")
	req = webhookWithTeamParam(req, "team-1")
	req = webhookWithIDParam(req, "wh-1")
	w := httptest.NewRecorder()

	h.ListDeliveries(w, req)

	if capturedBeforeID != "" {
		t.Errorf("before_id without param should be empty, got %q", capturedBeforeID)
	}
}

func TestListDeliveriesInvalidCursorReturns400(t *testing.T) {
	h := &WebhooksHandler{
		DeliveryStore: &mockWebhookDeliveryStore{
			listByWebhookFunc: func(_ context.Context, _ string, _ int, _ string) ([]store.WebhookDelivery, error) {
				return nil, store.ErrInvalidCursor
			},
		},
	}

	req := httptest.NewRequest("GET", "/api/v1/teams/team-1/webhooks/wh-1/deliveries?before_id=nonexistent", nil)
	req = webhookWithClaims(req, "owner")
	req = webhookWithTeamParam(req, "team-1")
	req = webhookWithIDParam(req, "wh-1")
	w := httptest.NewRecorder()

	h.ListDeliveries(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("ListDeliveries invalid cursor status = %d, want %d", w.Code, http.StatusBadRequest)
	}
	if !strings.Contains(w.Body.String(), "invalid before_id cursor") {
		t.Errorf("ListDeliveries invalid cursor body = %s, want invalid before_id cursor error", w.Body.String())
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

func listDeliveriesReq(cursor string) (*http.Request, *httptest.ResponseRecorder) {
	url := "/api/v1/teams/team-1/webhooks/wh-1/deliveries"
	if cursor != "" {
		url += "?cursor=" + cursor
	}
	req := httptest.NewRequest("GET", url, nil)
	req = webhookWithClaims(req, "owner")
	req = webhookWithTeamParam(req, "team-1")
	req = webhookWithIDParam(req, "wh-1")
	return req, httptest.NewRecorder()
}

func TestListDeliveriesNoNextCursor(t *testing.T) {
	h := &WebhooksHandler{
		DeliveryStore: &mockWebhookDeliveryStore{
			listByWebhookFunc: func(_ context.Context, _ string, _ string, _ int) ([]store.WebhookDelivery, string, error) {
				return []store.WebhookDelivery{
					{ID: "d-1", WebhookID: "wh-1", DeliveredAt: time.Now()},
				}, "", nil
			},
		},
	}
	req, w := listDeliveriesReq("")
	h.ListDeliveries(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("ListDeliveries status = %d, want %d", w.Code, http.StatusOK)
	}
	body := w.Body.String()
	if strings.Contains(body, "next_cursor") {
		t.Errorf("ListDeliveries should not contain next_cursor when there are no more results: %s", body)
	}
}

func TestListDeliveriesHasNextCursor(t *testing.T) {
	h := &WebhooksHandler{
		DeliveryStore: &mockWebhookDeliveryStore{
			listByWebhookFunc: func(_ context.Context, _ string, _ string, _ int) ([]store.WebhookDelivery, string, error) {
				return []store.WebhookDelivery{
					{ID: "d-1", WebhookID: "wh-1", DeliveredAt: time.Now()},
				}, "2026-01-01T00:00:00Z,d-1", nil
			},
		},
	}
	req, w := listDeliveriesReq("")
	h.ListDeliveries(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("ListDeliveries status = %d, want %d", w.Code, http.StatusOK)
	}
	var resp map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	nc, ok := resp["next_cursor"]
	if !ok {
		t.Fatal("ListDeliveries response missing next_cursor")
	}
	if nc != "2026-01-01T00:00:00Z,d-1" {
		t.Errorf("next_cursor = %v, want %q", nc, "2026-01-01T00:00:00Z,d-1")
	}
}

func TestListDeliveriesPassesCursorToStore(t *testing.T) {
	var receivedCursor string
	h := &WebhooksHandler{
		DeliveryStore: &mockWebhookDeliveryStore{
			listByWebhookFunc: func(_ context.Context, _ string, cursor string, _ int) ([]store.WebhookDelivery, string, error) {
				receivedCursor = cursor
				return []store.WebhookDelivery{}, "", nil
			},
		},
	}
	cursorVal := "2026-01-01T00:00:00Z,d-5"
	req, w := listDeliveriesReq(cursorVal)
	h.ListDeliveries(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("ListDeliveries status = %d, want %d", w.Code, http.StatusOK)
	}
	if receivedCursor != cursorVal {
		t.Errorf("store received cursor = %q, want %q", receivedCursor, cursorVal)
	}
}
