package models

import "time"

// TestJob represents a Kubernetes Job execution for running tests
type TestJob struct {
	ID                 string        `json:"id"`
	TestImageID        string        `json:"test_image_id"`
	CTRFReportID       *string       `json:"ctrf_report_id,omitempty"`
	TestRunID          *string       `json:"test_run_id,omitempty"`
	K8sJobName         string        `json:"k8s_job_name"`
	K8sNamespace       string        `json:"k8s_namespace"`
	TestID             string        `json:"test_id"`
	JobIndex           int           `json:"job_index"`
	Status             TestJobStatus `json:"status"`
	ExitCode           *int          `json:"exit_code,omitempty"`
	PodName            *string       `json:"pod_name,omitempty"`
	PodLogsPath        *string       `json:"pod_logs_path,omitempty"`
	ArtifactVolumePath *string       `json:"artifact_volume_path,omitempty"`
	Config             map[string]any `json:"config,omitempty"`
	StartedAt          *time.Time    `json:"started_at,omitempty"`
	CompletedAt        *time.Time    `json:"completed_at,omitempty"`
	DurationMs         *int64        `json:"duration_ms,omitempty"`
	ProjectID          *string       `json:"project_id,omitempty"`
	CreatedBy          string        `json:"created_by"`
	CreatedAt          time.Time     `json:"created_at"`
	UpdatedAt          time.Time     `json:"updated_at"`
}

// TestJobStatus represents the status of a test job
type TestJobStatus string

const (
	TestJobStatusPending   TestJobStatus = "pending"
	TestJobStatusRunning   TestJobStatus = "running"
	TestJobStatusSucceeded TestJobStatus = "succeeded"
	TestJobStatusFailed    TestJobStatus = "failed"
	TestJobStatusCancelled TestJobStatus = "cancelled"
)

// TestArtifact represents a file generated during test execution
type TestArtifact struct {
	ID           string       `json:"id"`
	TestJobID    string       `json:"test_job_id"`
	CTRFReportID *string      `json:"ctrf_report_id,omitempty"`
	CTRFTestID   *string      `json:"ctrf_test_id,omitempty"`
	ArtifactType ArtifactType `json:"artifact_type"`
	FilePath     string       `json:"file_path"`
	AbsolutePath string       `json:"absolute_path"`
	ContentType  *string      `json:"content_type,omitempty"`
	SizeBytes    *int64       `json:"size_bytes,omitempty"`
	Metadata     map[string]any `json:"metadata,omitempty"`
	CreatedAt    time.Time    `json:"created_at"`
}

// ArtifactType represents the type of test artifact
type ArtifactType string

const (
	ArtifactTypeScreenshot ArtifactType = "screenshot"
	ArtifactTypeVideo      ArtifactType = "video"
	ArtifactTypeLog        ArtifactType = "log"
	ArtifactTypeTrace      ArtifactType = "trace"
	ArtifactTypeReport     ArtifactType = "report"
	ArtifactTypeOther      ArtifactType = "other"
)

// JobStats contains aggregated job statistics
type JobStats struct {
	Pending   int `json:"pending"`
	Running   int `json:"running"`
	Succeeded int `json:"succeeded"`
	Failed    int `json:"failed"`
	Cancelled int `json:"cancelled"`
}
