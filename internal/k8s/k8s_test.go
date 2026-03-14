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

func TestJobConfigWithEnvVars(t *testing.T) {
	cfg := JobConfig{
		Name:        "exec-env",
		Image:       "node:22",
		Command:     "npm test",
		ExecutionID: "exec-env",
		WorkerToken: "tok",
		APIBaseURL:  "http://api:8080",
		EnvVars: map[string]string{
			"NODE_ENV": "test",
			"CI":       "true",
		},
	}

	if len(cfg.EnvVars) != 2 {
		t.Errorf("EnvVars count = %d, want 2", len(cfg.EnvVars))
	}
	if cfg.EnvVars["NODE_ENV"] != "test" {
		t.Errorf("NODE_ENV = %q, want %q", cfg.EnvVars["NODE_ENV"], "test")
	}
}

func TestJobStatusStates(t *testing.T) {
	tests := []struct {
		name     string
		status   JobStatus
		finished bool
	}{
		{"running with active pods", JobStatus{Active: 3}, false},
		{"completed all succeeded", JobStatus{Completed: true, Succeeded: 5}, true},
		{"failed with condition", JobStatus{FailedCondition: true, Failed: 2}, true},
		{"partially active", JobStatus{Active: 2, Succeeded: 1}, false},
		{"all succeeded no condition", JobStatus{Succeeded: 3, Completed: true}, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.status.IsFinished(); got != tt.finished {
				t.Errorf("IsFinished() = %v, want %v", got, tt.finished)
			}
		})
	}
}
