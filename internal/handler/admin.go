package handler

import (
	"net/http"
	"time"

	"github.com/scaledtest/scaledtest/internal/store"
)

// AdminHandler handles admin-only endpoints.
type AdminHandler struct {
	AuditStore *store.AuditStore
}

// ListAuditLog handles GET /api/v1/admin/audit-log.
// Query params: action, resource_type, actor_id, since (RFC3339), until (RFC3339), limit, offset.
func (h *AdminHandler) ListAuditLog(w http.ResponseWriter, r *http.Request) {
	if h.AuditStore == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	limit, offset := parsePagination(r)

	f := store.AuditListFilter{
		Action:       r.URL.Query().Get("action"),
		ResourceType: r.URL.Query().Get("resource_type"),
		ActorID:      r.URL.Query().Get("actor_id"),
		Limit:        limit,
		Offset:       offset,
	}

	if since := r.URL.Query().Get("since"); since != "" {
		if t, err := time.Parse(time.RFC3339, since); err == nil {
			f.Since = &t
		}
	}
	if until := r.URL.Query().Get("until"); until != "" {
		if t, err := time.Parse(time.RFC3339, until); err == nil {
			f.Until = &t
		}
	}

	entries, total, err := h.AuditStore.List(r.Context(), f)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to query audit log")
		return
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"audit_log": entries,
		"total":     total,
	})
}

// AdminListUsers handles GET /api/v1/admin/users.
func AdminListUsers(w http.ResponseWriter, r *http.Request) {
	JSON(w, http.StatusOK, map[string]interface{}{
		"users": []interface{}{},
	})
}
