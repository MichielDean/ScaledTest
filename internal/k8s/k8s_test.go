package k8s

import (
	"context"
	"os"
	"testing"
	"time"
)

type testJobStatusGetter struct {
	Fn func(ctx context.Context, jobName string) (*JobStatus, error)
}

func (t *testJobStatusGetter) GetJobStatus(ctx context.Context, jobName string) (*JobStatus, error) {
	return t.Fn(ctx, jobName)
}

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

func TestResourceDefaults_WhenFieldsSet(t *testing.T) {
	cfg := JobConfig{
		CPURequest:    "500m",
		CPULimit:      "1000m",
		MemoryRequest: "256Mi",
		MemoryLimit:   "1Gi",
	}
	cpuReq, cpuLim, memReq, memLim := cfg.ResourceDefaults()
	if cpuReq != "500m" {
		t.Errorf("CPURequest = %q, want %q", cpuReq, "500m")
	}
	if cpuLim != "1000m" {
		t.Errorf("CPULimit = %q, want %q", cpuLim, "1000m")
	}
	if memReq != "256Mi" {
		t.Errorf("MemoryRequest = %q, want %q", memReq, "256Mi")
	}
	if memLim != "1Gi" {
		t.Errorf("MemoryLimit = %q, want %q", memLim, "1Gi")
	}
}

func TestResourceDefaults_WhenFieldsEmptyAndNoEnv(t *testing.T) {
	cfg := JobConfig{}
	cpuReq, cpuLim, memReq, memLim := cfg.ResourceDefaults()
	if cpuReq != defaultCPURequest {
		t.Errorf("CPURequest = %q, want %q", cpuReq, defaultCPURequest)
	}
	if cpuLim != defaultCPULimit {
		t.Errorf("CPULimit = %q, want %q", cpuLim, defaultCPULimit)
	}
	if memReq != defaultMemoryRequest {
		t.Errorf("MemoryRequest = %q, want %q", memReq, defaultMemoryRequest)
	}
	if memLim != defaultMemoryLimit {
		t.Errorf("MemoryLimit = %q, want %q", memLim, defaultMemoryLimit)
	}
}

func TestResourceDefaults_WhenEnvOverrides(t *testing.T) {
	os.Setenv("ST_WORKER_CPU_REQUEST", "1")
	os.Setenv("ST_WORKER_CPU_LIMIT", "2")
	os.Setenv("ST_WORKER_MEMORY_REQUEST", "2Gi")
	os.Setenv("ST_WORKER_MEMORY_LIMIT", "4Gi")
	defer func() {
		os.Unsetenv("ST_WORKER_CPU_REQUEST")
		os.Unsetenv("ST_WORKER_CPU_LIMIT")
		os.Unsetenv("ST_WORKER_MEMORY_REQUEST")
		os.Unsetenv("ST_WORKER_MEMORY_LIMIT")
	}()

	cfg := JobConfig{}
	cpuReq, cpuLim, memReq, memLim := cfg.ResourceDefaults()
	if cpuReq != "1" {
		t.Errorf("CPURequest = %q, want %q", cpuReq, "1")
	}
	if cpuLim != "2" {
		t.Errorf("CPULimit = %q, want %q", cpuLim, "2")
	}
	if memReq != "2Gi" {
		t.Errorf("MemoryRequest = %q, want %q", memReq, "2Gi")
	}
	if memLim != "4Gi" {
		t.Errorf("MemoryLimit = %q, want %q", memLim, "4Gi")
	}
}

func TestResourceDefaults_WhenConfigOverridesEnv(t *testing.T) {
	os.Setenv("ST_WORKER_CPU_REQUEST", "1")
	defer os.Unsetenv("ST_WORKER_CPU_REQUEST")

	cfg := JobConfig{CPURequest: "200m"}
	cpuReq, _, _, _ := cfg.ResourceDefaults()
	if cpuReq != "200m" {
		t.Errorf("CPURequest = %q, want %q (config should override env)", cpuReq, "200m")
	}
}

func TestPtrHelpers(t *testing.T) {
	b := ptrBool(true)
	if *b != true {
		t.Errorf("ptrBool(true) = %v", *b)
	}
	i64 := ptrInt64(42)
	if *i64 != 42 {
		t.Errorf("ptrInt64(42) = %v", *i64)
	}
	i32 := ptrInt32(7)
	if *i32 != 7 {
		t.Errorf("ptrInt32(7) = %v", *i32)
	}
}

