package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"
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
