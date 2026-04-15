package model

import (
	"encoding/json"
	"testing"
)

func TestTestExecution_WorkerTokenSecret_NotSerializedInJSON(t *testing.T) {
	secret := "st-worker-token-exec-123"
	e := TestExecution{
		ID:                "exec-123",
		TeamID:            "team-1",
		Status:            "running",
		Command:           "npm test",
		WorkerTokenSecret: &secret,
	}

	data, err := json.Marshal(e)
	if err != nil {
		t.Fatalf("Marshal TestExecution: %v", err)
	}

	var m map[string]interface{}
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatalf("Unmarshal marshalled TestExecution: %v", err)
	}

	if _, ok := m["worker_token_secret"]; ok {
		t.Errorf("worker_token_secret should not appear in JSON output, got: %s", string(data))
	}
}

func TestTestExecution_WorkerTokenSecret_NilNotSerializedInJSON(t *testing.T) {
	e := TestExecution{
		ID:                "exec-456",
		TeamID:            "team-2",
		Status:            "completed",
		Command:           "pytest",
		WorkerTokenSecret: nil,
	}

	data, err := json.Marshal(e)
	if err != nil {
		t.Fatalf("Marshal TestExecution: %v", err)
	}

	var m map[string]interface{}
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatalf("Unmarshal marshalled TestExecution: %v", err)
	}

	if _, ok := m["worker_token_secret"]; ok {
		t.Errorf("worker_token_secret should not appear in JSON output even when nil, got: %s", string(data))
	}
}
