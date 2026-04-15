package k8s

import (
	"context"
	"fmt"
	"os"
	"time"

	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"

	"github.com/rs/zerolog/log"
	"k8s.io/apimachinery/pkg/api/resource"
)

func ptrBool(v bool) *bool    { return &v }
func ptrInt64(v int64) *int64 { return &v }
func ptrInt32(v int32) *int32 { return &v }
func resourceQty(s string) (resource.Quantity, error) {
	q, err := resource.ParseQuantity(s)
	if err != nil {
		return resource.Quantity{}, fmt.Errorf("parse resource quantity %q: %w", s, err)
	}
	return q, nil
}

// Client wraps the Kubernetes clientset for test execution Job management.
type Client struct {
	clientset *kubernetes.Clientset
	namespace string
}

// NewClient creates a Kubernetes client, using in-cluster config or kubeconfig.
func NewClient(namespace string, inCluster bool, kubeconfig string) (*Client, error) {
	var config *rest.Config
	var err error

	if inCluster {
		config, err = rest.InClusterConfig()
	} else if kubeconfig != "" {
		config, err = clientcmd.BuildConfigFromFlags("", kubeconfig)
	} else {
		// Try default kubeconfig location
		loadingRules := clientcmd.NewDefaultClientConfigLoadingRules()
		configOverrides := &clientcmd.ConfigOverrides{}
		config, err = clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
			loadingRules, configOverrides).ClientConfig()
	}

	if err != nil {
		return nil, fmt.Errorf("create k8s config: %w", err)
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("create k8s clientset: %w", err)
	}

	log.Info().Str("namespace", namespace).Msg("kubernetes client initialized")

	return &Client{
		clientset: clientset,
		namespace: namespace,
	}, nil
}

// JobConfig defines the parameters for creating a test execution Job.
type JobConfig struct {
	Name              string            // Job name (typically execution ID)
	Image             string            // Worker container image
	Command           string            // Test command to run
	EnvVars           map[string]string // Additional environment variables
	WorkerToken       string            // Auth token for worker to report back (used to create Secret)
	WorkerTokenSecret string            // Name of existing K8s Secret holding ST_WORKER_TOKEN
	APIBaseURL        string            // Base URL of the ScaledTest API
	ExecutionID       string            // Execution ID for result reporting
	CPURequest        string            // Container CPU request (e.g. "250m"), defaults to env ST_WORKER_CPU_REQUEST
	CPULimit          string            // Container CPU limit (e.g. "500m"), defaults to env ST_WORKER_CPU_LIMIT
	MemoryRequest     string            // Container memory request (e.g. "128Mi"), defaults to env ST_WORKER_MEMORY_REQUEST
	MemoryLimit       string            // Container memory limit (e.g. "512Mi"), defaults to env ST_WORKER_MEMORY_LIMIT
}

const (
	defaultCPURequest    = "250m"
	defaultCPULimit      = "500m"
	defaultMemoryRequest = "128Mi"
	defaultMemoryLimit   = "512Mi"
)

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ResourceDefaults returns the effective resource values, falling back to env
// vars then built-in defaults.
func (cfg *JobConfig) ResourceDefaults() (cpuReq, cpuLim, memReq, memLim string) {
	cpuReq = cfg.CPURequest
	if cpuReq == "" {
		cpuReq = envOr("ST_WORKER_CPU_REQUEST", defaultCPURequest)
	}
	cpuLim = cfg.CPULimit
	if cpuLim == "" {
		cpuLim = envOr("ST_WORKER_CPU_LIMIT", defaultCPULimit)
	}
	memReq = cfg.MemoryRequest
	if memReq == "" {
		memReq = envOr("ST_WORKER_MEMORY_REQUEST", defaultMemoryRequest)
	}
	memLim = cfg.MemoryLimit
	if memLim == "" {
		memLim = envOr("ST_WORKER_MEMORY_LIMIT", defaultMemoryLimit)
	}
	return
}

