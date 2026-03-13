//go:build integration

package integration

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/scaledtest/scaledtest/internal/handler"
	"github.com/scaledtest/scaledtest/internal/store"
)

func TestListAuditLog_HappyPath(t *testing.T) {
	tdb := Setup(t)
	ctx := context.Background()

	auditStore := store.NewAuditStore(tdb.Pool)
	h := &handler.AdminHandler{AuditStore: auditStore}

	// Insert known audit rows
	actorID := "00000000-0000-0000-0000-000000000001"
	entries := []store.Entry{
		{ActorID: actorID, ActorEmail: "user@example.com", Action: "report.submit", ResourceType: "report", ResourceID: "r1"},
		{ActorID: actorID, ActorEmail: "user@example.com", Action: "execution.create", ResourceType: "execution", ResourceID: "e1"},
		{ActorID: actorID, ActorEmail: "user@example.com", Action: "report.delete", ResourceType: "report", ResourceID: "r2"},
	}
	for _, e := range entries {
		auditStore.Log(ctx, e)
	}
	// Brief pause to ensure created_at ordering is stable
	time.Sleep(10 * time.Millisecond)

	req := httptest.NewRequest("GET", "/api/v1/admin/audit-log?limit=10&offset=0", nil)
	w := httptest.NewRecorder()
	h.ListAuditLog(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("ListAuditLog: got %d, want 200; body: %s", w.Code, w.Body.String())
	}

	var resp struct {
		AuditLog []map[string]interface{} `json:"audit_log"`
		Total    int                      `json:"total"`
	}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Total < 3 {
		t.Errorf("expected total >= 3, got %d", resp.Total)
	}
	if len(resp.AuditLog) < 3 {
		t.Errorf("expected at least 3 audit_log entries, got %d", len(resp.AuditLog))
	}

	// Verify actor_id filter
	req2 := httptest.NewRequest("GET", "/api/v1/admin/audit-log?actor_id="+actorID, nil)
	w2 := httptest.NewRecorder()
	h.ListAuditLog(w2, req2)
	if w2.Code != http.StatusOK {
		t.Fatalf("ListAuditLog with actor_id filter: got %d", w2.Code)
	}
	var resp2 struct {
		AuditLog []map[string]interface{} `json:"audit_log"`
		Total    int                      `json:"total"`
	}
	json.NewDecoder(w2.Body).Decode(&resp2)
	if resp2.Total < 3 {
		t.Errorf("actor_id filter: expected total >= 3, got %d", resp2.Total)
	}

	// Verify invalid actor_id returns 400
	req3 := httptest.NewRequest("GET", "/api/v1/admin/audit-log?actor_id=not-a-uuid", nil)
	w3 := httptest.NewRecorder()
	h.ListAuditLog(w3, req3)
	if w3.Code != http.StatusBadRequest {
		t.Errorf("invalid actor_id: expected 400, got %d", w3.Code)
	}
}
