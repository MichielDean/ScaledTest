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
