package k8s

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"time"

	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

// ClusterCredentials contains the credentials needed to connect to a K8s cluster
type ClusterCredentials struct {
	APIServerURL      string
	Namespace         string
	AuthType          string // "token", "certificate", "kubeconfig"
	BearerToken       string
	ClientCertificate string // PEM encoded
	ClientKey         string // PEM encoded
	CACertificate     string // PEM encoded
	SkipTLSVerify     bool
	Kubeconfig        string // Full kubeconfig YAML
}

// JobManager handles Kubernetes Job operations
type JobManager struct {
	clientset *kubernetes.Clientset
	namespace string
}

// JobConfig contains configuration for creating a test execution Job
type JobConfig struct {
	Name                    string
	Image                   string
	TestIDs                 []string
	JobIDs                  []string   // Database IDs for each test job (maps 1:1 with TestIDs by index)
	ImagePullSecretName     string
	PVCName                 string
	Environment             map[string]string
	Resources               ResourceRequirements
	TimeoutSeconds          int32
	Parallelism             int32
	ServiceAccountName      string
	PlatformAPIURL          string
	JobAuthToken            string
	TestRunID               string // UUID for test run identification
	TTLSecondsAfterFinished *int32 // Automatic cleanup after job finishes (default: 3600 = 1 hour)
}

// ResourceRequirements specifies CPU and memory requests/limits
type ResourceRequirements struct {
	CPURequest    string
	CPULimit      string
	MemoryRequest string
	MemoryLimit   string
}

// JobStatus represents the current state of a Job
type JobStatus struct {
	Active    int32
	Succeeded int32
	Failed    int32
	Conditions []JobCondition
}

// JobCondition represents a Job condition
type JobCondition struct {
	Type               string
	Status             string
	LastTransitionTime time.Time
	Reason             string
	Message            string
}

// NewJobManager creates a new Kubernetes Job manager
// Attempts in-cluster config first, falls back to kubeconfig
func NewJobManager(namespace string) (*JobManager, error) {
	var config *rest.Config
	var err error

	// Try in-cluster config first (when running inside K8s)
	config, err = rest.InClusterConfig()
	if err != nil {
		// Fall back to kubeconfig (for local development)
		kubeconfigPath := clientcmd.RecommendedHomeFile
		config, err = clientcmd.BuildConfigFromFlags("", kubeconfigPath)
		if err != nil {
			return nil, fmt.Errorf("failed to load Kubernetes config: %w", err)
		}
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create Kubernetes clientset: %w", err)
	}

	return &JobManager{
		clientset: clientset,
		namespace: namespace,
	}, nil
}

