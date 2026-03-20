package handler

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"errors"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/scaledtest/scaledtest/internal/auth"
	"github.com/scaledtest/scaledtest/internal/model"
	"github.com/scaledtest/scaledtest/internal/sanitize"
	"github.com/scaledtest/scaledtest/internal/store"
	"github.com/scaledtest/scaledtest/internal/webhook"
)

// Supported webhook event types.
var validWebhookEvents = map[string]bool{
	"report.submitted":    true,
	"gate.failed":         true,
	"execution.completed": true,
	"execution.failed":    true,
}

// WebhookStoreProvider is the store interface needed by WebhooksHandler.
type WebhookStoreProvider interface {
	List(ctx context.Context, teamID string) ([]model.Webhook, error)
	Get(ctx context.Context, teamID, webhookID string) (*model.Webhook, error)
	Create(ctx context.Context, teamID, url, secretHash string, events []string) (*model.Webhook, error)
	Update(ctx context.Context, teamID, webhookID, url string, events []string, enabled bool) (*model.Webhook, error)
	Delete(ctx context.Context, teamID, webhookID string) error
}

// WebhookDeliveryStoreProvider is the delivery store interface needed by WebhooksHandler.
type WebhookDeliveryStoreProvider interface {
	Record(ctx context.Context, webhookID, url, eventType string, payload []byte, attempt, statusCode int, errMsg string, durationMs int) error
	GetByWebhook(ctx context.Context, webhookID, deliveryID string) (*store.WebhookDelivery, error)
	ListByWebhook(ctx context.Context, webhookID string, limit int, beforeID string) ([]store.WebhookDelivery, error)
}

// WebhookSender is the dispatcher interface needed by WebhooksHandler.
type WebhookSender interface {
	Send(ctx context.Context, url, secret string, payload webhook.Payload) (*webhook.Delivery, error)
}

// WebhooksHandler handles webhook CRUD endpoints.
type WebhooksHandler struct {
	Store         WebhookStoreProvider
	DeliveryStore WebhookDeliveryStoreProvider
	Dispatcher    WebhookSender
}

// CreateWebhookRequest is the request body for creating a webhook.
type CreateWebhookRequest struct {
	URL    string   `json:"url" validate:"required,url"`
	Events []string `json:"events" validate:"required,min=1"`
}

// UpdateWebhookRequest is the request body for updating a webhook.
type UpdateWebhookRequest struct {
	URL     string   `json:"url" validate:"required,url"`
	Events  []string `json:"events" validate:"required,min=1"`
	Enabled *bool    `json:"enabled"`
}

// validateWebhookEvents checks that all events are supported.
func validateWebhookEvents(events []string) error {
	if len(events) == 0 {
		return fmt.Errorf("events array must not be empty")
	}
	for i, event := range events {
		if !validWebhookEvents[event] {
			return fmt.Errorf("events[%d]: unsupported event %q (supported: report.submitted, gate.failed, execution.completed, execution.failed)", i, event)
		}
	}
	return nil
}

// generateWebhookSecret generates a random webhook secret and returns
// the plaintext secret and its SHA-256 hash.
func generateWebhookSecret() (plaintext, hash string, err error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", "", fmt.Errorf("generate secret: %w", err)
	}
	plaintext = "whsec_" + hex.EncodeToString(b)
	h := sha256.Sum256([]byte(plaintext))
	hash = hex.EncodeToString(h[:])
	return plaintext, hash, nil
}

// webhookTeamID extracts the teamID URL parameter and verifies team access.
func webhookTeamID(w http.ResponseWriter, r *http.Request, claims *auth.Claims) (string, bool) {
	teamID := chi.URLParam(r, "teamID")
	if teamID == "" {
		Error(w, http.StatusBadRequest, "missing team ID")
		return "", false
	}
	if claims.TeamID != teamID {
		Error(w, http.StatusForbidden, "team access denied")
		return "", false
	}
	return teamID, true
}

// webhookRequireMaintainer checks maintainer or owner role for write operations.
func webhookRequireMaintainer(w http.ResponseWriter, claims *auth.Claims) bool {
	if claims.Role != "maintainer" && claims.Role != "owner" {
		Error(w, http.StatusForbidden, "maintainer or owner role required")
		return false
	}
	return true
}

