//go:build integration

package store_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/scaledtest/scaledtest/internal/integration"
	"github.com/scaledtest/scaledtest/internal/store"
)

// insertDelivery inserts a webhook_delivery row with a specific delivered_at
// timestamp and returns the generated ID.
func insertDelivery(t *testing.T, tdb *integration.TestDB, webhookID string, deliveredAt time.Time) string {
	t.Helper()
	var id string
	err := tdb.Pool.QueryRow(context.Background(),
		`INSERT INTO webhook_deliveries
		 (webhook_id, url, event_type, payload, attempt, status_code, error, duration_ms, delivered_at)
		 VALUES ($1, 'https://example.com', 'report.submitted', '{}', 1, 200, '', 10, $2)
		 RETURNING id`,
		webhookID, deliveredAt,
	).Scan(&id)
	if err != nil {
		t.Fatalf("insertDelivery: %v", err)
	}
	return id
}

// createWebhookForDelivery creates a team + webhook and returns the webhook ID.
func createWebhookForDelivery(t *testing.T, tdb *integration.TestDB, teamName string) string {
	t.Helper()
	teamID := tdb.CreateTeam(t, teamName)
	ws := store.NewWebhookStore(tdb.Pool)
	wh, err := ws.Create(context.Background(), teamID, "https://example.com", "hash", []string{"report.submitted"})
	if err != nil {
		t.Fatalf("create webhook: %v", err)
	}
	return wh.ID
}

func TestWebhookDeliveryStore_ListByWebhook_Basic(t *testing.T) {
	tdb := integration.Setup(t)
	webhookID := createWebhookForDelivery(t, tdb, "delivery-basic-team")
	s := store.NewWebhookDeliveryStore(tdb.Pool)
	ctx := context.Background()

	now := time.Now().UTC().Truncate(time.Millisecond)
	insertDelivery(t, tdb, webhookID, now.Add(-2*time.Second))
	insertDelivery(t, tdb, webhookID, now.Add(-1*time.Second))
	insertDelivery(t, tdb, webhookID, now)

	deliveries, err := s.ListByWebhook(ctx, webhookID, 10, "")
	if err != nil {
		t.Fatalf("ListByWebhook: %v", err)
	}
	if len(deliveries) != 3 {
		t.Fatalf("want 3 deliveries, got %d", len(deliveries))
	}
	// Most recent first
	if !deliveries[0].DeliveredAt.After(deliveries[1].DeliveredAt) && deliveries[0].DeliveredAt != deliveries[1].DeliveredAt {
		t.Error("deliveries not in descending order")
	}
}

func TestWebhookDeliveryStore_ListByWebhook_CursorPagination(t *testing.T) {
	tdb := integration.Setup(t)
	webhookID := createWebhookForDelivery(t, tdb, "delivery-cursor-team")
	s := store.NewWebhookDeliveryStore(tdb.Pool)
	ctx := context.Background()

	now := time.Now().UTC().Truncate(time.Millisecond)
	// Insert 5 rows newest to oldest
	ids := make([]string, 5)
	for i := 0; i < 5; i++ {
		ids[i] = insertDelivery(t, tdb, webhookID, now.Add(time.Duration(-i)*time.Second))
	}
	// ids[0] is newest, ids[4] is oldest

	// First page: no cursor, limit 2 → should get ids[0] and ids[1]
	page1, err := s.ListByWebhook(ctx, webhookID, 2, "")
	if err != nil {
		t.Fatalf("page1: %v", err)
	}
	if len(page1) != 2 {
		t.Fatalf("page1: want 2, got %d", len(page1))
	}
	if page1[0].ID != ids[0] {
		t.Errorf("page1[0].ID = %q, want %q", page1[0].ID, ids[0])
	}
	if page1[1].ID != ids[1] {
		t.Errorf("page1[1].ID = %q, want %q", page1[1].ID, ids[1])
	}

	// Second page: cursor = ids[1] → should get ids[2] and ids[3]
	page2, err := s.ListByWebhook(ctx, webhookID, 2, ids[1])
	if err != nil {
		t.Fatalf("page2: %v", err)
	}
	if len(page2) != 2 {
		t.Fatalf("page2: want 2, got %d", len(page2))
	}
	if page2[0].ID != ids[2] {
		t.Errorf("page2[0].ID = %q, want %q", page2[0].ID, ids[2])
	}
	if page2[1].ID != ids[3] {
		t.Errorf("page2[1].ID = %q, want %q", page2[1].ID, ids[3])
	}

	// Third page: cursor = ids[3] → should get only ids[4]
	page3, err := s.ListByWebhook(ctx, webhookID, 2, ids[3])
	if err != nil {
		t.Fatalf("page3: %v", err)
	}
	if len(page3) != 1 {
		t.Fatalf("page3: want 1, got %d", len(page3))
	}
	if page3[0].ID != ids[4] {
		t.Errorf("page3[0].ID = %q, want %q", page3[0].ID, ids[4])
	}
}

