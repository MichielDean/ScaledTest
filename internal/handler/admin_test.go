package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/scaledtest/scaledtest/internal/auth"
)

func TestListAuditLog_NoDB(t *testing.T) {
	h := &AdminHandler{}
	req := httptest.NewRequest("GET", "/api/v1/admin/audit-log", nil)
	req = testWithClaims(req, testClaims)
	w := httptest.NewRecorder()
	h.ListAuditLog(w, req)
	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("ListAuditLog with nil AuditStore: got %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestAdminListUsers_NoDB(t *testing.T) {
	h := &AdminHandler{}
	req := httptest.NewRequest("GET", "/api/v1/admin/users", nil)
	req = testWithClaims(req, testClaims)
	w := httptest.NewRecorder()
	h.ListUsers(w, req)
	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("ListUsers with nil DB: got %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

func TestAdminRoutes_MaintainerForbidden(t *testing.T) {
	h := &AdminHandler{}
	ownerGuard := auth.RequireRole("owner")

	maintainerClaims := &auth.Claims{
		UserID: "user-2",
		Email:  "maintainer@example.com",
		Role:   "maintainer",
		TeamID: "team-1",
	}

	tests := []struct {
		name    string
		path    string
		handler http.HandlerFunc
	}{
		{"ListUsers", "/api/v1/admin/users", h.ListUsers},
		{"ListAuditLog", "/api/v1/admin/audit-log", h.ListAuditLog},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", tc.path, nil)
			req = testWithClaims(req, maintainerClaims)
			w := httptest.NewRecorder()

			guarded := ownerGuard(http.HandlerFunc(tc.handler))
			guarded.ServeHTTP(w, req)

			if w.Code != http.StatusForbidden {
				t.Errorf("%s with maintainer role: got %d, want %d", tc.name, w.Code, http.StatusForbidden)
			}
		})
	}
}

func TestAdminRoutes_OwnerAllowed(t *testing.T) {
	h := &AdminHandler{}
	ownerGuard := auth.RequireRole("owner")

	ownerClaims := &auth.Claims{
		UserID: "user-1",
		Email:  "owner@example.com",
		Role:   "owner",
		TeamID: "team-1",
	}

	tests := []struct {
		name    string
		path    string
		handler http.HandlerFunc
	}{
		{"ListUsers", "/api/v1/admin/users", h.ListUsers},
		{"ListAuditLog", "/api/v1/admin/audit-log", h.ListAuditLog},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", tc.path, nil)
			req = testWithClaims(req, ownerClaims)
			w := httptest.NewRecorder()

			guarded := ownerGuard(http.HandlerFunc(tc.handler))
			guarded.ServeHTTP(w, req)

			// Should not get 403 — handler runs (returns 503 since DB is nil, which is fine)
			if w.Code == http.StatusForbidden {
				t.Errorf("%s with owner role: got 403 Forbidden, expected handler to execute", tc.name)
			}
		})
	}
}

func TestAdminRoutes_MemberForbidden(t *testing.T) {
	h := &AdminHandler{}
	ownerGuard := auth.RequireRole("owner")

	memberClaims := &auth.Claims{
		UserID: "user-3",
		Email:  "member@example.com",
		Role:   "member",
		TeamID: "team-1",
	}

	req := httptest.NewRequest("GET", "/api/v1/admin/users", nil)
	req = testWithClaims(req, memberClaims)
	w := httptest.NewRecorder()

	guarded := ownerGuard(http.HandlerFunc(h.ListUsers))
	guarded.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("ListUsers with member role: got %d, want %d", w.Code, http.StatusForbidden)
	}
}