// CreateJob creates a Kubernetes Job for test execution.
func (c *Client) CreateJob(ctx context.Context, cfg JobConfig) (*batchv1.Job, error) {
	var envVars []corev1.EnvVar

	secretName := cfg.WorkerTokenSecret
	if secretName == "" {
		secretName = "st-worker-token-" + cfg.ExecutionID
		secret := &corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{
				Name:      secretName,
				Namespace: c.namespace,
				Labels: map[string]string{
					"app.kubernetes.io/name":       "scaledtest-worker-token",
					"app.kubernetes.io/managed-by": "scaledtest",
					"scaledtest/execution-id":      cfg.ExecutionID,
				},
			},
			StringData: map[string]string{
				"ST_WORKER_TOKEN": cfg.WorkerToken,
			},
		}
		if _, err := c.clientset.CoreV1().Secrets(c.namespace).Create(ctx, secret, metav1.CreateOptions{}); err != nil {
			return nil, fmt.Errorf("create worker token secret: %w", err)
		}
		log.Info().Str("secret", secretName).Msg("worker token secret created")
	}

	envVars = append(envVars,
		corev1.EnvVar{
			Name: "ST_WORKER_TOKEN",
			ValueFrom: &corev1.EnvVarSource{
				SecretKeyRef: &corev1.SecretKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{Name: secretName},
					Key:                  "ST_WORKER_TOKEN",
				},
			},
		},
		corev1.EnvVar{Name: "ST_API_URL", Value: cfg.APIBaseURL},
		corev1.EnvVar{Name: "ST_EXECUTION_ID", Value: cfg.ExecutionID},
		corev1.EnvVar{Name: "ST_COMMAND", Value: cfg.Command},
	)

	for k, v := range cfg.EnvVars {
		envVars = append(envVars, corev1.EnvVar{Name: k, Value: v})
	}

	cpuReq, cpuLim, memReq, memLim := cfg.ResourceDefaults()

	cpuReqQty, err := resourceQty(cpuReq)
	if err != nil {
		return nil, fmt.Errorf("cpu request: %w", err)
	}
	cpuLimQty, err := resourceQty(cpuLim)
	if err != nil {
		return nil, fmt.Errorf("cpu limit: %w", err)
	}
	memReqQty, err := resourceQty(memReq)
	if err != nil {
		return nil, fmt.Errorf("memory request: %w", err)
	}
	memLimQty, err := resourceQty(memLim)
	if err != nil {
		return nil, fmt.Errorf("memory limit: %w", err)
	}

	containerSecurityContext := &corev1.SecurityContext{
		RunAsNonRoot:             ptrBool(true),
		RunAsUser:                ptrInt64(1000),
		ReadOnlyRootFilesystem:   ptrBool(true),
		AllowPrivilegeEscalation: ptrBool(false),
		Capabilities: &corev1.Capabilities{
			Drop: []corev1.Capability{"ALL"},
		},
	}

	podSecurityContext := &corev1.PodSecurityContext{
		RunAsNonRoot: ptrBool(true),
		RunAsUser:    ptrInt64(1000),
		FSGroup:      ptrInt64(1000),
		SeccompProfile: &corev1.SeccompProfile{
			Type: corev1.SeccompProfileTypeRuntimeDefault,
		},
	}

	backoffLimit := int32(0)
	ttlSeconds := int32(3600)

	job := &batchv1.Job{
		ObjectMeta: metav1.ObjectMeta{
			Name:      cfg.Name,
			Namespace: c.namespace,
			Labels: map[string]string{
				"app.kubernetes.io/name":       "scaledtest-worker",
				"app.kubernetes.io/managed-by": "scaledtest",
				"scaledtest/execution-id":      cfg.ExecutionID,
			},
		},
		Spec: batchv1.JobSpec{
			BackoffLimit:            &backoffLimit,
			TTLSecondsAfterFinished: &ttlSeconds,
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: map[string]string{
						"app.kubernetes.io/name":  "scaledtest-worker",
						"scaledtest/execution-id": cfg.ExecutionID,
					},
				},
				Spec: corev1.PodSpec{
					RestartPolicy:                corev1.RestartPolicyNever,
					SecurityContext:              podSecurityContext,
					AutomountServiceAccountToken: ptrBool(false),
					Containers: []corev1.Container{
						{
							Name:            "worker",
							Image:           cfg.Image,
							Env:             envVars,
							SecurityContext: containerSecurityContext,
							Resources: corev1.ResourceRequirements{
								Requests: corev1.ResourceList{
									corev1.ResourceCPU:    cpuReqQty,
									corev1.ResourceMemory: memReqQty,
								},
								Limits: corev1.ResourceList{
									corev1.ResourceCPU:    cpuLimQty,
									corev1.ResourceMemory: memLimQty,
								},
							},
						},
					},
				},
			},
		},
	}

	created, err := c.clientset.BatchV1().Jobs(c.namespace).Create(ctx, job, metav1.CreateOptions{})
	if err != nil {
		return nil, fmt.Errorf("create job: %w", err)
	}

	log.Info().
		Str("job", created.Name).
		Str("execution_id", cfg.ExecutionID).
		Msg("k8s job created")

	return created, nil
}