// NewJobManagerFromCredentials creates a new Kubernetes Job manager using provided credentials
// This is used when cluster configuration is stored in the database
func NewJobManagerFromCredentials(creds ClusterCredentials) (*JobManager, error) {
	var config *rest.Config
	var err error

	namespace := creds.Namespace
	if namespace == "" {
		namespace = "default"
	}

	switch creds.AuthType {
	case "in-cluster":
		// Use in-cluster config (for when backend runs inside the target cluster)
		config, err = rest.InClusterConfig()
		if err != nil {
			return nil, fmt.Errorf("failed to get in-cluster config: %w", err)
		}

	case "kubeconfig":
		// Parse the kubeconfig YAML directly
		if creds.Kubeconfig == "" {
			return nil, fmt.Errorf("kubeconfig is empty")
		}
		config, err = clientcmd.RESTConfigFromKubeConfig([]byte(creds.Kubeconfig))
		if err != nil {
			return nil, fmt.Errorf("failed to parse kubeconfig: %w", err)
		}
		// Apply TLS skip setting if requested (e.g., for Docker Desktop with host.docker.internal)
		if creds.SkipTLSVerify {
			config.TLSClientConfig.Insecure = true
			config.TLSClientConfig.CAData = nil
			config.TLSClientConfig.CAFile = ""
		}

	case "token":
		// Use bearer token authentication
		if creds.APIServerURL == "" {
			return nil, fmt.Errorf("API server URL is required for token auth")
		}
		if creds.BearerToken == "" {
			return nil, fmt.Errorf("bearer token is required for token auth")
		}
		config = &rest.Config{
			Host:        creds.APIServerURL,
			BearerToken: creds.BearerToken,
			TLSClientConfig: rest.TLSClientConfig{
				Insecure: creds.SkipTLSVerify,
			},
		}
		if creds.CACertificate != "" && !creds.SkipTLSVerify {
			config.TLSClientConfig.CAData = []byte(creds.CACertificate)
		}

	case "certificate":
		// Use client certificate authentication
		if creds.APIServerURL == "" {
			return nil, fmt.Errorf("API server URL is required for certificate auth")
		}
		if creds.ClientCertificate == "" || creds.ClientKey == "" {
			return nil, fmt.Errorf("client certificate and key are required for certificate auth")
		}
		config = &rest.Config{
			Host: creds.APIServerURL,
			TLSClientConfig: rest.TLSClientConfig{
				CertData: []byte(creds.ClientCertificate),
				KeyData:  []byte(creds.ClientKey),
				Insecure: creds.SkipTLSVerify,
			},
		}
		if creds.CACertificate != "" && !creds.SkipTLSVerify {
			config.TLSClientConfig.CAData = []byte(creds.CACertificate)
		}

	default:
		return nil, fmt.Errorf("unsupported auth type: %s", creds.AuthType)
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create Kubernetes clientset: %w", err)
	}

	return &JobManager{
		clientset: clientset,
		namespace: namespace,
	}, nil
}

// TestConnection verifies connectivity to the Kubernetes cluster
func (jm *JobManager) TestConnection(ctx context.Context) error {
	_, err := jm.clientset.CoreV1().Namespaces().List(ctx, metav1.ListOptions{Limit: 1})
	if err != nil {
		return fmt.Errorf("failed to connect to Kubernetes cluster: %w", err)
	}
	return nil
}

// GetNamespace returns the namespace this JobManager operates in
func (jm *JobManager) GetNamespace() string {
	return jm.namespace
}