// List handles GET /api/v1/teams/:teamID/webhooks.
func (h *WebhooksHandler) List(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	teamID, ok := webhookTeamID(w, r, claims)
	if !ok {
		return
	}

	if h.Store == nil {
		JSON(w, http.StatusOK, map[string]interface{}{
			"webhooks": []interface{}{},
			"total":    0,
		})
		return
	}

	webhooks, err := h.Store.List(r.Context(), teamID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list webhooks")
		return
	}

	result := make([]interface{}, len(webhooks))
	for i := range webhooks {
		result[i] = webhooks[i]
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"webhooks": result,
		"total":    len(result),
	})
}

// Create handles POST /api/v1/teams/:teamID/webhooks.
func (h *WebhooksHandler) Create(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	teamID, ok := webhookTeamID(w, r, claims)
	if !ok {
		return
	}

	if !webhookRequireMaintainer(w, claims) {
		return
	}

	var req CreateWebhookRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}

	if err := validateWebhookEvents(req.Events); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}

	// Generate secret server-side
	secret, secretHash, err := generateWebhookSecret()
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to generate secret")
		return
	}

	if h.Store == nil {
		Error(w, http.StatusNotImplemented, "create webhook requires database connection")
		return
	}

	req.URL = sanitize.String(req.URL)

	webhook, err := h.Store.Create(r.Context(), teamID, req.URL, secretHash, req.Events)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to create webhook")
		return
	}

	// Return the plaintext secret once — it won't be shown again
	JSON(w, http.StatusCreated, map[string]interface{}{
		"webhook": webhook,
		"secret":  secret,
	})
}

// Get handles GET /api/v1/teams/:teamID/webhooks/:webhookID.
func (h *WebhooksHandler) Get(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	teamID, ok := webhookTeamID(w, r, claims)
	if !ok {
		return
	}

	webhookID := chi.URLParam(r, "webhookID")
	if webhookID == "" {
		Error(w, http.StatusBadRequest, "missing webhook ID")
		return
	}

	if h.Store == nil {
		Error(w, http.StatusNotImplemented, "get webhook requires database connection")
		return
	}

	webhook, err := h.Store.Get(r.Context(), teamID, webhookID)
	if err != nil {
		Error(w, http.StatusNotFound, "webhook not found")
		return
	}

	JSON(w, http.StatusOK, webhook)
}

// Update handles PUT /api/v1/teams/:teamID/webhooks/:webhookID.
func (h *WebhooksHandler) Update(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	teamID, ok := webhookTeamID(w, r, claims)
	if !ok {
		return
	}

	if !webhookRequireMaintainer(w, claims) {
		return
	}

	webhookID := chi.URLParam(r, "webhookID")
	if webhookID == "" {
		Error(w, http.StatusBadRequest, "missing webhook ID")
		return
	}

	var req UpdateWebhookRequest
	if err := Decode(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}

	if err := validateWebhookEvents(req.Events); err != nil {
		Error(w, http.StatusBadRequest, err.Error())
		return
	}

	if h.Store == nil {
		Error(w, http.StatusNotImplemented, "update webhook requires database connection")
		return
	}

	req.URL = sanitize.String(req.URL)

	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	webhook, err := h.Store.Update(r.Context(), teamID, webhookID, req.URL, req.Events, enabled)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to update webhook")
		return
	}

	JSON(w, http.StatusOK, webhook)
}

// Delete handles DELETE /api/v1/teams/:teamID/webhooks/:webhookID.
func (h *WebhooksHandler) Delete(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	teamID, ok := webhookTeamID(w, r, claims)
	if !ok {
		return
	}

	if !webhookRequireMaintainer(w, claims) {
		return
	}

	webhookID := chi.URLParam(r, "webhookID")
	if webhookID == "" {
		Error(w, http.StatusBadRequest, "missing webhook ID")
		return
	}

	if h.Store == nil {
		Error(w, http.StatusNotImplemented, "delete webhook requires database connection")
		return
	}

	if err := h.Store.Delete(r.Context(), teamID, webhookID); err != nil {
		Error(w, http.StatusNotFound, "webhook not found")
		return
	}

	JSON(w, http.StatusOK, map[string]string{"message": "webhook deleted"})
}

