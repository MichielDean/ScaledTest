package services

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/MichielDean/ScaledTest/backend/internal/k8s"
	"github.com/MichielDean/ScaledTest/backend/internal/models"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

// TestExecutionService handles test job execution
type TestExecutionService struct {
	db          *pgxpool.Pool
	logger      *zap.Logger
	imageSvc    *TestImageService
	registrySvc *ContainerRegistryService
	clusterSvc  *K8sClusterService
	jwtSecret   string
}

// TestJob represents a test execution job
type TestJob struct {
	ID                 string
	ProjectID          string
	TestImageID        string
	TestRunID          *string
	K8sJobName         string
	K8sNamespace       string
	TestID             string
	JobIndex           int32
	Status             string
	ExitCode           *int32
	PodName            *string
	ArtifactVolumePath *string
	Config             map[string]string
	StartedAt          *time.Time
	CompletedAt        *time.Time
	DurationMs         *int64
	CreatedAt          time.Time
}

// JobStats represents job statistics
type JobStats struct {
	Pending   int32
	Running   int32
	Succeeded int32
	Failed    int32
	Cancelled int32
}

// NewTestExecutionService creates a new test execution service
func NewTestExecutionService(db *pgxpool.Pool, logger *zap.Logger, imageSvc *TestImageService, registrySvc *ContainerRegistryService, clusterSvc *K8sClusterService, jwtSecret string) *TestExecutionService {
	return &TestExecutionService{
		db:          db,
		logger:      logger,
		imageSvc:    imageSvc,
		registrySvc: registrySvc,
		clusterSvc:  clusterSvc,
		jwtSecret:   jwtSecret,
	}
}

// getJobManagerForProject creates a JobManager using the project's default cluster
// Returns both the JobManager and the K8sCluster so callers can access RunnerConfig
func (s *TestExecutionService) getJobManagerForProject(ctx context.Context, projectID string) (*k8s.JobManager, *models.K8sCluster, error) {
	// Get the default cluster for this project
	cluster, err := s.clusterSvc.GetDefaultCluster(ctx, projectID)
	if err != nil {
		return nil, nil, fmt.Errorf("no K8s cluster configured for project: %w", err)
	}

	// Get decrypted credentials
	creds, err := s.clusterSvc.GetClusterCredentials(ctx, cluster.ID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get cluster credentials: %w", err)
	}

	// Create JobManager with stored credentials
	jobManager, err := k8s.NewJobManagerFromCredentials(k8s.ClusterCredentials{
		APIServerURL:      creds.APIServerURL,
		Namespace:         creds.Namespace,
		AuthType:          string(creds.AuthType),
		BearerToken:       creds.BearerToken,
		ClientCertificate: creds.ClientCertificate,
		ClientKey:         creds.ClientKey,
		CACertificate:     creds.CACertificate,
		SkipTLSVerify:     creds.SkipTLSVerify,
		Kubeconfig:        creds.Kubeconfig,
	})
	if err != nil {
		return nil, nil, fmt.Errorf("failed to create K8s client: %w", err)
	}

	// Update cluster status to connected
	_ = s.clusterSvc.UpdateClusterStatus(ctx, cluster.ID, "connected", nil)

	return jobManager, cluster, nil
}

