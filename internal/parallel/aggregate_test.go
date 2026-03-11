package parallel

import (
	"testing"

	"github.com/scaledtest/scaledtest/internal/ctrf"
)

func TestAggregateReports_Empty(t *testing.T) {
	result := AggregateReports(nil)
	if result.Results.Summary.Tests != 0 {
		t.Errorf("AggregateReports(nil) tests = %d, want 0", result.Results.Summary.Tests)
	}
}

func TestAggregateReports_Single(t *testing.T) {
	report := &ctrf.Report{
		Results: ctrf.Results{
			Tool: ctrf.Tool{Name: "jest", Version: "29.0"},
			Summary: ctrf.Summary{
				Tests: 3, Passed: 2, Failed: 1,
				Start: 1000, Stop: 2000,
			},
			Tests: []ctrf.Test{
				{Name: "test1", Status: "passed", Duration: 100},
				{Name: "test2", Status: "passed", Duration: 200},
				{Name: "test3", Status: "failed", Duration: 300},
			},
		},
	}

	result := AggregateReports([]*ctrf.Report{report})
	if result.Results.Summary.Tests != 3 {
		t.Errorf("tests = %d, want 3", result.Results.Summary.Tests)
	}
	if result.Results.Summary.Passed != 2 {
		t.Errorf("passed = %d, want 2", result.Results.Summary.Passed)
	}
	if result.Results.Summary.Failed != 1 {
		t.Errorf("failed = %d, want 1", result.Results.Summary.Failed)
	}
	if result.Results.Tool.Name != "jest" {
		t.Errorf("tool = %q, want %q", result.Results.Tool.Name, "jest")
	}
}

func TestAggregateReports_Multiple(t *testing.T) {
	reports := []*ctrf.Report{
		{
			Results: ctrf.Results{
				Tool: ctrf.Tool{Name: "jest", Version: "29.0"},
				Summary: ctrf.Summary{
					Tests: 2, Passed: 2, Failed: 0,
					Start: 1000, Stop: 1500,
				},
				Tests: []ctrf.Test{
					{Name: "test1", Status: "passed", Duration: 100},
					{Name: "test2", Status: "passed", Duration: 200},
				},
			},
		},
		{
			Results: ctrf.Results{
				Tool: ctrf.Tool{Name: "jest", Version: "29.0"},
				Summary: ctrf.Summary{
					Tests: 3, Passed: 1, Failed: 1, Skipped: 1,
					Start: 1000, Stop: 2000,
				},
				Tests: []ctrf.Test{
					{Name: "test3", Status: "passed", Duration: 150},
					{Name: "test4", Status: "failed", Duration: 300, Message: "assertion error"},
					{Name: "test5", Status: "skipped", Duration: 0},
				},
			},
		},
	}

	result := AggregateReports(reports)

	if result.Results.Summary.Tests != 5 {
		t.Errorf("tests = %d, want 5", result.Results.Summary.Tests)
	}
	if result.Results.Summary.Passed != 3 {
		t.Errorf("passed = %d, want 3", result.Results.Summary.Passed)
	}
	if result.Results.Summary.Failed != 1 {
		t.Errorf("failed = %d, want 1", result.Results.Summary.Failed)
	}
	if result.Results.Summary.Skipped != 1 {
		t.Errorf("skipped = %d, want 1", result.Results.Summary.Skipped)
	}
	if len(result.Results.Tests) != 5 {
		t.Errorf("test count = %d, want 5", len(result.Results.Tests))
	}
	// Start should be earliest, Stop should be latest
	if result.Results.Summary.Start != 1000 {
		t.Errorf("start = %d, want 1000", result.Results.Summary.Start)
	}
	if result.Results.Summary.Stop != 2000 {
		t.Errorf("stop = %d, want 2000", result.Results.Summary.Stop)
	}
}

func TestAggregateReports_DifferentTools(t *testing.T) {
	reports := []*ctrf.Report{
		{
			Results: ctrf.Results{
				Tool:    ctrf.Tool{Name: "jest"},
				Summary: ctrf.Summary{Tests: 1, Passed: 1},
				Tests:   []ctrf.Test{{Name: "a", Status: "passed"}},
			},
		},
		{
			Results: ctrf.Results{
				Tool:    ctrf.Tool{Name: "vitest"},
				Summary: ctrf.Summary{Tests: 1, Passed: 1},
				Tests:   []ctrf.Test{{Name: "b", Status: "passed"}},
			},
		},
	}

	result := AggregateReports(reports)
	// Should use the first report's tool name
	if result.Results.Tool.Name != "jest" {
		t.Errorf("tool = %q, want %q", result.Results.Tool.Name, "jest")
	}
	if result.Results.Summary.Tests != 2 {
		t.Errorf("tests = %d, want 2", result.Results.Summary.Tests)
	}
}

func TestWorkerPoolStatus(t *testing.T) {
	pool := &PoolStatus{
		ExecutionID: "exec-1",
		Workers: []WorkerStatus{
			{WorkerIndex: 0, Status: "completed"},
			{WorkerIndex: 1, Status: "running"},
			{WorkerIndex: 2, Status: "pending"},
		},
	}

	if pool.IsComplete() {
		t.Error("pool should not be complete")
	}
	if pool.CompletedCount() != 1 {
		t.Errorf("completed = %d, want 1", pool.CompletedCount())
	}
	if pool.HasFailures() {
		t.Error("pool should not have failures")
	}

	// Mark all done
	pool.Workers[1].Status = "completed"
	pool.Workers[2].Status = "completed"
	if !pool.IsComplete() {
		t.Error("pool should be complete")
	}
}

func TestWorkerPoolStatus_Failures(t *testing.T) {
	pool := &PoolStatus{
		ExecutionID: "exec-1",
		Workers: []WorkerStatus{
			{WorkerIndex: 0, Status: "completed"},
			{WorkerIndex: 1, Status: "failed"},
			{WorkerIndex: 2, Status: "completed"},
		},
	}

	if !pool.IsComplete() {
		t.Error("pool with failures should be complete")
	}
	if !pool.HasFailures() {
		t.Error("pool should have failures")
	}
	if pool.FailedCount() != 1 {
		t.Errorf("failed = %d, want 1", pool.FailedCount())
	}
}

func TestWorkerPoolStatus_OverallStatus(t *testing.T) {
	tests := []struct {
		name     string
		statuses []string
		want     string
	}{
		{"all pending", []string{"pending", "pending"}, "pending"},
		{"some running", []string{"running", "pending"}, "running"},
		{"all completed", []string{"completed", "completed"}, "completed"},
		{"has failure", []string{"completed", "failed"}, "failed"},
		{"has cancelled", []string{"completed", "cancelled"}, "cancelled"},
		{"mixed running", []string{"completed", "running", "pending"}, "running"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var workers []WorkerStatus
			for i, s := range tt.statuses {
				workers = append(workers, WorkerStatus{WorkerIndex: i, Status: s})
			}
			pool := &PoolStatus{Workers: workers}
			if got := pool.OverallStatus(); got != tt.want {
				t.Errorf("OverallStatus() = %q, want %q", got, tt.want)
			}
		})
	}
}
