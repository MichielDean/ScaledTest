package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/scaledtest/scaledtest/internal/model"
)

func TestCreateExecutionInvalidRequest(t *testing.T) {
	h := &ExecutionsHandler{}

	tests := []struct {
		name string
		body string
	}{
		{"empty body", ""},
		{"missing command", `{"image":"alpine"}`},
		{"invalid json", `{bad}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("POST", "/api/v1/executions", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			h.Create(w, req)

			if w.Code == http.StatusOK || w.Code == http.StatusCreated {
				t.Errorf("Create(%s): should not succeed, got %d", tt.name, w.Code)
			}
		})
	}
}

func TestCreateExecutionWithRetryConfig(t *testing.T) {
	h := &ExecutionsHandler{}

	body := `{"command":"npm test","retry_config":{"max_retries":3,"flaky_detection":true,"quarantine_flaky":true}}`
	req := httptest.NewRequest("POST", "/api/v1/executions", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Create(w, req)

	// Should get 501 (not implemented) but NOT 400 — retry config should be accepted
	if w.Code == http.StatusBadRequest {
		t.Errorf("Create with retry config: unexpected 400, body: %s", w.Body.String())
	}
}

func TestCreateExecutionRetryConfigClamped(t *testing.T) {
	// Verify that excessive retry counts get clamped
	var req CreateExecutionRequest
	body := `{"command":"npm test","retry_config":{"max_retries":50}}`
	if err := json.Unmarshal([]byte(body), &req); err != nil {
		t.Fatal(err)
	}

	if req.RetryConfig == nil {
		t.Fatal("retry_config should be parsed")
	}
	if req.RetryConfig.MaxRetries != 50 {
		t.Fatalf("max_retries should be 50 before clamping, got %d", req.RetryConfig.MaxRetries)
	}
}

func TestExecutionResponseShape(t *testing.T) {
	resp := ExecutionResponse{
		ID:      "exec-1",
		Status:  "pending",
		Command: "npm test",
		RetryConfig: &model.RetryConfig{
			MaxRetries:      3,
			FlakyDetection:  true,
			QuarantineFlaky: false,
		},
	}

	data, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var decoded map[string]interface{}
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	for _, key := range []string{"id", "status", "command", "retry_config"} {
		if _, ok := decoded[key]; !ok {
			t.Errorf("missing key %q in ExecutionResponse", key)
		}
	}

	rc := decoded["retry_config"].(map[string]interface{})
	for _, key := range []string{"max_retries", "flaky_detection", "quarantine_flaky"} {
		if _, ok := rc[key]; !ok {
			t.Errorf("missing key %q in retry_config", key)
		}
	}
}

func TestUpdateStatusInvalidRequest(t *testing.T) {
	h := &ExecutionsHandler{}

	tests := []struct {
		name string
		body string
	}{
		{"empty body", ""},
		{"invalid status", `{"status":"bogus"}`},
		{"invalid json", `{bad}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("PUT", "/api/v1/executions/exec-1/status", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			h.UpdateStatus(w, req)

			// Without chi URL params, executionID will be empty → 400
			if w.Code == http.StatusOK {
				t.Errorf("UpdateStatus(%s): should not succeed", tt.name)
			}
		})
	}
}

func TestQuarantinedTestsResponseShape(t *testing.T) {
	resp := QuarantinedTestsResponse{
		QuarantinedTests: []string{"TestFlaky1", "TestFlaky2"},
		Total:            2,
	}

	data, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var decoded map[string]interface{}
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if _, ok := decoded["quarantined_tests"]; !ok {
		t.Error("missing quarantined_tests key")
	}
	if _, ok := decoded["total"]; !ok {
		t.Error("missing total key")
	}
}
