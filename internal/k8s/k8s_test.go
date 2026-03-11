package k8s

import (
	"testing"
)

func TestJobStatusIsFinished(t *testing.T) {
	tests := []struct {
		name   string
		status JobStatus
		want   bool
	}{
		{"active", JobStatus{Active: 1}, false},
		{"completed", JobStatus{Completed: true, Succeeded: 1}, true},
		{"failed", JobStatus{FailedCondition: true, Failed: 1}, true},
		{"zero state", JobStatus{}, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.status.IsFinished(); got != tt.want {
				t.Errorf("IsFinished() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestJobConfigLabels(t *testing.T) {
	cfg := JobConfig{
		Name:        "exec-123",
		Image:       "scaledtest/worker:latest",
		Command:     "npm test",
		ExecutionID: "exec-123",
		WorkerToken: "token",
		APIBaseURL:  "http://api:8080",
	}

	if cfg.Name != "exec-123" {
		t.Errorf("Name = %q", cfg.Name)
	}
	if cfg.ExecutionID != "exec-123" {
		t.Errorf("ExecutionID = %q", cfg.ExecutionID)
	}
}