func TestResourceQty(t *testing.T) {
	q := resourceQty("250m")
	if q.String() != "250m" {
		t.Errorf("resourceQty(\"250m\") = %q", q.String())
	}
	q = resourceQty("128Mi")
	if q.String() != "128Mi" {
		t.Errorf("resourceQty(\"128Mi\") = %q", q.String())
	}
}

func TestJobConfig_WorkerTokenSecret_Field(t *testing.T) {
	cfg := JobConfig{
		Name:              "exec-secret",
		Image:             "scaledtest/worker:latest",
		Command:           "npm test",
		ExecutionID:       "exec-secret",
		WorkerToken:       "secret-token",
		WorkerTokenSecret: "pre-existing-secret",
		APIBaseURL:        "http://api:8080",
	}
	if cfg.WorkerTokenSecret != "pre-existing-secret" {
		t.Errorf("WorkerTokenSecret = %q, want %q", cfg.WorkerTokenSecret, "pre-existing-secret")
	}
}

func TestReconcileOnce_WhenJobFinished(t *testing.T) {
	jobName := "st-exec-orphan1"
	var markedID string
	var markedMsg string

	getter := &testJobStatusGetter{
		Fn: func(ctx context.Context, name string) (*JobStatus, error) {
			return &JobStatus{FailedCondition: true, Failed: 1, FailureMessage: "OOMKilled"}, nil
		},
	}

	reconciler := &ExecutionReconciler{
		JobStatusGetter: getter,
		ListRunning: func(ctx context.Context) ([]RunningExecution, error) {
			return []RunningExecution{
				{ID: "orphan1", K8sJobName: &jobName},
			}, nil
		},
		MarkFailed: func(ctx context.Context, id, errorMsg string, now time.Time) error {
			markedID = id
			markedMsg = errorMsg
			return nil
		},
		OrphanTimeout:     defaultOrphanTimeout,
		ReconcileInterval: defaultReconcileInterval,
	}

	n, err := reconciler.ReconcileOnce(context.Background())
	if err != nil {
		t.Fatalf("ReconcileOnce() error = %v", err)
	}
	if n != 1 {
		t.Errorf("reconciled count = %d, want 1", n)
	}
	if markedID != "orphan1" {
		t.Errorf("marked ID = %q, want %q", markedID, "orphan1")
	}
	if markedMsg != "OOMKilled" {
		t.Errorf("marked message = %q, want %q", markedMsg, "OOMKilled")
	}
}

func TestReconcileOnce_WhenJobStillRunning(t *testing.T) {
	jobName := "st-exec-active1"
	called := false

	getter := &testJobStatusGetter{
		Fn: func(ctx context.Context, name string) (*JobStatus, error) {
			return &JobStatus{Active: 1}, nil
		},
	}

	reconciler := &ExecutionReconciler{
		JobStatusGetter: getter,
		ListRunning: func(ctx context.Context) ([]RunningExecution, error) {
			return []RunningExecution{
				{ID: "active1", K8sJobName: &jobName},
			}, nil
		},
		MarkFailed: func(ctx context.Context, id, errorMsg string, now time.Time) error {
			called = true
			return nil
		},
		OrphanTimeout:     defaultOrphanTimeout,
		ReconcileInterval: defaultReconcileInterval,
	}

	n, err := reconciler.ReconcileOnce(context.Background())
	if err != nil {
		t.Fatalf("ReconcileOnce() error = %v", err)
	}
	if n != 0 {
		t.Errorf("reconciled count = %d, want 0", n)
	}
	if called {
		t.Error("MarkFailed should not have been called for active job")
	}
}

func TestReconcileOnce_WhenNoK8sJobName(t *testing.T) {
	reconciler := &ExecutionReconciler{
		JobStatusGetter: &testJobStatusGetter{},
		ListRunning: func(ctx context.Context) ([]RunningExecution, error) {
			return []RunningExecution{
				{ID: "nojob", K8sJobName: nil},
			}, nil
		},
		MarkFailed: func(ctx context.Context, id, errorMsg string, now time.Time) error {
			t.Error("MarkFailed should not be called for execution without K8s job")
			return nil
		},
		OrphanTimeout:     defaultOrphanTimeout,
		ReconcileInterval: defaultReconcileInterval,
	}

	n, err := reconciler.ReconcileOnce(context.Background())
	if err != nil {
		t.Fatalf("ReconcileOnce() error = %v", err)
	}
	if n != 0 {
		t.Errorf("reconciled count = %d, want 0", n)
	}
}

