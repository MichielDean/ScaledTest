package ws

import (
	"testing"
	"time"
)

func TestNewHub(t *testing.T) {
	hub := NewHub()
	if hub == nil {
		t.Fatal("NewHub() returned nil")
	}
	if hub.ClientCount() != 0 {
		t.Errorf("ClientCount() = %d, want 0", hub.ClientCount())
	}
}

func TestNewHubWithOriginPatterns(t *testing.T) {
	hub := NewHub("https://example.com", "https://other.com")
	if hub == nil {
		t.Fatal("NewHub() returned nil")
	}
	if len(hub.originPatterns) != 2 {
		t.Errorf("originPatterns length = %d, want 2", len(hub.originPatterns))
	}
}

func TestMarshalMessage(t *testing.T) {
	msg := Message{
		Type:        "execution.status",
		ExecutionID: "exec-123",
		Data:        map[string]string{"status": "running"},
		Timestamp:   time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
	}

	data, err := MarshalMessage(msg)
	if err != nil {
		t.Fatalf("MarshalMessage() error: %v", err)
	}

	if len(data) == 0 {
		t.Error("MarshalMessage() returned empty bytes")
	}
}

func TestBroadcastNoClients(t *testing.T) {
	hub := NewHub()
	// Should not panic with no clients
	hub.Broadcast(Message{
		Type:        "execution.status",
		ExecutionID: "exec-1",
		Data:        "test",
		Timestamp:   time.Now(),
	})
}

func TestBroadcastExecutionStatus(t *testing.T) {
	hub := NewHub()
	// Should not panic with no clients
	hub.BroadcastExecutionStatus("exec-1", "running", nil)
}

// newTestClient creates a client with a buffered send channel for testing.
// conn is nil since tests only inspect the send channel.
func newTestClient(executionID string, bufSize int) *client {
	return &client{
		conn:        nil,
		executionID: executionID,
		send:        make(chan Message, bufSize),
	}
}

func TestSubscribeUnsubscribe(t *testing.T) {
	hub := NewHub()

	c1 := newTestClient("", 8)
	c2 := newTestClient("exec-1", 8)

	// Register two clients
	hub.register(c1)
	if hub.ClientCount() != 1 {
		t.Fatalf("ClientCount() after first register = %d, want 1", hub.ClientCount())
	}

	hub.register(c2)
	if hub.ClientCount() != 2 {
		t.Fatalf("ClientCount() after second register = %d, want 2", hub.ClientCount())
	}

	// Unregister first client
	hub.unregister(c1)
	if hub.ClientCount() != 1 {
		t.Fatalf("ClientCount() after unregister = %d, want 1", hub.ClientCount())
	}

	// Unregister same client again — should be a no-op
	hub.unregister(c1)
	if hub.ClientCount() != 1 {
		t.Fatalf("ClientCount() after duplicate unregister = %d, want 1", hub.ClientCount())
	}

	// Unregister second client
	hub.unregister(c2)
	if hub.ClientCount() != 0 {
		t.Fatalf("ClientCount() after all unregistered = %d, want 0", hub.ClientCount())
	}
}

func TestBroadcastDeliversToAllSubscribers(t *testing.T) {
	hub := NewHub()

	// Three clients: two wildcard (executionID=""), one filtered
	c1 := newTestClient("", 8)
	c2 := newTestClient("", 8)
	c3 := newTestClient("exec-1", 8)

	hub.register(c1)
	hub.register(c2)
	hub.register(c3)

	msg := Message{
		Type:        "execution.status",
		ExecutionID: "exec-1",
		Data:        "payload",
		Timestamp:   time.Now(),
	}

	hub.Broadcast(msg)

	// All three should receive: c1 and c2 subscribe to all, c3 matches exec-1
	for _, tc := range []struct {
		name string
		c    *client
	}{
		{"wildcard-1", c1},
		{"wildcard-2", c2},
		{"filtered", c3},
	} {
		select {
		case got := <-tc.c.send:
			if got.ExecutionID != "exec-1" {
				t.Errorf("%s: ExecutionID = %q, want %q", tc.name, got.ExecutionID, "exec-1")
			}
			if got.Type != "execution.status" {
				t.Errorf("%s: Type = %q, want %q", tc.name, got.Type, "execution.status")
			}
		default:
			t.Errorf("%s: expected message on send channel, got none", tc.name)
		}
	}

	// Clean up
	hub.unregister(c1)
	hub.unregister(c2)
	hub.unregister(c3)
}

func TestBroadcastFiltersNonMatchingClients(t *testing.T) {
	hub := NewHub()

	// Client subscribed to exec-2 should NOT receive a message for exec-1
	c := newTestClient("exec-2", 8)
	hub.register(c)

	hub.Broadcast(Message{
		Type:        "execution.status",
		ExecutionID: "exec-1",
		Data:        "payload",
		Timestamp:   time.Now(),
	})

	select {
	case msg := <-c.send:
		t.Errorf("expected no message for non-matching client, got %+v", msg)
	default:
		// Correct: no message delivered
	}

	hub.unregister(c)
}

func TestBroadcastClosedClientDoesNotBlock(t *testing.T) {
	hub := NewHub()

	// Client with buffer size 1 — fill it so next broadcast drops
	full := newTestClient("", 1)
	full.send <- Message{Type: "filler"} // Fill the buffer

	// A healthy client that should still receive messages
	healthy := newTestClient("", 8)

	hub.register(full)
	hub.register(healthy)

	msg := Message{
		Type:        "execution.status",
		ExecutionID: "exec-1",
		Data:        "important",
		Timestamp:   time.Now(),
	}

	// Broadcast must not block even though full's buffer is saturated
	done := make(chan struct{})
	go func() {
		hub.Broadcast(msg)
		close(done)
	}()

	select {
	case <-done:
		// Broadcast returned without blocking — correct
	case <-time.After(time.Second):
		t.Fatal("Broadcast blocked on client with full buffer")
	}

	// Healthy client should have received the message
	select {
	case got := <-healthy.send:
		if got.Type != "execution.status" {
			t.Errorf("healthy client Type = %q, want %q", got.Type, "execution.status")
		}
	default:
		t.Error("healthy client did not receive broadcast message")
	}

	// Full client's buffer should contain only the filler (new message dropped)
	select {
	case got := <-full.send:
		if got.Type != "filler" {
			t.Errorf("full client should have filler message, got Type=%q", got.Type)
		}
	default:
		t.Error("full client lost its filler message")
	}

	hub.unregister(full)
	hub.unregister(healthy)
}

func TestBroadcastConvenienceMethods(t *testing.T) {
	hub := NewHub()

	c := newTestClient("", 16)
	hub.register(c)

	hub.BroadcastExecutionStatus("exec-1", "running", map[string]string{"detail": "ok"})
	hub.BroadcastTestResult("exec-1", map[string]string{"test": "pass"})
	hub.BroadcastProgress("exec-1", map[string]int{"passed": 5})
	hub.BroadcastWorkerStatus("exec-1", map[string]string{"worker": "healthy"})

	expected := []string{
		"execution.status",
		"execution.test_result",
		"execution.progress",
		"execution.worker_status",
	}

	for _, wantType := range expected {
		select {
		case got := <-c.send:
			if got.Type != wantType {
				t.Errorf("got Type=%q, want %q", got.Type, wantType)
			}
			if got.ExecutionID != "exec-1" {
				t.Errorf("got ExecutionID=%q, want %q", got.ExecutionID, "exec-1")
			}
		default:
			t.Errorf("expected message with Type=%q, got none", wantType)
		}
	}

	hub.unregister(c)
}