// TriggerTestJobs triggers test execution for selected tests
// baseUrlOverride allows per-run customization of the AUT URL
// Returns (k8sJobName, testRunID, jobIDs, error)
func (s *TestExecutionService) TriggerTestJobs(ctx context.Context, projectID, testImageID, userID string, testIDs []string, baseUrlOverride string, environment map[string]string, resources *k8s.ResourceRequirements, timeoutSeconds, parallelism int32) (string, string, []string, error) {
	// Get JobManager and cluster config for this project
	jobManager, cluster, err := s.getJobManagerForProject(ctx, projectID)
	if err != nil {
		s.logger.Error("Failed to get JobManager for project", zap.Error(err), zap.String("project_id", projectID))
		return "", "", nil, err
	}

	// Validate runner config exists
	if cluster.RunnerConfig == nil {
		return "", "", nil, fmt.Errorf("cluster %s has no runner configuration - please configure platform API URL and other settings", cluster.Name)
	}

	// Prepare image and registry details
	imageRef, imagePullSecretName, err := s.prepareImageDetails(ctx, jobManager, testImageID)
	if err != nil {
		return "", "", nil, err
	}

	// Generate K8s job name and auth token
	k8sJobName := fmt.Sprintf("test-execution-%s", uuid.New().String()[:8])
	jobAuthToken, err := s.generateJobAuthToken(projectID, testImageID, k8sJobName)
	if err != nil {
		return "", "", nil, fmt.Errorf("failed to generate job auth token: %w", err)
	}

	// Apply defaults from cluster config
	resources, timeoutSeconds, parallelism = s.applyJobDefaults(cluster.RunnerConfig, resources, timeoutSeconds, parallelism, len(testIDs))

	// Build environment variables
	mergedEnv := s.buildJobEnvironment(cluster.RunnerConfig, environment, baseUrlOverride)

	// Store job records in database BEFORE creating K8s job to get job IDs
	testRunID := uuid.New().String()
	jobIDs := s.storeJobRecords(ctx, testIDs, projectID, testImageID, testRunID, k8sJobName, jobManager.GetNamespace(), environment, userID)

	// Create K8s job with job IDs mapped to test IDs by index
	jobConfig := s.buildJobConfig(&jobConfigParams{
		k8sJobName:          k8sJobName,
		imageRef:            imageRef,
		testIDs:             testIDs,
		jobIDs:              jobIDs,
		imagePullSecretName: imagePullSecretName,
		runnerConfig:        cluster.RunnerConfig,
		environment:         mergedEnv,
		resources:           *resources,
		timeoutSeconds:      timeoutSeconds,
		parallelism:         parallelism,
		jobAuthToken:        jobAuthToken,
		testRunID:           testRunID,
	})

	_, err = jobManager.CreateIndexedJob(ctx, jobConfig)
	if err != nil {
		return "", "", nil, fmt.Errorf("failed to create K8s job: %w", err)
	}

	s.logger.Info("Test jobs triggered",
		zap.String("k8s_job_name", k8sJobName),
		zap.String("test_run_id", testRunID),
		zap.Int("test_count", len(testIDs)),
		zap.Int32("parallelism", parallelism))

	return k8sJobName, testRunID, jobIDs, nil
}

// prepareImageDetails gets image and registry information, creates pull secret if needed
func (s *TestExecutionService) prepareImageDetails(ctx context.Context, jobManager *k8s.JobManager, testImageID string) (string, string, error) {
	testImage, err := s.imageSvc.GetTestImage(ctx, testImageID)
	if err != nil {
		return "", "", fmt.Errorf("failed to get test image: %w", err)
	}

	registry, err := s.registrySvc.GetContainerRegistry(ctx, testImage.RegistryID)
	if err != nil {
		return "", "", fmt.Errorf("failed to get registry: %w", err)
	}

	credentials, err := s.registrySvc.GetRegistryCredentials(ctx, registry.ID)
	if err != nil {
		return "", "", fmt.Errorf("failed to get registry credentials: %w", err)
	}

	imagePullSecretName := ""
	if credentials != "" && registry.Username != nil {
		imagePullSecretName = fmt.Sprintf("registry-secret-%s", registry.ID[:8])
		err = jobManager.CreateImagePullSecret(ctx, imagePullSecretName, registry.RegistryURL, *registry.Username, credentials)
		if err != nil {
			s.logger.Warn("Failed to create image pull secret", zap.Error(err))
		}
	}

	imageRef := buildImageReference(registry.RegistryURL, testImage.ImagePath, testImage.ImageTag)
	s.logger.Info("Built image reference for K8s job", zap.String("image_ref", imageRef))

	return imageRef, imagePullSecretName, nil
}

