package llm

import (
	"context"
	"encoding/json"
	"sync"
)

// MockProvider is a test double for Provider.
// It records Analyze calls and returns a configurable response.
// Safe to use from multiple goroutines.
type MockProvider struct {
	mu       sync.Mutex
	response json.RawMessage
	err      error
	calls    []string
}

// NewMock returns a MockProvider that returns response on every Analyze call.
func NewMock(response json.RawMessage) *MockProvider {
	return &MockProvider{response: response}
}

// SetError configures the mock to return err from subsequent Analyze calls.
// Pass nil to clear the error.
func (m *MockProvider) SetError(err error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.err = err
}

// Analyze records the prompt and returns the configured response and error.
func (m *MockProvider) Analyze(_ context.Context, prompt string) (json.RawMessage, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.calls = append(m.calls, prompt)
	return m.response, m.err
}

// Calls returns the prompts passed to Analyze, in call order.
func (m *MockProvider) Calls() []string {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]string, len(m.calls))
	copy(out, m.calls)
	return out
}