// CreateIndexedJob creates a Kubernetes Indexed Job for parallel test execution
// Each pod runs one test from the TestIDs list
func (jm *JobManager) CreateIndexedJob(ctx context.Context, config JobConfig) (*batchv1.Job, error) {
	testCount := int32(len(config.TestIDs))
	if testCount == 0 {
		return nil, fmt.Errorf("no test IDs provided")
	}

	// Determine parallelism (limit to test count)
	parallelism := config.Parallelism
	if parallelism == 0 || parallelism > testCount {
		parallelism = testCount
	}

	// Create environment variables for the pod
	// Note: These variable names must match what the container scripts expect
	envVars := []corev1.EnvVar{
		{
			Name:  "API_URL",
			Value: config.PlatformAPIURL,
		},
		{
			Name:  "PLATFORM_API_URL",  // Legacy, keeping for backward compatibility
			Value: config.PlatformAPIURL,
		},
		{
			Name:  "API_TOKEN",
			Value: config.JobAuthToken,
		},
		{
			Name:  "JOB_AUTH_TOKEN",  // Legacy, keeping for backward compatibility
			Value: config.JobAuthToken,
		},
		{
			Name:  "ARTIFACT_PATH",
			Value: "/artifacts",
		},
		{
			Name:  "TEST_RUN_ID",
			Value: config.TestRunID, // Use UUID for test run identification
		},
		{
			Name:  "PARALLELISM",
			Value: fmt.Sprintf("%d", config.Parallelism), // Playwright worker count for "all" tests
		},
	}

	// Add custom environment variables (includes BASE_URL from cluster config)
	for key, value := range config.Environment {
		envVars = append(envVars, corev1.EnvVar{
			Name:  key,
			Value: value,
		})
	}

	// Note: JOB_COMPLETION_INDEX is automatically provided by Kubernetes for indexed jobs
	// as an environment variable. No need to manually inject it via FieldRef.
	// See: https://kubernetes.io/docs/concepts/workloads/controllers/job/#completion-mode

	// Build command that uses index to select test and job ID
	// The entrypoint.sh script handles test execution when DISCOVERY_MODE is not set
	// It expects TEST_ID and TEST_JOB_ID to be set as environment variables
	// JOB_COMPLETION_INDEX is automatically provided by K8s for indexed jobs
	testIDsJSON := jm.serializeTestIDs(config.TestIDs)
	jobIDsJSON := jm.serializeTestIDs(config.JobIDs) // Reuse same serialization function
	
	command := []string{
		"/bin/sh",
		"-c",
		fmt.Sprintf(`export TEST_ID=$(echo '%s' | jq -r ".[${JOB_COMPLETION_INDEX}]"); export TEST_JOB_ID=$(echo '%s' | jq -r ".[${JOB_COMPLETION_INDEX}]"); /scripts/entrypoint.sh`, 
			testIDsJSON, jobIDsJSON),
	}

	// Define resource requirements
	resourceList := corev1.ResourceList{}
	resourceLimits := corev1.ResourceList{}
	if config.Resources.CPURequest != "" {
		resourceList[corev1.ResourceCPU] = parseQuantity(config.Resources.CPURequest)
	}
	if config.Resources.MemoryRequest != "" {
		resourceList[corev1.ResourceMemory] = parseQuantity(config.Resources.MemoryRequest)
	}
	if config.Resources.CPULimit != "" {
		resourceLimits[corev1.ResourceCPU] = parseQuantity(config.Resources.CPULimit)
	}
	if config.Resources.MemoryLimit != "" {
		resourceLimits[corev1.ResourceMemory] = parseQuantity(config.Resources.MemoryLimit)
	}

	// Create Job specification
	backoffLimit := int32(0) // Don't retry failed tests
	completionMode := batchv1.IndexedCompletion
	activeDeadlineSeconds := int64(config.TimeoutSeconds)
	if activeDeadlineSeconds == 0 {
		activeDeadlineSeconds = 3600 // Default 1 hour
	}

	// Set TTL for automatic cleanup (default: 1 hour after completion)
	ttlSecondsAfterFinished := int32(3600)
	if config.TTLSecondsAfterFinished != nil {
		ttlSecondsAfterFinished = *config.TTLSecondsAfterFinished
	}

	job := &batchv1.Job{
		ObjectMeta: metav1.ObjectMeta{
			Name:      config.Name,
			Namespace: jm.namespace,
			Labels: map[string]string{
				"app":              "scaledtest",
				"job-type":         "test-execution",
				"managed-by":       "scaledtest-platform",
			},
		},
		Spec: batchv1.JobSpec{
			Parallelism:             &parallelism,
			Completions:             &testCount,
			BackoffLimit:            &backoffLimit,
			CompletionMode:          &completionMode,
			ActiveDeadlineSeconds:   &activeDeadlineSeconds,
			TTLSecondsAfterFinished: &ttlSecondsAfterFinished,
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: map[string]string{
						"app":      "scaledtest",
						"job-name": config.Name,
					},
				},
				Spec: corev1.PodSpec{
					ServiceAccountName: config.ServiceAccountName,
					RestartPolicy:      corev1.RestartPolicyNever,
					Containers: []corev1.Container{
						{
							Name:            "test-runner",
							Image:           config.Image,
							ImagePullPolicy: corev1.PullAlways,
							Command:         command,
							Env:             envVars,
							Resources: corev1.ResourceRequirements{
								Requests: resourceList,
								Limits:   resourceLimits,
							},
							// Note: Artifacts are uploaded via API, no PVC mount needed
						},
					},
				},
			},
		},
	}

	// Add image pull secret if provided
	if config.ImagePullSecretName != "" {
		job.Spec.Template.Spec.ImagePullSecrets = []corev1.LocalObjectReference{
			{Name: config.ImagePullSecretName},
		}
	}

	// Create the Job
	createdJob, err := jm.clientset.BatchV1().Jobs(jm.namespace).Create(ctx, job, metav1.CreateOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to create Job: %w", err)
	}

	return createdJob, nil
}