func TestReconcileOnce_WhenGetJobStatusFails(t *testing.T) {
	jobName := "st-exec-err1"
	called := false

	getter := &testJobStatusGetter{
		Fn: func(ctx context.Context, name string) (*JobStatus, error) {
			return nil, context.DeadlineExceeded
		},
	}

	reconciler := &ExecutionReconciler{
		JobStatusGetter: getter,
		ListRunning: func(ctx context.Context) ([]RunningExecution, error) {
			return []RunningExecution{
				{ID: "err1", K8sJobName: &jobName},
			}, nil
		},
		MarkFailed: func(ctx context.Context, id, errorMsg string, now time.Time) error {
			called = true
			return nil
		},
		OrphanTimeout:     defaultOrphanTimeout,
		ReconcileInterval: defaultReconcileInterval,
	}

	n, err := reconciler.ReconcileOnce(context.Background())
	if err != nil {
		t.Fatalf("ReconcileOnce() error = %v", err)
	}
	if n != 0 {
		t.Errorf("reconciled count = %d, want 0", n)
	}
	if called {
		t.Error("MarkFailed should not be called when GetJobStatus fails")
	}
}

func TestReconcileOnce_WhenEmptyList(t *testing.T) {
	reconciler := &ExecutionReconciler{
		JobStatusGetter: &testJobStatusGetter{},
		ListRunning: func(ctx context.Context) ([]RunningExecution, error) {
			return nil, nil
		},
		MarkFailed: func(ctx context.Context, id, errorMsg string, now time.Time) error {
			t.Error("MarkFailed should not be called for empty list")
			return nil
		},
		OrphanTimeout:     defaultOrphanTimeout,
		ReconcileInterval: defaultReconcileInterval,
	}

	n, err := reconciler.ReconcileOnce(context.Background())
	if err != nil {
		t.Fatalf("ReconcileOnce() error = %v", err)
	}
	if n != 0 {
		t.Errorf("reconciled count = %d, want 0", n)
	}
}

func TestReconcileOnce_WhenMarkFailedFails(t *testing.T) {
	jobName := "st-exec-mf1"

	getter := &testJobStatusGetter{
		Fn: func(ctx context.Context, name string) (*JobStatus, error) {
			return &JobStatus{Completed: true, Succeeded: 1}, nil
		},
	}

	reconciler := &ExecutionReconciler{
		JobStatusGetter: getter,
		ListRunning: func(ctx context.Context) ([]RunningExecution, error) {
			return []RunningExecution{
				{ID: "mf1", K8sJobName: &jobName},
			}, nil
		},
		MarkFailed: func(ctx context.Context, id, errorMsg string, now time.Time) error {
			return context.DeadlineExceeded
		},
		OrphanTimeout:     defaultOrphanTimeout,
		ReconcileInterval: defaultReconcileInterval,
	}

	n, err := reconciler.ReconcileOnce(context.Background())
	if err != nil {
		t.Fatalf("ReconcileOnce() should not return error when MarkFailed fails, got %v", err)
	}
	if n != 0 {
		t.Errorf("reconciled count = %d, want 0 (MarkFailed failed)", n)
	}
}

func TestReconcileOnce_WhenListRunningFails(t *testing.T) {
	reconciler := &ExecutionReconciler{
		JobStatusGetter: &testJobStatusGetter{},
		ListRunning: func(ctx context.Context) ([]RunningExecution, error) {
			return nil, context.DeadlineExceeded
		},
		MarkFailed: func(ctx context.Context, id, errorMsg string, now time.Time) error {
			return nil
		},
		OrphanTimeout:     defaultOrphanTimeout,
		ReconcileInterval: defaultReconcileInterval,
	}

	_, err := reconciler.ReconcileOnce(context.Background())
	if err == nil {
		t.Fatal("ReconcileOnce() should return error when ListRunning fails")
	}
}

