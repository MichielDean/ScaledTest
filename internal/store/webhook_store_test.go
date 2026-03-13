//go:build integration

package store_test

import (
	"context"
	"testing"

	"github.com/scaledtest/scaledtest/internal/integration"
	"github.com/scaledtest/scaledtest/internal/store"
)

func TestWebhookStore_CreateAndGet(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "webhook-test-team")
	s := store.NewWebhookStore(tdb.Pool)

	wh, err := s.Create(ctx, teamID, "https://example.com/hook", "secret-hash-1", []string{"report.created"})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if wh.ID == "" {
		t.Fatal("Create returned empty ID")
	}
	if wh.TeamID != teamID {
		t.Errorf("TeamID = %q, want %q", wh.TeamID, teamID)
	}
	if wh.URL != "https://example.com/hook" {
		t.Errorf("URL = %q, want %q", wh.URL, "https://example.com/hook")
	}
	if !wh.Enabled {
		t.Error("expected new webhook to be enabled by default")
	}

	got, err := s.Get(ctx, teamID, wh.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.ID != wh.ID {
		t.Errorf("Get ID = %q, want %q", got.ID, wh.ID)
	}
	if got.URL != wh.URL {
		t.Errorf("Get URL = %q, want %q", got.URL, wh.URL)
	}
}

func TestWebhookStore_List(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "webhook-list-team")
	otherTeamID := tdb.CreateTeam(t, "other-team")
	s := store.NewWebhookStore(tdb.Pool)

	// Create webhooks for two teams
	s.Create(ctx, teamID, "https://example.com/a", "hash-a", []string{"report.created"})
	s.Create(ctx, teamID, "https://example.com/b", "hash-b", []string{"execution.completed"})
	s.Create(ctx, otherTeamID, "https://other.com/c", "hash-c", []string{"report.created"})

	list, err := s.List(ctx, teamID)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(list) != 2 {
		t.Errorf("List returned %d webhooks, want 2", len(list))
	}

	// Verify team isolation
	otherList, err := s.List(ctx, otherTeamID)
	if err != nil {
		t.Fatalf("List other team: %v", err)
	}
	if len(otherList) != 1 {
		t.Errorf("other team List returned %d, want 1", len(otherList))
	}
}

func TestWebhookStore_Update(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "webhook-update-team")
	s := store.NewWebhookStore(tdb.Pool)

	wh, _ := s.Create(ctx, teamID, "https://example.com/old", "hash-1", []string{"report.created"})

	updated, err := s.Update(ctx, teamID, wh.ID, "https://example.com/new", []string{"report.created", "execution.completed"}, false)
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if updated.URL != "https://example.com/new" {
		t.Errorf("URL = %q, want %q", updated.URL, "https://example.com/new")
	}
	if updated.Enabled {
		t.Error("expected webhook to be disabled after update")
	}
	if len(updated.Events) != 2 {
		t.Errorf("Events count = %d, want 2", len(updated.Events))
	}
}

func TestWebhookStore_Delete(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "webhook-delete-team")
	s := store.NewWebhookStore(tdb.Pool)

	wh, _ := s.Create(ctx, teamID, "https://example.com/delete-me", "hash-d", []string{"report.created"})

	if err := s.Delete(ctx, teamID, wh.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	// Verify it's gone
	_, err := s.Get(ctx, teamID, wh.ID)
	if err == nil {
		t.Error("expected error after delete, got nil")
	}

	// Delete non-existent webhook
	err = s.Delete(ctx, teamID, "non-existent-id")
	if err == nil {
		t.Error("expected error deleting non-existent webhook")
	}
}

func TestWebhookStore_ListByTeamAndEvent(t *testing.T) {
	tdb := integration.Setup(t)
	ctx := context.Background()
	teamID := tdb.CreateTeam(t, "webhook-event-team")
	s := store.NewWebhookStore(tdb.Pool)

	// Create webhooks with different events
	s.Create(ctx, teamID, "https://example.com/reports", "hash-r", []string{"report.created"})
	s.Create(ctx, teamID, "https://example.com/executions", "hash-e", []string{"execution.completed"})
	s.Create(ctx, teamID, "https://example.com/both", "hash-b", []string{"report.created", "execution.completed"})

	// Create a disabled webhook for report.created
	wh, _ := s.Create(ctx, teamID, "https://example.com/disabled", "hash-dis", []string{"report.created"})
	s.Update(ctx, teamID, wh.ID, wh.URL, wh.Events, false)

	records, err := s.ListByTeamAndEvent(ctx, teamID, "report.created")
	if err != nil {
		t.Fatalf("ListByTeamAndEvent: %v", err)
	}
	// Should return 2: reports + both (disabled one excluded)
	if len(records) != 2 {
		t.Errorf("ListByTeamAndEvent(report.created) = %d records, want 2", len(records))
	}

	records2, err := s.ListByTeamAndEvent(ctx, teamID, "execution.completed")
	if err != nil {
		t.Fatalf("ListByTeamAndEvent: %v", err)
	}
	if len(records2) != 2 {
		t.Errorf("ListByTeamAndEvent(execution.completed) = %d records, want 2", len(records2))
	}

	// Non-matching event
	records3, err := s.ListByTeamAndEvent(ctx, teamID, "no.such.event")
	if err != nil {
		t.Fatalf("ListByTeamAndEvent: %v", err)
	}
	if len(records3) != 0 {
		t.Errorf("ListByTeamAndEvent(no.such.event) = %d, want 0", len(records3))
	}
}