// GetJob returns a Job by name
func (jm *JobManager) GetJob(ctx context.Context, jobName string) (*batchv1.Job, error) {
	return jm.clientset.BatchV1().Jobs(jm.namespace).Get(ctx, jobName, metav1.GetOptions{})
}

// DeleteJob deletes a Job by name
func (jm *JobManager) DeleteJob(ctx context.Context, jobName string) error {
	propagationPolicy := metav1.DeletePropagationBackground
	deleteOptions := metav1.DeleteOptions{
		PropagationPolicy: &propagationPolicy,
	}
	return jm.clientset.BatchV1().Jobs(jm.namespace).Delete(ctx, jobName, deleteOptions)
}

// GetJobStatus returns the current status of a Job
func (jm *JobManager) GetJobStatus(ctx context.Context, jobName string) (*JobStatus, error) {
	job, err := jm.GetJob(ctx, jobName)
	if err != nil {
		return nil, fmt.Errorf("failed to get Job status: %w", err)
	}

	status := &JobStatus{
		Active:     job.Status.Active,
		Succeeded:  job.Status.Succeeded,
		Failed:     job.Status.Failed,
		Conditions: make([]JobCondition, len(job.Status.Conditions)),
	}

	for i, cond := range job.Status.Conditions {
		status.Conditions[i] = JobCondition{
			Type:               string(cond.Type),
			Status:             string(cond.Status),
			LastTransitionTime: cond.LastTransitionTime.Time,
			Reason:             cond.Reason,
			Message:            cond.Message,
		}
	}

	return status, nil
}

// CancelJob deletes a running Job
func (jm *JobManager) CancelJob(ctx context.Context, jobName string) error {
	propagationPolicy := metav1.DeletePropagationBackground
	deleteOptions := metav1.DeleteOptions{
		PropagationPolicy: &propagationPolicy,
	}

	err := jm.clientset.BatchV1().Jobs(jm.namespace).Delete(ctx, jobName, deleteOptions)
	if err != nil {
		return fmt.Errorf("failed to delete Job: %w", err)
	}

	return nil
}

// CreateImagePullSecret creates a Docker registry secret for pulling private images
func (jm *JobManager) CreateImagePullSecret(ctx context.Context, secretName, registryURL, username, password string) error {
	dockerConfigJSON := fmt.Sprintf(`{"auths":{"%s":{"username":"%s","password":"%s","auth":"%s"}}}`,
		registryURL, username, password, base64Encode(username+":"+password))

	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      secretName,
			Namespace: jm.namespace,
			Labels: map[string]string{
				"app":        "scaledtest",
				"secret-type": "image-pull",
			},
		},
		Type: corev1.SecretTypeDockerConfigJson,
		Data: map[string][]byte{
			corev1.DockerConfigJsonKey: []byte(dockerConfigJSON),
		},
	}

	_, err := jm.clientset.CoreV1().Secrets(jm.namespace).Create(ctx, secret, metav1.CreateOptions{})
	if err != nil {
		return fmt.Errorf("failed to create image pull secret: %w", err)
	}

	return nil
}

// DeleteImagePullSecret removes an image pull secret
func (jm *JobManager) DeleteImagePullSecret(ctx context.Context, secretName string) error {
	err := jm.clientset.CoreV1().Secrets(jm.namespace).Delete(ctx, secretName, metav1.DeleteOptions{})
	if err != nil {
		return fmt.Errorf("failed to delete image pull secret: %w", err)
	}

	return nil
}