// applyJobDefaults applies default values from cluster config
func (s *TestExecutionService) applyJobDefaults(runnerConfig *models.RunnerConfig, resources *k8s.ResourceRequirements, timeoutSeconds, parallelism int32, testCount int) (*k8s.ResourceRequirements, int32, int32) {
	if resources == nil {
		if runnerConfig.DefaultResources.CPURequest != "" {
			resources = &k8s.ResourceRequirements{
				CPURequest:    runnerConfig.DefaultResources.CPURequest,
				MemoryRequest: runnerConfig.DefaultResources.MemoryRequest,
				CPULimit:      runnerConfig.DefaultResources.CPULimit,
				MemoryLimit:   runnerConfig.DefaultResources.MemoryLimit,
			}
		} else {
			resources = &k8s.ResourceRequirements{
				CPURequest:    "100m",
				MemoryRequest: "256Mi",
				CPULimit:      "1000m",
				MemoryLimit:   "1Gi",
			}
		}
	}

	if timeoutSeconds == 0 {
		if runnerConfig.DefaultTimeout > 0 {
			timeoutSeconds = runnerConfig.DefaultTimeout
		} else {
			timeoutSeconds = 3600
		}
	}

	if parallelism == 0 {
		if runnerConfig.DefaultParallelism > 0 {
			parallelism = runnerConfig.DefaultParallelism
		} else {
			parallelism = int32(testCount)
		}
	}

	return resources, timeoutSeconds, parallelism
}

// buildJobEnvironment merges environment variables with proper precedence
func (s *TestExecutionService) buildJobEnvironment(runnerConfig *models.RunnerConfig, environment map[string]string, baseUrlOverride string) map[string]string {
	mergedEnv := make(map[string]string)

	if runnerConfig.DefaultBaseURL != "" {
		mergedEnv["BASE_URL"] = runnerConfig.DefaultBaseURL
	}

	for k, v := range environment {
		mergedEnv[k] = v
	}

	if baseUrlOverride != "" {
		mergedEnv["BASE_URL"] = baseUrlOverride
	}

	return mergedEnv
}

// buildJobConfig creates the K8s job configuration
func (s *TestExecutionService) buildJobConfig(params *jobConfigParams) k8s.JobConfig {
	pvcName := params.runnerConfig.ArtifactsPVCName
	if pvcName == "" {
		pvcName = "scaledtest-artifacts"
	}

	serviceAccountName := params.runnerConfig.ServiceAccountName
	if serviceAccountName == "" {
		serviceAccountName = "scaledtest-job-runner"
	}

	// Get TTL from runner config (default: 3600 seconds = 1 hour)
	var ttlSeconds *int32
	if params.runnerConfig.JobTTLSeconds != nil {
		ttlSeconds = params.runnerConfig.JobTTLSeconds
	} else {
		defaultTTL := int32(3600)
		ttlSeconds = &defaultTTL
	}

	return k8s.JobConfig{
		Name:                    params.k8sJobName,
		Image:                   params.imageRef,
		TestIDs:                 params.testIDs,
		JobIDs:                  params.jobIDs,
		ImagePullSecretName:     params.imagePullSecretName,
		PVCName:                 pvcName,
		Environment:             params.environment,
		Resources:               params.resources,
		TimeoutSeconds:          params.timeoutSeconds,
		Parallelism:             params.parallelism,
		ServiceAccountName:      serviceAccountName,
		PlatformAPIURL:          params.runnerConfig.PlatformAPIURL,
		JobAuthToken:            params.jobAuthToken,
		TestRunID:               params.testRunID,
		TTLSecondsAfterFinished: ttlSeconds,
	}
}

// jobConfigParams holds parameters for building job config
type jobConfigParams struct {
	k8sJobName          string
	imageRef            string
	testIDs             []string
	jobIDs              []string // Database IDs for each test job
	imagePullSecretName string
	runnerConfig        *models.RunnerConfig
	environment         map[string]string
	resources           k8s.ResourceRequirements
	timeoutSeconds      int32
	parallelism         int32
	jobAuthToken        string
	testRunID           string
}