// DeleteJob deletes a Kubernetes Job and its pods (for cancellation).
func (c *Client) DeleteJob(ctx context.Context, jobName string) error {
	propagation := metav1.DeletePropagationForeground
	err := c.clientset.BatchV1().Jobs(c.namespace).Delete(ctx, jobName, metav1.DeleteOptions{
		PropagationPolicy: &propagation,
	})
	if err != nil {
		return fmt.Errorf("delete job: %w", err)
	}

	log.Info().Str("job", jobName).Msg("k8s job deleted")
	return nil
}

// DeleteSecret deletes a Kubernetes Secret (for cleanup after job completion).
func (c *Client) DeleteSecret(ctx context.Context, name string) error {
	err := c.clientset.CoreV1().Secrets(c.namespace).Delete(ctx, name, metav1.DeleteOptions{})
	if err != nil {
		return fmt.Errorf("delete secret: %w", err)
	}
	log.Info().Str("secret", name).Msg("k8s secret deleted")
	return nil
}

// GetJobStatus returns the current status of a Job.
func (c *Client) GetJobStatus(ctx context.Context, jobName string) (*JobStatus, error) {
	job, err := c.clientset.BatchV1().Jobs(c.namespace).Get(ctx, jobName, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("get job: %w", err)
	}

	status := &JobStatus{
		Active:    job.Status.Active,
		Succeeded: job.Status.Succeeded,
		Failed:    job.Status.Failed,
	}

	for _, cond := range job.Status.Conditions {
		if cond.Type == batchv1.JobComplete && cond.Status == corev1.ConditionTrue {
			status.Completed = true
		}
		if cond.Type == batchv1.JobFailed && cond.Status == corev1.ConditionTrue {
			status.FailedCondition = true
			status.FailureMessage = cond.Message
		}
	}

	return status, nil
}

// JobStatus is a simplified view of a K8s Job's current status.
type JobStatus struct {
	Active          int32
	Succeeded       int32
	Failed          int32
	Completed       bool
	FailedCondition bool
	FailureMessage  string
}

// IsFinished returns true if the job has completed (success or failure).
func (s *JobStatus) IsFinished() bool {
	return s.Completed || s.FailedCondition
}

// RunningExecution represents a test execution that is currently in 'running' state.
type RunningExecution struct {
	ID         string
	K8sJobName *string
	StartedAt  *time.Time
}

// JobStatusGetter abstracts K8s job status lookup for reconciliation.
type JobStatusGetter interface {
	GetJobStatus(ctx context.Context, jobName string) (*JobStatus, error)
}

// ExecutionReconciler marks orphaned running executions as failed when their
// K8s job has finished but the worker never reported status back.
type ExecutionReconciler struct {
	JobStatusGetter   JobStatusGetter
	SecretDeleter     SecretDeleter
	ListRunning       func(ctx context.Context) ([]RunningExecution, error)
	MarkFailed        func(ctx context.Context, id, errorMsg string, now time.Time) error
	OrphanTimeout     time.Duration
	ReconcileInterval time.Duration
}

// SecretDeleter abstracts K8s Secret deletion for cleanup after job completion.
type SecretDeleter interface {
	DeleteSecret(ctx context.Context, name string) error
}

const (
	defaultOrphanTimeout     = 5 * time.Minute
	defaultReconcileInterval = 60 * time.Second
)

