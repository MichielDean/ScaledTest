package k8s

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
)

type testJobStatusGetter struct {
	Fn func(ctx context.Context, jobName string) (*JobStatus, error)
}

func (t *testJobStatusGetter) GetJobStatus(ctx context.Context, jobName string) (*JobStatus, error) {
	return t.Fn(ctx, jobName)
}

type testSecretDeleter struct {
	deleted []string
	err     error
}

func (t *testSecretDeleter) DeleteSecret(ctx context.Context, name string) error {
	t.deleted = append(t.deleted, name)
	return t.err
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
	q, err := resourceQty("250m")
	if err != nil {
		t.Fatalf("resourceQty(\"250m\") error = %v", err)
	}
	if q.String() != "250m" {
		t.Errorf("resourceQty(\"250m\") = %q", q.String())
	}
	q, err = resourceQty("128Mi")
	if err != nil {
		t.Fatalf("resourceQty(\"128Mi\") error = %v", err)
	}
	if q.String() != "128Mi" {
		t.Errorf("resourceQty(\"128Mi\") = %q", q.String())
	}
}

func TestResourceQty_InvalidInput(t *testing.T) {
	_, err := resourceQty("not-a-quantity")
	if err == nil {
		t.Error("resourceQty should return error for invalid input")
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
	secretName := WorkerTokenSecretPrefix + "orphan1"
	var markedID string
	var markedMsg string
	sd := &testSecretDeleter{}

	getter := &testJobStatusGetter{
		Fn: func(ctx context.Context, name string) (*JobStatus, error) {
			return &JobStatus{FailedCondition: true, Failed: 1, FailureMessage: "OOMKilled"}, nil
		},
	}

	startedAt := time.Now().Add(-10 * time.Minute)
	reconciler := &ExecutionReconciler{
		JobStatusGetter: getter,
		SecretDeleter:   sd,
		ListRunning: func(ctx context.Context) ([]RunningExecution, error) {
			return []RunningExecution{
				{ID: "orphan1", K8sJobName: &jobName, WorkerTokenSecret: &secretName, StartedAt: &startedAt},
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
	if len(sd.deleted) != 1 || sd.deleted[0] != "st-worker-token-orphan1" {
		t.Errorf("secret deletion = %v, want [st-worker-token-orphan1]", sd.deleted)
	}
}

func TestReconcileOnce_WhenJobStillRunning(t *testing.T) {
	jobName := "st-exec-active1"
	called := false
	sd := &testSecretDeleter{}

	getter := &testJobStatusGetter{
		Fn: func(ctx context.Context, name string) (*JobStatus, error) {
			return &JobStatus{Active: 1}, nil
		},
	}

	startedAt := time.Now().Add(-10 * time.Minute)
	reconciler := &ExecutionReconciler{
		JobStatusGetter: getter,
		SecretDeleter:   sd,
		ListRunning: func(ctx context.Context) ([]RunningExecution, error) {
			return []RunningExecution{
				{ID: "active1", K8sJobName: &jobName, StartedAt: &startedAt},
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

func TestReconcileOnce_WhenNoK8sJobName_BeyondTimeout(t *testing.T) {
	var markedID string
	var markedMsg string
	sd := &testSecretDeleter{}

	startedAt := time.Now().Add(-10 * time.Minute)
	reconciler := &ExecutionReconciler{
		JobStatusGetter: &testJobStatusGetter{},
		SecretDeleter:   sd,
		ListRunning: func(ctx context.Context) ([]RunningExecution, error) {
			return []RunningExecution{
				{ID: "nojob", K8sJobName: nil, StartedAt: &startedAt},
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
	if markedID != "nojob" {
		t.Errorf("marked ID = %q, want %q", markedID, "nojob")
	}
	wantMsg := "execution orphaned: no k8s job assigned and running beyond timeout"
	if markedMsg != wantMsg {
		t.Errorf("marked message = %q, want %q", markedMsg, wantMsg)
	}
}

func TestReconcileOnce_WhenNoK8sJobName_WithinTimeout(t *testing.T) {
	sd := &testSecretDeleter{}

	startedAt := time.Now().Add(-30 * time.Second)
	reconciler := &ExecutionReconciler{
		JobStatusGetter: &testJobStatusGetter{},
		SecretDeleter:   sd,
		ListRunning: func(ctx context.Context) ([]RunningExecution, error) {
			return []RunningExecution{
				{ID: "nojob-new", K8sJobName: nil, StartedAt: &startedAt},
			}, nil
		},
		MarkFailed: func(ctx context.Context, id, errorMsg string, now time.Time) error {
			t.Error("MarkFailed should not be called for recently-started execution without K8s job")
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

func TestReconcileOnce_WhenNoK8sJobName_NilStartedAt(t *testing.T) {
	sd := &testSecretDeleter{}

	reconciler := &ExecutionReconciler{
		JobStatusGetter: &testJobStatusGetter{},
		SecretDeleter:   sd,
		ListRunning: func(ctx context.Context) ([]RunningExecution, error) {
			return []RunningExecution{
				{ID: "nojob-nil-start", K8sJobName: nil, StartedAt: nil},
			}, nil
		},
		MarkFailed: func(ctx context.Context, id, errorMsg string, now time.Time) error {
			t.Error("MarkFailed should not be called when StartedAt is nil and no K8s job")
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

func TestReconcileOnce_GracePeriod_SkipsRecentJob(t *testing.T) {
	jobName := "st-exec-recent1"
	sd := &testSecretDeleter{}

	getter := &testJobStatusGetter{
		Fn: func(ctx context.Context, name string) (*JobStatus, error) {
			return &JobStatus{FailedCondition: true, Failed: 1}, nil
		},
	}

	startedAt := time.Now().Add(-30 * time.Second)
	markCalled := false
	reconciler := &ExecutionReconciler{
		JobStatusGetter: getter,
		SecretDeleter:   sd,
		ListRunning: func(ctx context.Context) ([]RunningExecution, error) {
			return []RunningExecution{
				{ID: "recent1", K8sJobName: &jobName, StartedAt: &startedAt},
			}, nil
		},
		MarkFailed: func(ctx context.Context, id, errorMsg string, now time.Time) error {
			markCalled = true
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
		t.Errorf("reconciled count = %d, want 0 (within grace period)", n)
	}
	if markCalled {
		t.Error("MarkFailed should not be called for execution within grace period")
	}
}

func TestReconcileOnce_WhenGetJobStatusFails(t *testing.T) {
	jobName := "st-exec-err1"
	called := false
	sd := &testSecretDeleter{}
	secretName := WorkerTokenSecretPrefix + "err1"

	getter := &testJobStatusGetter{
		Fn: func(ctx context.Context, name string) (*JobStatus, error) {
			return nil, context.DeadlineExceeded
		},
	}

	startedAt := time.Now().Add(-10 * time.Minute)
	reconciler := &ExecutionReconciler{
		JobStatusGetter: getter,
		SecretDeleter:   sd,
		ListRunning: func(ctx context.Context) ([]RunningExecution, error) {
			return []RunningExecution{
				{ID: "err1", K8sJobName: &jobName, WorkerTokenSecret: &secretName, StartedAt: &startedAt},
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
	sd := &testSecretDeleter{}
	reconciler := &ExecutionReconciler{
		JobStatusGetter: &testJobStatusGetter{},
		SecretDeleter:   sd,
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
	sd := &testSecretDeleter{}
	secretName := WorkerTokenSecretPrefix + "mf1"

	getter := &testJobStatusGetter{
		Fn: func(ctx context.Context, name string) (*JobStatus, error) {
			return &JobStatus{Completed: true, Succeeded: 1}, nil
		},
	}

	startedAt := time.Now().Add(-10 * time.Minute)
	reconciler := &ExecutionReconciler{
		JobStatusGetter: getter,
		SecretDeleter:   sd,
		ListRunning: func(ctx context.Context) ([]RunningExecution, error) {
			return []RunningExecution{
				{ID: "mf1", K8sJobName: &jobName, WorkerTokenSecret: &secretName, StartedAt: &startedAt},
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
	sd := &testSecretDeleter{}
	reconciler := &ExecutionReconciler{
		JobStatusGetter: &testJobStatusGetter{},
		SecretDeleter:   sd,
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
	secretName := WorkerTokenSecretPrefix + "default1"
	sd := &testSecretDeleter{}

	getter := &testJobStatusGetter{
		Fn: func(ctx context.Context, name string) (*JobStatus, error) {
			return &JobStatus{FailedCondition: true, Failed: 1}, nil
		},
	}

	startedAt := time.Now().Add(-10 * time.Minute)
	reconciler := &ExecutionReconciler{
		JobStatusGetter: getter,
		SecretDeleter:   sd,
		ListRunning: func(ctx context.Context) ([]RunningExecution, error) {
			return []RunningExecution{
				{ID: "default1", K8sJobName: &jobName, WorkerTokenSecret: &secretName, StartedAt: &startedAt},
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
	secret1 := WorkerTokenSecretPrefix + "multi1"
	secret2 := WorkerTokenSecretPrefix + "multi2"
	var markedIDs []string
	sd := &testSecretDeleter{}

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

	startedAt := time.Now().Add(-10 * time.Minute)
	reconciler := &ExecutionReconciler{
		JobStatusGetter: getter,
		SecretDeleter:   sd,
		ListRunning: func(ctx context.Context) ([]RunningExecution, error) {
			return []RunningExecution{
				{ID: "multi1", K8sJobName: &job1, WorkerTokenSecret: &secret1, StartedAt: &startedAt},
				{ID: "multi2", K8sJobName: &job2, WorkerTokenSecret: &secret2, StartedAt: &startedAt},
				{ID: "multi3", K8sJobName: &job3, StartedAt: &startedAt},
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

func TestReconcileOnce_SecretCleanup(t *testing.T) {
	jobName := "st-exec-secret1"
	secretName := WorkerTokenSecretPrefix + "secret1"
	sd := &testSecretDeleter{}

	getter := &testJobStatusGetter{
		Fn: func(ctx context.Context, name string) (*JobStatus, error) {
			return &JobStatus{Completed: true, Succeeded: 1}, nil
		},
	}

	startedAt := time.Now().Add(-10 * time.Minute)
	reconciler := &ExecutionReconciler{
		JobStatusGetter: getter,
		SecretDeleter:   sd,
		ListRunning: func(ctx context.Context) ([]RunningExecution, error) {
			return []RunningExecution{
				{ID: "secret1", K8sJobName: &jobName, WorkerTokenSecret: &secretName, StartedAt: &startedAt},
			}, nil
		},
		MarkFailed: func(ctx context.Context, id, errorMsg string, now time.Time) error {
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
	if len(sd.deleted) != 1 {
		t.Fatalf("secret deletions = %d, want 1", len(sd.deleted))
	}
	if sd.deleted[0] != "st-worker-token-secret1" {
		t.Errorf("deleted secret = %q, want %q", sd.deleted[0], "st-worker-token-secret1")
	}
}

func TestReconcileOnce_SecretCleanupError_DoesNotBlock(t *testing.T) {
	jobName := "st-exec-secerr"
	secretName := WorkerTokenSecretPrefix + "secerr"
	sd := &testSecretDeleter{err: context.DeadlineExceeded}
	var markedID string

	getter := &testJobStatusGetter{
		Fn: func(ctx context.Context, name string) (*JobStatus, error) {
			return &JobStatus{FailedCondition: true, Failed: 1}, nil
		},
	}

	startedAt := time.Now().Add(-10 * time.Minute)
	reconciler := &ExecutionReconciler{
		JobStatusGetter: getter,
		SecretDeleter:   sd,
		ListRunning: func(ctx context.Context) ([]RunningExecution, error) {
			return []RunningExecution{
				{ID: "secerr", K8sJobName: &jobName, WorkerTokenSecret: &secretName, StartedAt: &startedAt},
			}, nil
		},
		MarkFailed: func(ctx context.Context, id, errorMsg string, now time.Time) error {
			markedID = id
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
		t.Errorf("reconciled count = %d, want 1 (secret cleanup failure should not block)", n)
	}
	if markedID != "secerr" {
		t.Errorf("marked ID = %q, want %q", markedID, "secerr")
	}
}

func TestNewExecutionReconciler_Defaults(t *testing.T) {
	r := NewExecutionReconciler(nil, nil, nil, nil)
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

	r := NewExecutionReconciler(nil, nil, nil, nil)
	if r.OrphanTimeout != 10*time.Minute {
		t.Errorf("OrphanTimeout = %v, want %v", r.OrphanTimeout, 10*time.Minute)
	}
	if r.ReconcileInterval != 30*time.Second {
		t.Errorf("ReconcileInterval = %v, want %v", r.ReconcileInterval, 30*time.Second)
	}
}

func TestEnvOrDuration_InvalidInput(t *testing.T) {
	os.Setenv("ST_RECONCILE_INTERVAL", "not-a-duration")
	defer os.Unsetenv("ST_RECONCILE_INTERVAL")

	result := envOrDuration("ST_RECONCILE_INTERVAL", defaultReconcileInterval)
	if result != defaultReconcileInterval {
		t.Errorf("envOrDuration with invalid input = %v, want default %v", result, defaultReconcileInterval)
	}
}

func TestEnvOrDuration_ValidInput(t *testing.T) {
	os.Setenv("ST_RECONCILE_INTERVAL", "45s")
	defer os.Unsetenv("ST_RECONCILE_INTERVAL")

	result := envOrDuration("ST_RECONCILE_INTERVAL", defaultReconcileInterval)
	if result != 45*time.Second {
		t.Errorf("envOrDuration with valid input = %v, want %v", result, 45*time.Second)
	}
}

func TestEnvOrDuration_EmptyEnv(t *testing.T) {
	result := envOrDuration("ST_RECONCILE_INTERVAL_UNSET_XYZ", defaultReconcileInterval)
	if result != defaultReconcileInterval {
		t.Errorf("envOrDuration with empty env = %v, want default %v", result, defaultReconcileInterval)
	}
}

func TestWorkerTokenSecretPrefix(t *testing.T) {
	if WorkerTokenSecretPrefix != "st-worker-token-" {
		t.Errorf("WorkerTokenSecretPrefix = %q, want %q", WorkerTokenSecretPrefix, "st-worker-token-")
	}
}

func TestCreateJob_SecurityContextAndResources(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(&corev1.SecretList{})
	client := &Client{clientset: fakeClient, namespace: "test-ns"}

	cfg := JobConfig{
		Name:          "st-exec-testsec",
		Image:         "scaledtest/worker:latest",
		Command:       "npm test",
		ExecutionID:   "testsec",
		WorkerToken:   "secret-token-value",
		APIBaseURL:    "http://api:8080",
		CPURequest:    "250m",
		CPULimit:      "500m",
		MemoryRequest: "128Mi",
		MemoryLimit:   "512Mi",
	}

	result, err := client.CreateJob(context.Background(), cfg)
	if err != nil {
		t.Fatalf("CreateJob() error = %v", err)
	}
	if result.Job == nil {
		t.Fatal("CreateJob() returned nil Job")
	}

	job := result.Job

	if result.WorkerTokenSecret != "st-worker-token-testsec" {
		t.Errorf("WorkerTokenSecret = %q, want %q", result.WorkerTokenSecret, "st-worker-token-testsec")
	}
	if !result.AutoCreatedSecret {
		t.Error("AutoCreatedSecret = false, want true")
	}

	podSpec := job.Spec.Template.Spec
	container := podSpec.Containers[0]

	if podSpec.AutomountServiceAccountToken == nil || *podSpec.AutomountServiceAccountToken != false {
		t.Error("AutomountServiceAccountToken should be false")
	}

	if podSpec.SecurityContext == nil {
		t.Fatal("Pod SecurityContext is nil")
	}
	podSC := podSpec.SecurityContext
	if podSC.RunAsNonRoot == nil || !*podSC.RunAsNonRoot {
		t.Error("Pod RunAsNonRoot should be true")
	}
	if podSC.RunAsUser == nil || *podSC.RunAsUser != 1000 {
		t.Error("Pod RunAsUser should be 1000")
	}
	if podSC.FSGroup == nil || *podSC.FSGroup != 1000 {
		t.Error("Pod FSGroup should be 1000")
	}
	if podSC.SeccompProfile == nil || podSC.SeccompProfile.Type != corev1.SeccompProfileTypeRuntimeDefault {
		t.Error("Pod SeccompProfile should be RuntimeDefault")
	}

	if container.SecurityContext == nil {
		t.Fatal("Container SecurityContext is nil")
	}
	contSC := container.SecurityContext
	if contSC.RunAsNonRoot == nil || !*contSC.RunAsNonRoot {
		t.Error("Container RunAsNonRoot should be true")
	}
	if contSC.RunAsUser == nil || *contSC.RunAsUser != 1000 {
		t.Error("Container RunAsUser should be 1000")
	}
	if contSC.ReadOnlyRootFilesystem == nil || !*contSC.ReadOnlyRootFilesystem {
		t.Error("Container ReadOnlyRootFilesystem should be true")
	}
	if contSC.AllowPrivilegeEscalation == nil || *contSC.AllowPrivilegeEscalation != false {
		t.Error("Container AllowPrivilegeEscalation should be false")
	}
	if contSC.Capabilities == nil || len(contSC.Capabilities.Drop) != 1 || contSC.Capabilities.Drop[0] != "ALL" {
		t.Error("Container Capabilities.Drop should be [ALL]")
	}

	cpuReq := container.Resources.Requests[corev1.ResourceCPU]
	if cpuReq.String() != "250m" {
		t.Errorf("CPU request = %q, want %q", cpuReq.String(), "250m")
	}
	cpuLim := container.Resources.Limits[corev1.ResourceCPU]
	if cpuLim.String() != "500m" {
		t.Errorf("CPU limit = %q, want %q", cpuLim.String(), "500m")
	}
	memReq := container.Resources.Requests[corev1.ResourceMemory]
	if memReq.String() != "128Mi" {
		t.Errorf("Memory request = %q, want %q", memReq.String(), "128Mi")
	}
	memLim := container.Resources.Limits[corev1.ResourceMemory]
	if memLim.String() != "512Mi" {
		t.Errorf("Memory limit = %q, want %q", memLim.String(), "512Mi")
	}

	foundToken := false
	for _, env := range container.Env {
		if env.Name == "ST_WORKER_TOKEN" {
			foundToken = true
			if env.ValueFrom == nil || env.ValueFrom.SecretKeyRef == nil {
				t.Error("ST_WORKER_TOKEN should use SecretKeyRef")
			} else {
				if env.ValueFrom.SecretKeyRef.Name != "st-worker-token-testsec" {
					t.Errorf("ST_WORKER_TOKEN SecretKeyRef.Name = %q, want %q", env.ValueFrom.SecretKeyRef.Name, "st-worker-token-testsec")
				}
				if env.ValueFrom.SecretKeyRef.Key != "ST_WORKER_TOKEN" {
					t.Errorf("ST_WORKER_TOKEN SecretKeyRef.Key = %q, want %q", env.ValueFrom.SecretKeyRef.Key, "ST_WORKER_TOKEN")
				}
			}
			if env.Value != "" {
				t.Error("ST_WORKER_TOKEN should not have a plain Value when using SecretKeyRef")
			}
		}
	}
	if !foundToken {
		t.Error("ST_WORKER_TOKEN env var not found")
	}
}

func TestCreateJob_WithPreExistingSecret(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(&corev1.SecretList{})
	client := &Client{clientset: fakeClient, namespace: "test-ns"}

	cfg := JobConfig{
		Name:              "st-exec-presec",
		Image:             "scaledtest/worker:latest",
		Command:           "npm test",
		ExecutionID:       "presec",
		WorkerToken:       "secret-token-value",
		WorkerTokenSecret: "my-pre-existing-secret",
		APIBaseURL:        "http://api:8080",
	}

	result, err := client.CreateJob(context.Background(), cfg)
	if err != nil {
		t.Fatalf("CreateJob() error = %v", err)
	}

	if result.WorkerTokenSecret != "my-pre-existing-secret" {
		t.Errorf("WorkerTokenSecret = %q, want %q", result.WorkerTokenSecret, "my-pre-existing-secret")
	}
	if result.AutoCreatedSecret {
		t.Error("AutoCreatedSecret = true for pre-existing secret, want false")
	}

	container := result.Job.Spec.Template.Spec.Containers[0]
	foundToken := false
	for _, env := range container.Env {
		if env.Name == "ST_WORKER_TOKEN" {
			foundToken = true
			if env.ValueFrom == nil || env.ValueFrom.SecretKeyRef == nil {
				t.Error("ST_WORKER_TOKEN should use SecretKeyRef")
			} else if env.ValueFrom.SecretKeyRef.Name != "my-pre-existing-secret" {
				t.Errorf("ST_WORKER_TOKEN SecretKeyRef.Name = %q, want %q", env.ValueFrom.SecretKeyRef.Name, "my-pre-existing-secret")
			}
		}
	}
	if !foundToken {
		t.Error("ST_WORKER_TOKEN env var not found")
	}

	secrets, err := fakeClient.CoreV1().Secrets("test-ns").List(context.Background(), metav1.ListOptions{})
	if err != nil {
		t.Fatalf("list secrets: %v", err)
	}
	if len(secrets.Items) != 0 {
		t.Errorf("expected 0 auto-created secrets, got %d", len(secrets.Items))
	}
}

func TestCreateJob_SecretCleanedUpOnJobFailure(t *testing.T) {
	fakeClient := fake.NewSimpleClientset()
	fakeClient.PrependReactor("create", "jobs", func(action k8stesting.Action) (handled bool, ret runtime.Object, err error) {
		return true, nil, fmt.Errorf("job creation failed")
	})

	cfg := JobConfig{
		Name:        "st-exec-failsec",
		Image:       "scaledtest/worker:latest",
		Command:     "npm test",
		ExecutionID: "failsec",
		WorkerToken: "secret-token-value",
		APIBaseURL:  "http://api:8080",
	}

	client := &Client{clientset: fakeClient, namespace: "test-ns"}

	result, err := client.CreateJob(context.Background(), cfg)
	if err == nil {
		t.Fatal("CreateJob() should fail when Job creation fails, but it didn't")
	}
	if result != nil {
		t.Errorf("CreateJob() result should be nil on failure, got %+v", result)
	}

	secrets, err := fakeClient.CoreV1().Secrets("test-ns").List(context.Background(), metav1.ListOptions{})
	if err != nil {
		t.Fatalf("list secrets: %v", err)
	}
	if len(secrets.Items) != 0 {
		t.Errorf("auto-created Secret should be cleaned up on Job creation failure, but found %d secrets", len(secrets.Items))
	}
}

func TestReconcileOnce_SkipsPreExistingSecret(t *testing.T) {
	jobName := "st-exec-presec1"
	preExistingSecret := "my-team-secret"
	sd := &testSecretDeleter{}
	var markedIDs []string

	getter := &testJobStatusGetter{
		Fn: func(ctx context.Context, name string) (*JobStatus, error) {
			return &JobStatus{FailedCondition: true, Failed: 1}, nil
		},
	}

	startedAt := time.Now().Add(-10 * time.Minute)
	reconciler := &ExecutionReconciler{
		JobStatusGetter: getter,
		SecretDeleter:   sd,
		ListRunning: func(ctx context.Context) ([]RunningExecution, error) {
			return []RunningExecution{
				{ID: "presec1", K8sJobName: &jobName, WorkerTokenSecret: &preExistingSecret, StartedAt: &startedAt},
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
	if n != 1 {
		t.Errorf("reconciled count = %d, want 1", n)
	}
	if len(markedIDs) != 1 || markedIDs[0] != "presec1" {
		t.Errorf("marked IDs = %v, want [presec1]", markedIDs)
	}
	if len(sd.deleted) != 0 {
		t.Errorf("pre-existing secret should NOT be deleted, but got deletions: %v", sd.deleted)
	}
}

func TestReconcileOnce_NilWorkerTokenSecret_SkipsDeletion(t *testing.T) {
	jobName := "st-exec-nosec1"
	sd := &testSecretDeleter{}
	var markedIDs []string

	getter := &testJobStatusGetter{
		Fn: func(ctx context.Context, name string) (*JobStatus, error) {
			return &JobStatus{FailedCondition: true, Failed: 1}, nil
		},
	}

	startedAt := time.Now().Add(-10 * time.Minute)
	reconciler := &ExecutionReconciler{
		JobStatusGetter: getter,
		SecretDeleter:   sd,
		ListRunning: func(ctx context.Context) ([]RunningExecution, error) {
			return []RunningExecution{
				{ID: "nosec1", K8sJobName: &jobName, WorkerTokenSecret: nil, StartedAt: &startedAt},
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
	if n != 1 {
		t.Errorf("reconciled count = %d, want 1", n)
	}
	if len(sd.deleted) != 0 {
		t.Errorf("nil WorkerTokenSecret should not trigger deletion, but got: %v", sd.deleted)
	}
}