// storeJobRecords stores job records in the database
func (s *TestExecutionService) storeJobRecords(ctx context.Context, testIDs []string, projectID, testImageID, testRunID, k8sJobName, k8sNamespace string, environment map[string]string, userID string) []string {
	now := time.Now()
	jobIDs := make([]string, len(testIDs))
	configBytes, _ := json.Marshal(environment)
	configJSON := string(configBytes)

	for i, testID := range testIDs {
		jobID := uuid.New().String()
		jobIDs[i] = jobID

		query := `
			INSERT INTO public.test_jobs
			(id, project_id, test_image_id, test_run_id, k8s_job_name, k8s_namespace, test_id, job_index, status, config, created_by, created_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)
		`

		_, err := s.db.Exec(ctx, query,
			jobID, projectID, testImageID, testRunID, k8sJobName, k8sNamespace, testID, i, "pending", configJSON, userID, now,
		)

		if err != nil {
			s.logger.Error("Failed to store job record", zap.Error(err), zap.String("test_id", testID))
		}
	}

	return jobIDs
}

// GetTestJob retrieves a test job by ID
func (s *TestExecutionService) GetTestJob(ctx context.Context, jobID string) (*TestJob, error) {
	query := `
		SELECT id, project_id, test_image_id, test_run_id, k8s_job_name, k8s_namespace,
		       test_id, job_index, status, exit_code, pod_name, artifact_volume_path,
		       config, started_at, completed_at, duration_ms, created_at
		FROM public.test_jobs
		WHERE id = $1
	`

	job := &TestJob{}
	var configJSON string

	err := s.db.QueryRow(ctx, query, jobID).Scan(
		&job.ID,
		&job.ProjectID,
		&job.TestImageID,
		&job.TestRunID,
		&job.K8sJobName,
		&job.K8sNamespace,
		&job.TestID,
		&job.JobIndex,
		&job.Status,
		&job.ExitCode,
		&job.PodName,
		&job.ArtifactVolumePath,
		&configJSON,
		&job.StartedAt,
		&job.CompletedAt,
		&job.DurationMs,
		&job.CreatedAt,
	)

	if err != nil {
		s.logger.Error("Failed to get test job", zap.Error(err), zap.String("id", jobID))
		return nil, fmt.Errorf("failed to get test job: %w", err)
	}

	job.Config = jsonToMap(configJSON)
	return job, nil
}

