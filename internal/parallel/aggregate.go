package parallel

import (
	"github.com/scaledtest/scaledtest/internal/ctrf"
)

// AggregateReports merges multiple CTRF reports from parallel workers into a
// single unified report. Test results are concatenated, and summary counts are
// summed. The earliest start and latest stop timestamps are used.
func AggregateReports(reports []*ctrf.Report) *ctrf.Report {
	merged := &ctrf.Report{
		Results: ctrf.Results{
			Tests: make([]ctrf.Test, 0),
		},
	}

	if len(reports) == 0 {
		return merged
	}

	// Use the first report's tool info
	merged.Results.Tool = reports[0].Results.Tool

	var (
		minStart int64
		maxStop  int64
	)

	for i, r := range reports {
		// Use environment from first report that has it
		if merged.Results.Environment == nil && r.Results.Environment != nil {
			merged.Results.Environment = r.Results.Environment
		}

		merged.Results.Tests = append(merged.Results.Tests, r.Results.Tests...)
		merged.Results.Summary.Passed += r.Results.Summary.Passed
		merged.Results.Summary.Failed += r.Results.Summary.Failed
		merged.Results.Summary.Skipped += r.Results.Summary.Skipped
		merged.Results.Summary.Pending += r.Results.Summary.Pending
		merged.Results.Summary.Other += r.Results.Summary.Other

		// Track earliest start and latest stop
		if i == 0 || (r.Results.Summary.Start != 0 && r.Results.Summary.Start < minStart) {
			minStart = r.Results.Summary.Start
		}
		if r.Results.Summary.Stop > maxStop {
			maxStop = r.Results.Summary.Stop
		}
	}

	merged.Results.Summary.Tests = len(merged.Results.Tests)
	merged.Results.Summary.Start = minStart
	merged.Results.Summary.Stop = maxStop

	return merged
}

// WorkerStatus tracks the status of an individual worker in a pool.
type WorkerStatus struct {
	WorkerIndex int      `json:"worker_index"`
	Status      string   `json:"status"`
	K8sJobName  string   `json:"k8s_job_name,omitempty"`
	TestFiles   []string `json:"test_files,omitempty"`
	ErrorMsg    string   `json:"error_msg,omitempty"`
}

// PoolStatus tracks the overall status of a parallel worker pool.
type PoolStatus struct {
	ExecutionID string         `json:"execution_id"`
	Parallelism int            `json:"parallelism"`
	Strategy    string         `json:"split_strategy"`
	Workers     []WorkerStatus `json:"workers"`
}

// IsComplete returns true if all workers have finished (completed, failed, or cancelled).
func (p *PoolStatus) IsComplete() bool {
	for _, w := range p.Workers {
		if w.Status != "completed" && w.Status != "failed" && w.Status != "cancelled" {
			return false
		}
	}
	return true
}

// CompletedCount returns the number of workers that completed successfully.
func (p *PoolStatus) CompletedCount() int {
	count := 0
	for _, w := range p.Workers {
		if w.Status == "completed" {
			count++
		}
	}
	return count
}

// FailedCount returns the number of workers that failed.
func (p *PoolStatus) FailedCount() int {
	count := 0
	for _, w := range p.Workers {
		if w.Status == "failed" {
			count++
		}
	}
	return count
}

// HasFailures returns true if any worker has failed.
func (p *PoolStatus) HasFailures() bool {
	return p.FailedCount() > 0
}

// OverallStatus computes the aggregate status of the worker pool.
func (p *PoolStatus) OverallStatus() string {
	if len(p.Workers) == 0 {
		return "pending"
	}

	hasCancelled := false
	hasFailed := false
	hasRunning := false
	hasPending := false
	allCompleted := true

	for _, w := range p.Workers {
		switch w.Status {
		case "cancelled":
			hasCancelled = true
			allCompleted = false
		case "failed":
			hasFailed = true
		case "running":
			hasRunning = true
			allCompleted = false
		case "pending":
			hasPending = true
			allCompleted = false
		case "completed":
			// ok
		default:
			allCompleted = false
		}
	}

	if hasCancelled {
		return "cancelled"
	}
	if allCompleted && hasFailed {
		return "failed"
	}
	if allCompleted {
		return "completed"
	}
	if hasRunning {
		return "running"
	}
	if hasPending {
		return "pending"
	}
	return "running"
}