// GetPodLogs retrieves logs from a specific pod
func (jm *JobManager) GetPodLogs(ctx context.Context, podName string, tailLines int64) (string, error) {
	podLogOpts := corev1.PodLogOptions{}
	// Only set TailLines if greater than 0, otherwise get all logs
	if tailLines > 0 {
		podLogOpts.TailLines = &tailLines
	}

	req := jm.clientset.CoreV1().Pods(jm.namespace).GetLogs(podName, &podLogOpts)
	logs, err := req.Stream(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to get pod logs: %w", err)
	}
	defer logs.Close()

	buf := new(bytes.Buffer)
	_, err = io.Copy(buf, logs)
	if err != nil {
		return "", fmt.Errorf("failed to read pod logs: %w", err)
	}

	return buf.String(), nil
}

// StreamPodLogs returns an io.ReadCloser for streaming pod logs
func (jm *JobManager) StreamPodLogs(ctx context.Context, podName string, tailLines int64, follow bool) (io.ReadCloser, error) {
	podLogOpts := corev1.PodLogOptions{
		Follow: follow,
	}
	if tailLines > 0 {
		podLogOpts.TailLines = &tailLines
	}

	req := jm.clientset.CoreV1().Pods(jm.namespace).GetLogs(podName, &podLogOpts)
	return req.Stream(ctx)
}

// ListPodsForJob lists all pods created by a specific Job
func (jm *JobManager) ListPodsForJob(ctx context.Context, jobName string) ([]corev1.Pod, error) {
	labelSelector := fmt.Sprintf("job-name=%s", jobName)
	listOptions := metav1.ListOptions{
		LabelSelector: labelSelector,
	}

	podList, err := jm.clientset.CoreV1().Pods(jm.namespace).List(ctx, listOptions)
	if err != nil {
		return nil, fmt.Errorf("failed to list pods: %w", err)
	}

	return podList.Items, nil
}

// DiscoveryConfig contains configuration for creating a test discovery Job
type DiscoveryConfig struct {
	Name                string
	Image               string
	ImagePullSecretName string
	ServiceAccountName  string
	TimeoutSeconds      int32
}

// RunDiscoveryJob creates a K8s Job to discover tests from an image and returns the discovered test IDs
// This is used for direct image references where we can't run Docker locally
func (jm *JobManager) RunDiscoveryJob(ctx context.Context, config DiscoveryConfig) ([]string, error) {
	// Create environment variables for discovery mode
	envVars := []corev1.EnvVar{
		{
			Name:  "DISCOVERY_MODE",
			Value: "true",
		},
		{
			Name:  "NODE_ENV",
			Value: "test",
		},
	}

	// Set timeout (default 2 minutes for discovery)
	activeDeadlineSeconds := int64(config.TimeoutSeconds)
	if activeDeadlineSeconds == 0 {
		activeDeadlineSeconds = 120
	}

	backoffLimit := int32(0)
	ttlSecondsAfterFinished := int32(300) // Clean up after 5 minutes

	// Build image pull secrets if provided
	var imagePullSecrets []corev1.LocalObjectReference
	if config.ImagePullSecretName != "" {
		imagePullSecrets = append(imagePullSecrets, corev1.LocalObjectReference{
			Name: config.ImagePullSecretName,
		})
	}

	job := &batchv1.Job{
		ObjectMeta: metav1.ObjectMeta{
			Name:      config.Name,
			Namespace: jm.namespace,
			Labels: map[string]string{
				"app":        "scaledtest",
				"job-type":   "test-discovery",
				"managed-by": "scaledtest-platform",
			},
		},
		Spec: batchv1.JobSpec{
			BackoffLimit:            &backoffLimit,
			ActiveDeadlineSeconds:   &activeDeadlineSeconds,
			TTLSecondsAfterFinished: &ttlSecondsAfterFinished,
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: map[string]string{
						"app":      "scaledtest",
						"job-name": config.Name,
					},
				},
				Spec: corev1.PodSpec{
					ServiceAccountName: config.ServiceAccountName,
					RestartPolicy:      corev1.RestartPolicyNever,
					ImagePullSecrets:   imagePullSecrets,
					Containers: []corev1.Container{
						{
							Name:            "test-discovery",
							Image:           config.Image,
							ImagePullPolicy: corev1.PullAlways,
							Env:             envVars,
							Resources: corev1.ResourceRequirements{
								Requests: corev1.ResourceList{
									corev1.ResourceCPU:    parseQuantity("100m"),
									corev1.ResourceMemory: parseQuantity("256Mi"),
								},
								Limits: corev1.ResourceList{
									corev1.ResourceCPU:    parseQuantity("500m"),
									corev1.ResourceMemory: parseQuantity("512Mi"),
								},
							},
						},
					},
				},
			},
		},
	}

	// Create the job
	_, err := jm.clientset.BatchV1().Jobs(jm.namespace).Create(ctx, job, metav1.CreateOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to create discovery job '%s' in namespace '%s': %w", config.Name, jm.namespace, err)
	}

	// Wait for job to complete
	testIDs, err := jm.waitForDiscoveryJobAndParseResults(ctx, config.Name, time.Duration(activeDeadlineSeconds)*time.Second)
	if err != nil {
		// Clean up the job on error
		_ = jm.DeleteJob(ctx, config.Name)
		return nil, err
	}
	if err != nil {
		// Clean up the job on error
		_ = jm.DeleteJob(ctx, config.Name)
		return nil, err
	}

	return testIDs, nil
}

