//go:build integration

package store_test

import (
	"context"
	"testing"
	"time"

	"github.com/scaledtest/scaledtest/internal/integration"
	"github.com/scaledtest/scaledtest/internal/store"
)

func TestAuditStore_LogAndList(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	s := store.NewAuditStore(tdb.Pool)

	actorID := "00000000-0000-0000-0000-000000000099"
	teamID := tdb.CreateTeam(t, "audit-test-team")

	// Log writes should not panic or block
	s.Log(ctx, store.Entry{
		ActorID:      actorID,
		ActorEmail:   "test@example.com",
		TeamID:       teamID,
		Action:       "report.created",
		ResourceType: "report",
		ResourceID:   "r-1",
		Metadata:     map[string]interface{}{"key": "value"},
	})
	s.Log(ctx, store.Entry{
		ActorID:      actorID,
		ActorEmail:   "test@example.com",
		TeamID:       teamID,
		Action:       "execution.created",
		ResourceType: "execution",
		ResourceID:   "e-1",
	})

	// Verify entries were persisted
	entries, total, err := s.List(ctx, store.AuditListFilter{Limit: 10})
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if total < 2 {
		t.Errorf("total = %d, want >= 2", total)
	}
	if len(entries) < 2 {
		t.Errorf("entries = %d, want >= 2", len(entries))
	}
}

func TestAuditStore_ListFilters(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	s := store.NewAuditStore(tdb.Pool)

	actorA := "00000000-0000-0000-0000-00000000000a"
	actorB := "00000000-0000-0000-0000-00000000000b"

	s.Log(ctx, store.Entry{ActorID: actorA, ActorEmail: "a@test.com", Action: "report.created", ResourceType: "report", ResourceID: "r1"})
	s.Log(ctx, store.Entry{ActorID: actorB, ActorEmail: "b@test.com", Action: "execution.created", ResourceType: "execution", ResourceID: "e1"})
	s.Log(ctx, store.Entry{ActorID: actorA, ActorEmail: "a@test.com", Action: "report.deleted", ResourceType: "report", ResourceID: "r2"})

	// Filter by action
	entries, total, err := s.List(ctx, store.AuditListFilter{Action: "report.created", Limit: 10})
	if err != nil {
		t.Fatalf("List by action: %v", err)
	}
	if total != 1 {
		t.Errorf("action filter: total = %d, want 1", total)
	}
	if len(entries) != 1 {
		t.Errorf("action filter: entries = %d, want 1", len(entries))
	}

	// Filter by actor
	entries2, total2, err := s.List(ctx, store.AuditListFilter{ActorID: actorA, Limit: 10})
	if err != nil {
		t.Fatalf("List by actor: %v", err)
	}
	if total2 != 2 {
		t.Errorf("actor filter: total = %d, want 2", total2)
	}
	if len(entries2) != 2 {
		t.Errorf("actor filter: entries = %d, want 2", len(entries2))
	}

	// Filter by resource type
	entries3, total3, err := s.List(ctx, store.AuditListFilter{ResourceType: "execution", Limit: 10})
	if err != nil {
		t.Fatalf("List by resource type: %v", err)
	}
	if total3 != 1 {
		t.Errorf("resource_type filter: total = %d, want 1", total3)
	}
	if len(entries3) != 1 {
		t.Errorf("resource_type filter: entries = %d, want 1", len(entries3))
	}
}

func TestAuditStore_ListTimeFilters(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	s := store.NewAuditStore(tdb.Pool)

	before := time.Now().Add(-1 * time.Second)
	s.Log(ctx, store.Entry{ActorID: "00000000-0000-0000-0000-000000000001", ActorEmail: "t@test.com", Action: "test.action"})
	after := time.Now().Add(1 * time.Second)

	// Since filter
	entries, total, err := s.List(ctx, store.AuditListFilter{Since: &before, Limit: 10})
	if err != nil {
		t.Fatalf("List since: %v", err)
	}
	if total < 1 {
		t.Errorf("since filter: total = %d, want >= 1", total)
	}
	if len(entries) < 1 {
		t.Errorf("since filter: entries = %d, want >= 1", len(entries))
	}

	// Until filter (future) should include the entry
	entries2, _, err := s.List(ctx, store.AuditListFilter{Until: &after, Limit: 10})
	if err != nil {
		t.Fatalf("List until: %v", err)
	}
	if len(entries2) < 1 {
		t.Errorf("until filter: entries = %d, want >= 1", len(entries2))
	}

	// Until filter (past) should exclude the entry
	past := time.Now().Add(-1 * time.Hour)
	_, total3, err := s.List(ctx, store.AuditListFilter{Until: &past, Limit: 10})
	if err != nil {
		t.Fatalf("List until past: %v", err)
	}
	if total3 != 0 {
		t.Errorf("until past filter: total = %d, want 0", total3)
	}
}

func TestAuditStore_LogOptionalFields(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	s := store.NewAuditStore(tdb.Pool)

	// Log with minimal fields (no team, resource, or metadata)
	s.Log(ctx, store.Entry{
		ActorID:    "00000000-0000-0000-0000-000000000001",
		ActorEmail: "minimal@test.com",
		Action:     "login",
	})

	entries, total, err := s.List(ctx, store.AuditListFilter{Action: "login", Limit: 10})
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if total != 1 {
		t.Errorf("total = %d, want 1", total)
	}
	if len(entries) != 1 {
		t.Fatalf("entries = %d, want 1", len(entries))
	}
	if entries[0].TeamID != nil {
		t.Error("expected nil TeamID for entry without team")
	}
	if entries[0].ResourceType != nil {
		t.Error("expected nil ResourceType for entry without resource")
	}
}

func TestAuditStore_ListDefaultLimit(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	s := store.NewAuditStore(tdb.Pool)

	// List with zero limit should use default (50)
	_, _, err := s.List(ctx, store.AuditListFilter{Limit: 0})
	if err != nil {
		t.Fatalf("List with zero limit: %v", err)
	}

	// List with negative limit should use default
	_, _, err = s.List(ctx, store.AuditListFilter{Limit: -1})
	if err != nil {
		t.Fatalf("List with negative limit: %v", err)
	}
}
