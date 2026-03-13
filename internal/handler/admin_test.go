package handler

import (
	"encoding/json"
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

func TestAdminListUsers(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/v1/admin/users", nil)
	req = testWithClaims(req, testClaims)
	w := httptest.NewRecorder()
	AdminListUsers(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("AdminListUsers: got %d, want %d", w.Code, http.StatusOK)
	}
	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	users, ok := resp["users"].([]interface{})
	if !ok || len(users) != 0 {
		t.Errorf("expected empty users array, got %v", resp["users"])
	}
}