// RetryDelivery handles POST /api/v1/teams/:teamID/webhooks/:webhookID/deliveries/:deliveryID/retry.
// It re-dispatches the stored payload and records a new delivery attempt.
func (h *WebhooksHandler) RetryDelivery(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	teamID, ok := webhookTeamID(w, r, claims)
	if !ok {
		return
	}

	if !webhookRequireMaintainer(w, claims) {
		return
	}

	webhookID := chi.URLParam(r, "webhookID")
	if webhookID == "" {
		Error(w, http.StatusBadRequest, "missing webhook ID")
		return
	}

	deliveryID := chi.URLParam(r, "deliveryID")
	if deliveryID == "" {
		Error(w, http.StatusBadRequest, "missing delivery ID")
		return
	}

	if h.Store == nil || h.DeliveryStore == nil {
		Error(w, http.StatusNotImplemented, "retry delivery requires database connection")
		return
	}

	// Verify webhook belongs to team and get its secret hash.
	wh, err := h.Store.Get(r.Context(), teamID, webhookID)
	if err != nil {
		Error(w, http.StatusNotFound, "webhook not found")
		return
	}

	// Look up the stored delivery scoped to this webhook.
	delivery, err := h.DeliveryStore.GetByWebhook(r.Context(), webhookID, deliveryID)
	if err != nil {
		Error(w, http.StatusNotFound, "delivery not found")
		return
	}

	if len(delivery.Payload) == 0 {
		Error(w, http.StatusUnprocessableEntity, "delivery has no stored payload to retry")
		return
	}

	var payload webhook.Payload
	if err := json.Unmarshal(delivery.Payload, &payload); err != nil {
		Error(w, http.StatusInternalServerError, "failed to decode stored payload")
		return
	}

	if h.Dispatcher == nil {
		Error(w, http.StatusNotImplemented, "retry delivery requires dispatcher")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	start := time.Now()
	result, dispatchErr := h.Dispatcher.Send(ctx, wh.URL, wh.SecretHash, payload)
	durationMs := int(time.Since(start).Milliseconds())

	statusCode := 0
	errMsg := ""
	attempt := 1
	var sentPayload []byte
	if result != nil {
		statusCode = result.StatusCode
		errMsg = result.Error
		attempt = result.Attempt
		sentPayload = result.Payload
	}
	if dispatchErr != nil && errMsg == "" {
		errMsg = dispatchErr.Error()
	}
	if sentPayload == nil {
		sentPayload = delivery.Payload
	}

	// Record the new delivery attempt (best effort).
	_ = h.DeliveryStore.Record(r.Context(), wh.ID, wh.URL, delivery.EventType, sentPayload, attempt, statusCode, errMsg, durationMs)

	success := dispatchErr == nil && errMsg == ""
	JSON(w, http.StatusOK, map[string]interface{}{
		"success":     success,
		"status_code": statusCode,
		"attempt":     attempt,
		"duration_ms": durationMs,
		"error":       errMsg,
	})
}

// ListDeliveries handles GET /api/v1/teams/:teamID/webhooks/:webhookID/deliveries.
func (h *WebhooksHandler) ListDeliveries(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	teamID, ok := webhookTeamID(w, r, claims)
	if !ok {
		return
	}

	webhookID := chi.URLParam(r, "webhookID")
	if webhookID == "" {
		Error(w, http.StatusBadRequest, "missing webhook ID")
		return
	}

	if h.DeliveryStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	// Verify webhook belongs to this team
	if h.Store != nil {
		if _, err := h.Store.Get(r.Context(), teamID, webhookID); err != nil {
			Error(w, http.StatusNotFound, "webhook not found")
			return
		}
	}

	limit := 20
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil {
			limit = parsed
		}
	}
	beforeID := r.URL.Query().Get("before_id")

	deliveries, err := h.DeliveryStore.ListByWebhook(r.Context(), webhookID, limit, beforeID)
	if err != nil {
		if errors.Is(err, store.ErrInvalidCursor) {
			Error(w, http.StatusBadRequest, "invalid before_id cursor")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to list deliveries")
		return
	}

	JSON(w, http.StatusOK, deliveries)
}