// ListTestJobs lists test jobs
func (s *TestExecutionService) ListTestJobs(ctx context.Context, projectID string, page, pageSize int32, status, testImageID, k8sJobName *string) ([]*TestJob, int32, *JobStats, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	} else if pageSize > 1000 {
		pageSize = 1000
	}

	offset := (page - 1) * pageSize

	// Build WHERE clause
	whereClause := "WHERE project_id = $1"
	args := []interface{}{projectID}
	argIndex := 2

	if status != nil && *status != "" {
		whereClause += fmt.Sprintf(" AND status = $%d", argIndex)
		args = append(args, *status)
		argIndex++
	}

	if testImageID != nil && *testImageID != "" {
		whereClause += fmt.Sprintf(" AND test_image_id = $%d", argIndex)
		args = append(args, *testImageID)
		argIndex++
	}

	if k8sJobName != nil && *k8sJobName != "" {
		whereClause += fmt.Sprintf(" AND k8s_job_name = $%d", argIndex)
		args = append(args, *k8sJobName)
		argIndex++
	}

	// Get total count
	var totalCount int32
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM public.test_jobs %s", whereClause)
	err := s.db.QueryRow(ctx, countQuery, args...).Scan(&totalCount)
	if err != nil {
		return nil, 0, nil, fmt.Errorf("failed to count test jobs: %w", err)
	}

	// Get stats
	stats := &JobStats{}
	statsQuery := fmt.Sprintf(`
		SELECT 
			COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
			COUNT(CASE WHEN status = 'running' THEN 1 END) as running,
			COUNT(CASE WHEN status = 'succeeded' THEN 1 END) as succeeded,
			COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
			COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled
		FROM public.test_jobs
		%s
	`, whereClause)

	err = s.db.QueryRow(ctx, statsQuery, args...).Scan(
		&stats.Pending, &stats.Running, &stats.Succeeded, &stats.Failed, &stats.Cancelled,
	)
	if err != nil {
		s.logger.Warn("Failed to get job stats", zap.Error(err))
	}

	// Get jobs
	query := fmt.Sprintf(`
		SELECT id, project_id, test_image_id, k8s_job_name, k8s_namespace,
		       test_id, job_index, status, exit_code, pod_name,
		       started_at, completed_at, duration_ms, created_at
		FROM public.test_jobs
		%s
		ORDER BY created_at DESC
		LIMIT $%d OFFSET $%d
	`, whereClause, argIndex, argIndex+1)

	args = append(args, pageSize, offset)

	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		s.logger.Error("Failed to list test jobs", zap.Error(err))
		return nil, 0, nil, fmt.Errorf("failed to list test jobs: %w", err)
	}
	defer rows.Close()

	var jobs []*TestJob
	for rows.Next() {
		job := &TestJob{}
		err := rows.Scan(
			&job.ID,
			&job.ProjectID,
			&job.TestImageID,
			&job.K8sJobName,
			&job.K8sNamespace,
			&job.TestID,
			&job.JobIndex,
			&job.Status,
			&job.ExitCode,
			&job.PodName,
			&job.StartedAt,
			&job.CompletedAt,
			&job.DurationMs,
			&job.CreatedAt,
		)
		if err != nil {
			return nil, 0, nil, fmt.Errorf("failed to scan test job: %w", err)
		}

		jobs = append(jobs, job)
	}

	if err = rows.Err(); err != nil {
		return nil, 0, nil, fmt.Errorf("error iterating test jobs: %w", err)
	}

	return jobs, totalCount, stats, nil
}

// K8sJobStatus represents the status from Kubernetes
type K8sJobStatus struct {
	Active       int32            `json:"active"`
	Succeeded    int32            `json:"succeeded"`
	Failed       int32            `json:"failed"`
	Conditions   []k8s.JobCondition `json:"conditions"`
	IsTerminated bool             `json:"is_terminated"`
	FailureReason string          `json:"failure_reason,omitempty"`
}

// GetK8sJobStatus retrieves the status of a K8s job directly from the cluster
func (s *TestExecutionService) GetK8sJobStatus(ctx context.Context, projectID, k8sJobName string) (*K8sJobStatus, error) {
	// Get JobManager for this project's cluster
	jobManager, _, err := s.getJobManagerForProject(ctx, projectID)
	if err != nil {
		return nil, fmt.Errorf("no K8s cluster configured for project: %w", err)
	}

	// Get job status from K8s
	status, err := jobManager.GetJobStatus(ctx, k8sJobName)
	if err != nil {
		return nil, fmt.Errorf("failed to get K8s job status: %w", err)
	}

	result := &K8sJobStatus{
		Active:     status.Active,
		Succeeded:  status.Succeeded,
		Failed:     status.Failed,
		Conditions: status.Conditions,
	}

	// Check for terminal conditions
	for _, cond := range status.Conditions {
		if cond.Type == "Failed" && cond.Status == "True" {
			result.IsTerminated = true
			result.FailureReason = cond.Reason + ": " + cond.Message
			break
		}
		if cond.Type == "Complete" && cond.Status == "True" {
			result.IsTerminated = true
			break
		}
	}

	return result, nil
}