// waitForDiscoveryJobAndParseResults waits for the discovery job to complete and parses the test IDs from logs
func (jm *JobManager) waitForDiscoveryJobAndParseResults(ctx context.Context, jobName string, timeout time.Duration) ([]string, error) {
	// Use a background context with timeout instead of inheriting the request context
	// This prevents discovery from being canceled when the gRPC request times out
	bgCtx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	deadline := time.Now().Add(timeout)

	for time.Now().Before(deadline) {
		job, err := jm.GetJob(bgCtx, jobName)
		if err != nil {
			return nil, fmt.Errorf("failed to get discovery job '%s' status in namespace '%s': %w. Debug: kubectl describe job %s -n %s",
				jobName, jm.namespace, err, jobName, jm.namespace)
		}

		// Check if job completed
		if job.Status.Succeeded > 0 {
			// Job completed successfully, get logs and parse test IDs
			return jm.parseDiscoveryLogsForTestIDs(bgCtx, jobName)
		}

		if job.Status.Failed > 0 {
			// Try to get error from logs
			logs, _ := jm.getDiscoveryJobLogs(bgCtx, jobName)
			return nil, fmt.Errorf("discovery job '%s' failed in namespace '%s'.\n\nLogs:\n%s\n\nTroubleshooting:\n  kubectl logs job/%s -n %s\n  kubectl describe job/%s -n %s",
				jobName, jm.namespace, logs, jobName, jm.namespace, jobName, jm.namespace)
		}

		// Wait a bit before checking again
		select {
		case <-bgCtx.Done():
			return nil, bgCtx.Err()
		case <-time.After(2 * time.Second):
		}
	}

	return nil, fmt.Errorf("discovery job '%s' timed out after %v in namespace '%s'.\n\nTroubleshooting:\n  kubectl get pods -l job-name=%s -n %s\n  kubectl logs job/%s -n %s\n  kubectl describe job/%s -n %s",
		jobName, timeout, jm.namespace, jobName, jm.namespace, jobName, jm.namespace, jobName, jm.namespace)
}

