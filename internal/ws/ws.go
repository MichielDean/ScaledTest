package ws

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
	"nhooyr.io/websocket"
	"nhooyr.io/websocket/wsjson"
)

// Message represents a WebSocket message sent to clients.
type Message struct {
	Type        string      `json:"type"`         // execution.status, execution.log
	ExecutionID string      `json:"execution_id"`
	Data        interface{} `json:"data"`
	Timestamp   time.Time   `json:"timestamp"`
}

// Hub manages WebSocket client connections and broadcasts.
type Hub struct {
	mu             sync.RWMutex
	clients        map[*client]bool
	originPatterns []string
}

type client struct {
	conn        *websocket.Conn
	executionID string // Empty means subscribe to all
	send        chan Message
}

// NewHub creates a new WebSocket hub. originPatterns restricts which origins
// can establish WebSocket connections (e.g. "https://scaledtest.example.com").
// Pass nil or empty for development (allows all origins).
func NewHub(originPatterns ...string) *Hub {
	if len(originPatterns) == 0 {
		originPatterns = []string{"*"}
	}
	return &Hub{
		clients:        make(map[*client]bool),
		originPatterns: originPatterns,
	}
}

// HandleConnect upgrades an HTTP connection to WebSocket and registers the client.
func (h *Hub) HandleConnect(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: h.originPatterns,
	})
	if err != nil {
		log.Error().Err(err).Msg("websocket accept failed")
		return
	}

	executionID := r.URL.Query().Get("execution_id")

	c := &client{
		conn:        conn,
		executionID: executionID,
		send:        make(chan Message, 64),
	}

	h.register(c)
	defer h.unregister(c)

	ctx := r.Context()

	// Writer goroutine
	go func() {
		for msg := range c.send {
			if err := wsjson.Write(ctx, conn, msg); err != nil {
				return
			}
		}
	}()

	// Reader loop — keeps connection alive and handles client messages
	for {
		_, _, err := conn.Read(ctx)
		if err != nil {
			break
		}
	}
}

// Broadcast sends a message to all connected clients subscribed to the execution.
func (h *Hub) Broadcast(msg Message) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	for c := range h.clients {
		// Send to clients subscribed to this execution or to all executions
		if c.executionID == "" || c.executionID == msg.ExecutionID {
			select {
			case c.send <- msg:
			default:
				// Client buffer full — drop message
				log.Warn().Msg("websocket client buffer full, dropping message")
			}
		}
	}
}

// BroadcastExecutionStatus is a convenience method for broadcasting execution status changes.
func (h *Hub) BroadcastExecutionStatus(executionID, status string, details interface{}) {
	h.Broadcast(Message{
		Type:        "execution.status",
		ExecutionID: executionID,
		Data: map[string]interface{}{
			"status":  status,
			"details": details,
		},
		Timestamp: time.Now(),
	})
}

// BroadcastTestResult streams an individual test result as it completes.
func (h *Hub) BroadcastTestResult(executionID string, result interface{}) {
	h.Broadcast(Message{
		Type:        "execution.test_result",
		ExecutionID: executionID,
		Data:        result,
		Timestamp:   time.Now(),
	})
}

// BroadcastProgress streams live pass/fail/skip counters and ETA.
func (h *Hub) BroadcastProgress(executionID string, progress interface{}) {
	h.Broadcast(Message{
		Type:        "execution.progress",
		ExecutionID: executionID,
		Data:        progress,
		Timestamp:   time.Now(),
	})
}

// BroadcastWorkerStatus streams worker health/status updates.
func (h *Hub) BroadcastWorkerStatus(executionID string, worker interface{}) {
	h.Broadcast(Message{
		Type:        "execution.worker_status",
		ExecutionID: executionID,
		Data:        worker,
		Timestamp:   time.Now(),
	})
}

// ClientCount returns the number of connected clients.
func (h *Hub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// Shutdown gracefully closes all client connections.
func (h *Hub) Shutdown(ctx context.Context) {
	h.mu.Lock()
	defer h.mu.Unlock()

	for c := range h.clients {
		c.conn.Close(websocket.StatusGoingAway, "server shutting down")
		close(c.send)
		delete(h.clients, c)
	}
}

func (h *Hub) register(c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[c] = true
	log.Debug().Int("clients", len(h.clients)).Msg("websocket client connected")
}

func (h *Hub) unregister(c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.clients[c]; ok {
		close(c.send)
		delete(h.clients, c)
		log.Debug().Int("clients", len(h.clients)).Msg("websocket client disconnected")
	}
}

// MarshalMessage converts a Message to JSON bytes.
func MarshalMessage(msg Message) ([]byte, error) {
	return json.Marshal(msg)
}