func TestReconcileOnce_DefaultErrorMessage(t *testing.T) {
	jobName := "st-exec-default1"
	var markedMsg string

	getter := &testJobStatusGetter{
		Fn: func(ctx context.Context, name string) (*JobStatus, error) {
			return &JobStatus{FailedCondition: true, Failed: 1}, nil
		},
	}

	reconciler := &ExecutionReconciler{
		JobStatusGetter: getter,
		ListRunning: func(ctx context.Context) ([]RunningExecution, error) {
			return []RunningExecution{
				{ID: "default1", K8sJobName: &jobName},
			}, nil
		},
		MarkFailed: func(ctx context.Context, id, errorMsg string, now time.Time) error {
			markedMsg = errorMsg
			return nil
		},
		OrphanTimeout:     defaultOrphanTimeout,
		ReconcileInterval: defaultReconcileInterval,
	}

	n, err := reconciler.ReconcileOnce(context.Background())
	if err != nil {
		t.Fatalf("ReconcileOnce() error = %v", err)
	}
	if n != 1 {
		t.Errorf("reconciled count = %d, want 1", n)
	}
	wantMsg := "execution orphaned: k8s job finished but worker did not report status"
	if markedMsg != wantMsg {
		t.Errorf("marked message = %q, want %q", markedMsg, wantMsg)
	}
}

func TestReconcileOnce_MultipleExecutions(t *testing.T) {
	job1 := "st-exec-multi1"
	job2 := "st-exec-multi2"
	job3 := "st-exec-multi3"
	var markedIDs []string

	getter := &testJobStatusGetter{
		Fn: func(ctx context.Context, name string) (*JobStatus, error) {
			switch name {
			case job1, job2:
				return &JobStatus{FailedCondition: true, Failed: 1}, nil
			case job3:
				return &JobStatus{Active: 1}, nil
			default:
				return &JobStatus{}, nil
			}
		},
	}

	reconciler := &ExecutionReconciler{
		JobStatusGetter: getter,
		ListRunning: func(ctx context.Context) ([]RunningExecution, error) {
			return []RunningExecution{
				{ID: "multi1", K8sJobName: &job1},
				{ID: "multi2", K8sJobName: &job2},
				{ID: "multi3", K8sJobName: &job3},
			}, nil
		},
		MarkFailed: func(ctx context.Context, id, errorMsg string, now time.Time) error {
			markedIDs = append(markedIDs, id)
			return nil
		},
		OrphanTimeout:     defaultOrphanTimeout,
		ReconcileInterval: defaultReconcileInterval,
	}

	n, err := reconciler.ReconcileOnce(context.Background())
	if err != nil {
		t.Fatalf("ReconcileOnce() error = %v", err)
	}
	if n != 2 {
		t.Errorf("reconciled count = %d, want 2", n)
	}
	if len(markedIDs) != 2 {
		t.Fatalf("marked count = %d, want 2", len(markedIDs))
	}
	if markedIDs[0] != "multi1" {
		t.Errorf("first marked ID = %q, want %q", markedIDs[0], "multi1")
	}
	if markedIDs[1] != "multi2" {
		t.Errorf("second marked ID = %q, want %q", markedIDs[1], "multi2")
	}
}

func TestNewExecutionReconciler_Defaults(t *testing.T) {
	r := NewExecutionReconciler(nil, nil, nil)
	if r.OrphanTimeout != defaultOrphanTimeout {
		t.Errorf("OrphanTimeout = %v, want %v", r.OrphanTimeout, defaultOrphanTimeout)
	}
	if r.ReconcileInterval != defaultReconcileInterval {
		t.Errorf("ReconcileInterval = %v, want %v", r.ReconcileInterval, defaultReconcileInterval)
	}
}

func TestNewExecutionReconciler_EnvOverrides(t *testing.T) {
	os.Setenv("ST_RECONCILE_ORPHAN_TIMEOUT", "10m")
	os.Setenv("ST_RECONCILE_INTERVAL", "30s")
	defer func() {
		os.Unsetenv("ST_RECONCILE_ORPHAN_TIMEOUT")
		os.Unsetenv("ST_RECONCILE_INTERVAL")
	}()

	r := NewExecutionReconciler(nil, nil, nil)
	if r.OrphanTimeout != 10*time.Minute {
		t.Errorf("OrphanTimeout = %v, want %v", r.OrphanTimeout, 10*time.Minute)
	}
	if r.ReconcileInterval != 30*time.Second {
		t.Errorf("ReconcileInterval = %v, want %v", r.ReconcileInterval, 30*time.Second)
	}
}