// CancelTestJob cancels a running test job
func (s *TestExecutionService) CancelTestJob(ctx context.Context, jobID string) error {
	// Get job details
	job, err := s.GetTestJob(ctx, jobID)
	if err != nil {
		return err
	}

	// Get JobManager for this project's cluster
	jobManager, _, err := s.getJobManagerForProject(ctx, job.ProjectID)
	if err != nil {
		return fmt.Errorf("no K8s cluster configured for project: %w", err)
	}

	// Cancel K8s job
	err = jobManager.CancelJob(ctx, job.K8sJobName)
	if err != nil {
		s.logger.Error("Failed to cancel K8s job", zap.Error(err), zap.String("k8s_job", job.K8sJobName))
		return fmt.Errorf("failed to cancel K8s job: %w", err)
	}

	// Update status in database
	query := `
		UPDATE public.test_jobs
		SET status = $1, completed_at = $2
		WHERE id = $3
	`

	_, err = s.db.Exec(ctx, query, "cancelled", time.Now(), jobID)
	if err != nil {
		return fmt.Errorf("failed to update job status: %w", err)
	}

	s.logger.Info("Test job cancelled", zap.String("id", jobID))
	return nil
}

// UpdateJobStatus updates a test job status (called by K8s watcher)
func (s *TestExecutionService) UpdateJobStatus(ctx context.Context, jobID, status string, exitCode *int32, podName *string) error {
	now := time.Now()

	query := `
		UPDATE public.test_jobs
		SET status = $1, exit_code = $2, pod_name = $3, updated_at = $4
	`
	args := []interface{}{status, exitCode, podName, now}

	if status == "running" {
		query += `, started_at = $5 WHERE id = $6 AND started_at IS NULL`
		args = append(args, now, jobID)
	} else if status == "succeeded" || status == "failed" {
		query += `, completed_at = $5, duration_ms = EXTRACT(EPOCH FROM ($5 - started_at)) * 1000 WHERE id = $6`
		args = append(args, now, jobID)
	} else {
		query += ` WHERE id = $5`
		args = append(args, jobID)
	}

	_, err := s.db.Exec(ctx, query, args...)
	if err != nil {
		s.logger.Error("Failed to update job status", zap.Error(err), zap.String("id", jobID))
		return fmt.Errorf("failed to update job status: %w", err)
	}

	return nil
}

// Helper functions

// generateJobAuthToken creates a JWT token for job pods to authenticate with the API
// The token has limited claims specifically for test result upload
func (s *TestExecutionService) generateJobAuthToken(projectID, testImageID, k8sJobName string) (string, error) {
	// Token expires in 24 hours (longer than job timeout to allow for result upload)
	expiresAt := time.Now().Add(24 * time.Hour)

	// Use specific claims to identify this as a job token
	claims := jwt.MapClaims{
		"sub":           "job-" + k8sJobName, // Subject identifies this as a job token
		"project_id":    projectID,
		"test_image_id": testImageID,
		"k8s_job_name":  k8sJobName,
		"type":          "job_token", // Explicitly mark as job token
		"exp":           expiresAt.Unix(),
		"iat":           time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(s.jwtSecret))
	if err != nil {
		s.logger.Error("Failed to generate job auth token", zap.Error(err))
		return "", fmt.Errorf("failed to generate job auth token: %w", err)
	}

	return tokenString, nil
}

// buildImageReference constructs the full image reference for K8s
// Strips protocol prefix from registry URL since Docker/K8s don't use it
func buildImageReference(registryURL, imagePath, imageTag string) string {
	// Remove protocol from registry URL
	registryHost := strings.TrimPrefix(registryURL, "https://")
	registryHost = strings.TrimPrefix(registryHost, "http://")

	// For Docker Hub, don't include registry host
	if strings.Contains(registryHost, "docker.io") || registryHost == "registry-1.docker.io" {
		return fmt.Sprintf("%s:%s", imagePath, imageTag)
	}

	return fmt.Sprintf("%s/%s:%s", registryHost, imagePath, imageTag)
}
