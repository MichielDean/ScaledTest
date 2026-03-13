package handler

import (
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/scaledtest/scaledtest/internal/db"
	"github.com/scaledtest/scaledtest/internal/model"
	"github.com/scaledtest/scaledtest/internal/store"
)

// AdminHandler handles admin-only endpoints.
type AdminHandler struct {
	AuditStore *store.AuditStore
	DB         *db.Pool
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
		Limit:        limit,
		Offset:       offset,
	}

	if actorID := r.URL.Query().Get("actor_id"); actorID != "" {
		if _, err := uuid.Parse(actorID); err != nil {
			Error(w, http.StatusBadRequest, "actor_id must be a valid UUID")
			return
		}
		f.ActorID = actorID
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

// ListUsers handles GET /api/v1/admin/users.
func (h *AdminHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	if h.DB == nil {
		Error(w, http.StatusServiceUnavailable, "database not configured")
		return
	}

	limit, offset := parsePagination(r)

	rows, err := h.DB.Query(r.Context(),
		`SELECT id, email, display_name, role, created_at, updated_at
		 FROM users
		 ORDER BY created_at DESC
		 LIMIT $1 OFFSET $2`,
		limit, offset)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to query users")
		return
	}
	defer rows.Close()

	users := []model.User{}
	for rows.Next() {
		var u model.User
		if err := rows.Scan(&u.ID, &u.Email, &u.DisplayName, &u.Role, &u.CreatedAt, &u.UpdatedAt); err != nil {
			Error(w, http.StatusInternalServerError, "failed to scan user")
			return
		}
		users = append(users, u)
	}
	if err := rows.Err(); err != nil {
		Error(w, http.StatusInternalServerError, "failed to iterate users")
		return
	}

	var total int
	err = h.DB.QueryRow(r.Context(), `SELECT COUNT(*) FROM users`).Scan(&total)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to count users")
		return
	}

	JSON(w, http.StatusOK, map[string]interface{}{
		"users": users,
		"total": total,
	})
}
