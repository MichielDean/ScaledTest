package k8s

import (
	"context"
	"fmt"

	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"

	"github.com/rs/zerolog/log"
)

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
	Name        string            // Job name (typically execution ID)
	Image       string            // Worker container image
	Command     string            // Test command to run
	EnvVars     map[string]string // Additional environment variables
	WorkerToken string            // Auth token for worker to report back
	APIBaseURL  string            // Base URL of the ScaledTest API
	ExecutionID string            // Execution ID for result reporting
}

// CreateJob creates a Kubernetes Job for test execution.
func (c *Client) CreateJob(ctx context.Context, cfg JobConfig) (*batchv1.Job, error) {
	envVars := []corev1.EnvVar{
		{Name: "ST_WORKER_TOKEN", Value: cfg.WorkerToken},
		{Name: "ST_API_URL", Value: cfg.APIBaseURL},
		{Name: "ST_EXECUTION_ID", Value: cfg.ExecutionID},
		{Name: "ST_COMMAND", Value: cfg.Command},
	}

	for k, v := range cfg.EnvVars {
		envVars = append(envVars, corev1.EnvVar{Name: k, Value: v})
	}

	backoffLimit := int32(0) // No retries — fail fast
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
					RestartPolicy: corev1.RestartPolicyNever,
					Containers: []corev1.Container{
						{
							Name:  "worker",
							Image: cfg.Image,
							Env:   envVars,
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