// NewExecutionReconciler creates a reconciler with sensible defaults.
func NewExecutionReconciler(k8sClient JobStatusGetter, secretDeleter SecretDeleter, listRunning func(ctx context.Context) ([]RunningExecution, error), markFailed func(ctx context.Context, id, errorMsg string, now time.Time) error) *ExecutionReconciler {
	return &ExecutionReconciler{
		JobStatusGetter:   k8sClient,
		SecretDeleter:     secretDeleter,
		ListRunning:       listRunning,
		MarkFailed:        markFailed,
		OrphanTimeout:     envOrDuration("ST_RECONCILE_ORPHAN_TIMEOUT", defaultOrphanTimeout),
		ReconcileInterval: envOrDuration("ST_RECONCILE_INTERVAL", defaultReconcileInterval),
	}
}

func envOrDuration(key string, fallback time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return fallback
}

// ReconcileOnce performs a single reconciliation pass over running executions.
// It handles two cases:
//  1. Executions with a K8s job name whose job has finished — marks them failed
//     and cleans up the associated worker token Secret.
//  2. Executions without a K8s job name that have been running longer than
//     OrphanTimeout — marks them failed (the job was never created).
//  3. Executions with a K8s job name but still within OrphanTimeout of their
//     start time — skipped to give recently-started jobs a grace period.
func (r *ExecutionReconciler) ReconcileOnce(ctx context.Context) (reconciled int, err error) {
	executions, err := r.ListRunning(ctx)
	if err != nil {
		return 0, fmt.Errorf("list running executions: %w", err)
	}

	now := time.Now()
	for _, exec := range executions {
		if exec.K8sJobName == nil || *exec.K8sJobName == "" {
			if exec.StartedAt != nil && now.Sub(*exec.StartedAt) > r.OrphanTimeout {
				errMsg := "execution orphaned: no k8s job assigned and running beyond timeout"
				if markErr := r.MarkFailed(ctx, exec.ID, errMsg, now); markErr != nil {
					log.Error().Err(markErr).Str("execution_id", exec.ID).Msg("reconcile: failed to mark execution failed")
					continue
				}
				log.Info().
					Str("execution_id", exec.ID).
					Msg("reconcile: marked orphaned execution (no k8s job) as failed")
				reconciled++
			}
			continue
		}

		if exec.StartedAt != nil && now.Sub(*exec.StartedAt) < r.OrphanTimeout {
			continue
		}

		jobStatus, jobErr := r.JobStatusGetter.GetJobStatus(ctx, *exec.K8sJobName)
		if jobErr != nil {
			log.Warn().Err(jobErr).Str("job", *exec.K8sJobName).Msg("reconcile: failed to get job status")
			continue
		}

		if !jobStatus.IsFinished() {
			continue
		}

		errMsg := "execution orphaned: k8s job finished but worker did not report status"
		if jobStatus.FailureMessage != "" {
			errMsg = jobStatus.FailureMessage
		}

		if markErr := r.MarkFailed(ctx, exec.ID, errMsg, now); markErr != nil {
			log.Error().Err(markErr).Str("execution_id", exec.ID).Msg("reconcile: failed to mark execution failed")
			continue
		}

		log.Info().
			Str("execution_id", exec.ID).
			Str("job", *exec.K8sJobName).
			Str("failure", errMsg).
			Msg("reconcile: marked orphaned execution as failed")

		if r.SecretDeleter != nil {
			secretName := "st-worker-token-" + exec.ID
			if delErr := r.SecretDeleter.DeleteSecret(ctx, secretName); delErr != nil {
				log.Warn().Err(delErr).Str("secret", secretName).Msg("reconcile: failed to delete worker token secret")
			}
		}

		reconciled++
	}

	return reconciled, nil
}

// Start runs the reconciliation loop at the configured interval until ctx is cancelled.
func (r *ExecutionReconciler) Start(ctx context.Context) {
	ticker := time.NewTicker(r.ReconcileInterval)
	defer ticker.Stop()

	log.Info().
		Dur("interval", r.ReconcileInterval).
		Dur("orphan_timeout", r.OrphanTimeout).
		Msg("execution reconciler started")

	for {
		select {
		case <-ctx.Done():
			log.Info().Msg("execution reconciler stopped")
			return
		case <-ticker.C:
			n, err := r.ReconcileOnce(ctx)
			if err != nil {
				log.Error().Err(err).Msg("reconcile pass failed")
			} else if n > 0 {
				log.Info().Int("reconciled", n).Msg("reconcile pass completed")
			}
		}
	}
}