func TestWebhookDeliveryStore_ListByWebhook_TimestampTiebreaker(t *testing.T) {
	tdb := integration.Setup(t)
	webhookID := createWebhookForDelivery(t, tdb, "delivery-tiebreaker-team")
	s := store.NewWebhookDeliveryStore(tdb.Pool)
	ctx := context.Background()

	// Insert three rows sharing the same delivered_at timestamp.
	sameTime := time.Now().UTC().Truncate(time.Millisecond)
	idA := insertDelivery(t, tdb, webhookID, sameTime)
	idB := insertDelivery(t, tdb, webhookID, sameTime)
	idC := insertDelivery(t, tdb, webhookID, sameTime)

	// First page: no cursor, limit 2. We expect exactly 2 of the 3 rows.
	page1, err := s.ListByWebhook(ctx, webhookID, 2, "")
	if err != nil {
		t.Fatalf("page1: %v", err)
	}
	if len(page1) != 2 {
		t.Fatalf("page1: want 2, got %d", len(page1))
	}

	// Cursor at the last row of page1 → should return exactly 1 row, not 0.
	cursorID := page1[1].ID
	page2, err := s.ListByWebhook(ctx, webhookID, 2, cursorID)
	if err != nil {
		t.Fatalf("page2: %v", err)
	}
	if len(page2) != 1 {
		t.Fatalf("page2: want 1, got %d (silent data loss at timestamp boundary)", len(page2))
	}

	// The remaining row must be the one not yet seen.
	seenIDs := map[string]bool{page1[0].ID: true, page1[1].ID: true}
	for _, id := range []string{idA, idB, idC} {
		if !seenIDs[id] {
			if page2[0].ID != id {
				t.Errorf("remaining row ID = %q, want %q", page2[0].ID, id)
			}
		}
	}
}

func TestWebhookDeliveryStore_ListByWebhook_InvalidCursor(t *testing.T) {
	tdb := integration.Setup(t)
	webhookID := createWebhookForDelivery(t, tdb, "delivery-invalid-cursor-team")
	s := store.NewWebhookDeliveryStore(tdb.Pool)
	ctx := context.Background()

	// Non-existent cursor ID should return ErrInvalidCursor.
	_, err := s.ListByWebhook(ctx, webhookID, 20, "00000000-0000-0000-0000-000000000000")
	if err == nil {
		t.Fatal("want error for non-existent before_id, got nil")
	}
	if !errors.Is(err, store.ErrInvalidCursor) {
		t.Errorf("want ErrInvalidCursor, got %v", err)
	}
}

func TestWebhookDeliveryStore_ListByWebhook_WrongWebhookCursor(t *testing.T) {
	tdb := integration.Setup(t)
	webhookID := createWebhookForDelivery(t, tdb, "delivery-wrong-wh-team-a")
	otherWebhookID := createWebhookForDelivery(t, tdb, "delivery-wrong-wh-team-b")
	s := store.NewWebhookDeliveryStore(tdb.Pool)
	ctx := context.Background()

	// Insert a delivery under otherWebhookID.
	now := time.Now().UTC().Truncate(time.Millisecond)
	otherDeliveryID := insertDelivery(t, tdb, otherWebhookID, now)

	// Using that delivery ID as a cursor for webhookID must return ErrInvalidCursor.
	_, err := s.ListByWebhook(ctx, webhookID, 20, otherDeliveryID)
	if err == nil {
		t.Fatal("want error for cursor belonging to different webhook, got nil")
	}
	if !errors.Is(err, store.ErrInvalidCursor) {
		t.Errorf("want ErrInvalidCursor, got %v", err)
	}
}
