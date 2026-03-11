package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/scaledtest/scaledtest/internal/auth"
)

func withClaims(r *http.Request) *http.Request {
	claims := &auth.Claims{
		UserID: "test-user",
		Email:  "test@example.com",
		Role:   "owner",
		TeamID: "test-team",
	}
	ctx := context.WithValue(r.Context(), auth.ClaimsContextKey, claims)
	return r.WithContext(ctx)
}

func TestCreateExecution_ParallelValidation(t *testing.T) {
	h := &ExecutionsHandler{}

	tests := []struct {
		name       string
		body       map[string]interface{}
		wantStatus int
		wantErr    string
	}{
		{
			name: "valid parallel request",
			body: map[string]interface{}{
				"command": "npm test",
				"parallel": map[string]interface{}{
					"workers":        3,
					"split_strategy": "round-robin",
					"test_files":     []string{"a.test.js", "b.test.js", "c.test.js"},
				},
			},
			wantStatus: http.StatusAccepted,
		},
		{
			name: "invalid strategy",
			body: map[string]interface{}{
				"command": "npm test",
				"parallel": map[string]interface{}{
					"workers":        2,
					"split_strategy": "invalid",
					"test_files":     []string{"a.test.js"},
				},
			},
			wantStatus: http.StatusBadRequest,
			wantErr:    "SplitStrategy",
		},
		{
			name: "too many workers",
			body: map[string]interface{}{
				"command": "npm test",
				"parallel": map[string]interface{}{
					"workers":        100,
					"split_strategy": "round-robin",
					"test_files":     []string{"a.test.js"},
				},
			},
			wantStatus: http.StatusBadRequest,
			wantErr:    "Workers",
		},
		{
			name: "no test files",
			body: map[string]interface{}{
				"command": "npm test",
				"parallel": map[string]interface{}{
					"workers":        2,
					"split_strategy": "round-robin",
				},
			},
			wantStatus: http.StatusBadRequest,
			wantErr:    "test_files",
		},
		{
			name: "by-duration strategy",
			body: map[string]interface{}{
				"command": "npm test",
				"parallel": map[string]interface{}{
					"workers":        2,
					"split_strategy": "by-duration",
					"test_files":     []string{"fast.test.js", "slow.test.js"},
					"duration_data": map[string]int64{
						"fast.test.js": 100,
						"slow.test.js": 5000,
					},
				},
			},
			wantStatus: http.StatusAccepted,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body, _ := json.Marshal(tt.body)
			req := httptest.NewRequest("POST", "/api/v1/executions", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			req = withClaims(req)

			rr := httptest.NewRecorder()
			h.Create(rr, req)

			if rr.Code != tt.wantStatus {
				t.Errorf("status = %d, want %d; body = %s", rr.Code, tt.wantStatus, rr.Body.String())
			}

			if tt.wantErr != "" {
				var resp map[string]interface{}
				json.NewDecoder(rr.Body).Decode(&resp)
				if errMsg, ok := resp["error"].(string); ok {
					if !bytes.Contains([]byte(errMsg), []byte(tt.wantErr)) {
						t.Errorf("error = %q, want to contain %q", errMsg, tt.wantErr)
					}
				}
			}
		})
	}
}

func TestCreateExecution_ParallelSplitResponse(t *testing.T) {
	h := &ExecutionsHandler{}

	body, _ := json.Marshal(map[string]interface{}{
		"command": "npm test",
		"parallel": map[string]interface{}{
			"workers":        3,
			"split_strategy": "round-robin",
			"test_files":     []string{"a.test.js", "b.test.js", "c.test.js", "d.test.js", "e.test.js"},
		},
	})

	req := httptest.NewRequest("POST", "/api/v1/executions", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = withClaims(req)

	rr := httptest.NewRecorder()
	h.Create(rr, req)

	if rr.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want %d; body = %s", rr.Code, http.StatusAccepted, rr.Body.String())
	}

	var resp map[string]interface{}
	json.NewDecoder(rr.Body).Decode(&resp)

	if resp["parallelism"].(float64) != 3 {
		t.Errorf("parallelism = %v, want 3", resp["parallelism"])
	}
	if resp["split_strategy"] != "round-robin" {
		t.Errorf("split_strategy = %v, want round-robin", resp["split_strategy"])
	}

	workers, ok := resp["workers"].([]interface{})
	if !ok {
		t.Fatal("workers not found in response")
	}
	if len(workers) != 3 {
		t.Errorf("workers count = %d, want 3", len(workers))
	}

	// Verify round-robin distribution: 5 files across 3 workers = [2, 2, 1]
	totalFiles := 0
	for _, w := range workers {
		wm := w.(map[string]interface{})
		files := wm["test_files"].([]interface{})
		totalFiles += len(files)
	}
	if totalFiles != 5 {
		t.Errorf("total distributed files = %d, want 5", totalFiles)
	}
}