// parseDiscoveryLogsForTestIDs extracts test IDs from discovery job logs
// Looks for CTRF JSON between markers: === CTRF JSON START === and === CTRF JSON END ===
func (jm *JobManager) parseDiscoveryLogsForTestIDs(ctx context.Context, jobName string) ([]string, error) {
	logs, err := jm.getDiscoveryJobLogs(ctx, jobName)
	if err != nil {
		return nil, fmt.Errorf("failed to get discovery logs for job '%s' in namespace '%s': %w.\nDebug: kubectl logs job/%s -n %s",
			jobName, jm.namespace, err, jobName, jm.namespace)
	}

	// Find CTRF JSON between markers
	startMarker := "=== CTRF JSON START ==="
	endMarker := "=== CTRF JSON END ==="

	startIdx := bytes.Index([]byte(logs), []byte(startMarker))
	if startIdx == -1 {
		// Truncate logs for error message if too long
		logPreview := logs
		if len(logPreview) > 1000 {
			logPreview = logPreview[:1000] + "... (truncated)"
		}
		return nil, fmt.Errorf("CTRF JSON start marker '%s' not found in discovery output for job '%s'.\n\nYour test runner must output discovery results between markers:\n  %s\n  <json content>\n  %s\n\nActual output (first 1000 chars):\n%s",
			startMarker, jobName, startMarker, endMarker, logPreview)
	}

	endIdx := bytes.Index([]byte(logs[startIdx:]), []byte(endMarker))
	if endIdx == -1 {
		return nil, fmt.Errorf("CTRF JSON end marker '%s' not found in discovery output for job '%s'. Start marker was found but end marker is missing. Check your test runner's discover-tests.sh script",
			endMarker, jobName)
	}

	// Extract JSON between markers
	jsonStart := startIdx + len(startMarker)
	jsonEnd := startIdx + endIdx
	jsonBytes := []byte(logs[jsonStart:jsonEnd])

	// Parse CTRF discovery JSON
	var ctrf struct {
		Tests []struct {
			ID string `json:"id"`
		} `json:"tests"`
	}

	if err := json.Unmarshal(bytes.TrimSpace(jsonBytes), &ctrf); err != nil {
		// Truncate JSON for error message if too long
		jsonPreview := string(jsonBytes)
		if len(jsonPreview) > 500 {
			jsonPreview = jsonPreview[:500] + "... (truncated)"
		}
		return nil, fmt.Errorf("failed to parse CTRF JSON for job '%s': %w\n\nJSON content:\n%s",
			jobName, err, jsonPreview)
	}

	// Extract test IDs
	testIDs := make([]string, 0, len(ctrf.Tests))
	for _, test := range ctrf.Tests {
		if test.ID != "" {
			testIDs = append(testIDs, test.ID)
		}
	}

	if len(testIDs) == 0 {
		return nil, fmt.Errorf("no test IDs found in discovery output for job '%s'.\n\nThe CTRF JSON was parsed but contained no tests. Ensure:\n  1. Tests exist in your test directory (e.g., tests/ui/)\n  2. Tests are properly configured for Playwright\n  3. The discover-tests.sh script correctly outputs test IDs\n\nRun discovery locally to debug: docker run -e DISCOVERY_MODE=true <your-image>",
			jobName)
	}

	return testIDs, nil
}

// getDiscoveryJobLogs retrieves logs from the discovery job pod
func (jm *JobManager) getDiscoveryJobLogs(ctx context.Context, jobName string) (string, error) {
	pods, err := jm.ListPodsForJob(ctx, jobName)
	if err != nil {
		return "", err
	}

	if len(pods) == 0 {
		return "", fmt.Errorf("no pods found for job %s", jobName)
	}

	// Get logs from the first (and only) pod
	return jm.GetPodLogs(ctx, pods[0].Name, 0)
}

// Helper functions

func (jm *JobManager) serializeTestIDs(testIDs []string) string {
	// Convert string slice to JSON array
	result := "["
	for i, id := range testIDs {
		if i > 0 {
			result += ","
		}
		result += fmt.Sprintf(`"%s"`, id)
	}
	result += "]"
	return result
}

func parseQuantity(quantity string) resource.Quantity {
	q, _ := resource.ParseQuantity(quantity)
	return q
}

func base64Encode(s string) string {
	return base64.StdEncoding.EncodeToString([]byte(s))
}
