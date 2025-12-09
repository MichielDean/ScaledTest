// Package services provides business logic layer interfaces and implementations.
// All service implementations should implement these interfaces to enable
// dependency injection and testability.
//
// Naming Convention:
// - Interface names are clean and descriptive (e.g., UserManager, ProjectManager)
// - Concrete implementations keep the "Service" suffix (e.g., UserService, ProjectService)
// - This follows Go idiomatic naming where interfaces describe behavior
package services

import (
	"context"

	"github.com/MichielDean/ScaledTest/backend/api/proto"
	"github.com/MichielDean/ScaledTest/backend/internal/k8s"
	"github.com/MichielDean/ScaledTest/backend/internal/models"
)

// DatabaseHealthChecker defines the interface for checking database health.
// This allows handlers to check database connectivity without directly depending on the database package.
type DatabaseHealthChecker interface {
	// Health checks if the database connection is healthy
	Health(ctx context.Context) error
}

// UserManager defines the interface for user business operations.
// Implementations handle user profile management and listing.
type UserManager interface {
	// GetUserProfile retrieves a user profile by ID (gRPC)
	GetUserProfile(ctx context.Context, req *proto.GetUserProfileRequest) (*proto.UserProfileResponse, error)

	// UpdateUserProfile updates a user's profile information (gRPC)
	UpdateUserProfile(ctx context.Context, req *proto.UpdateUserProfileRequest) (*proto.UserProfileResponse, error)

	// ListUsers lists all users with pagination and filtering (gRPC, admin only)
	ListUsers(ctx context.Context, req *proto.ListUsersRequest) (*proto.ListUsersResponse, error)

	// REST-compatible methods for HTTP handlers

	// GetUserByID retrieves a user with their role by ID
	GetUserByID(ctx context.Context, userID string) (*models.User, error)

	// GetProfileByID retrieves a user profile by ID
	GetProfileByID(ctx context.Context, userID string) (*models.Profile, error)

	// UpdateProfile updates a user's profile
	UpdateProfile(ctx context.Context, profile *models.Profile) error

	// ListUsersREST lists users with pagination for REST API
	ListUsersREST(ctx context.Context, page, pageSize int32, search, roleFilter string) ([]*models.User, int32, error)
}

// ProjectManager defines the interface for project business operations.
type ProjectManager interface {
	// CreateProject creates a new project
	CreateProject(ctx context.Context, name string, description *string, gitRepositoryURL *string, createdBy string, organizationID *string, settings map[string]string) (*models.Project, error)

	// GetProject retrieves a project by ID
	GetProject(ctx context.Context, projectID string) (*models.Project, error)

	// ListProjects lists all projects for a user
	ListProjects(ctx context.Context, userID string, page, pageSize int32) ([]*models.Project, int32, error)

	// UpdateProject updates a project
	UpdateProject(ctx context.Context, projectID string, name *string, description *string, gitRepositoryURL *string, settings map[string]string) (*models.Project, error)

	// DeleteProject deletes a project
	DeleteProject(ctx context.Context, projectID string) error
}

// SettingsManager defines the interface for system configuration operations.
type SettingsManager interface {
	// GetSettings retrieves all system settings, using cache if available
	GetSettings(ctx context.Context) (*models.SystemSettings, error)

	// GetVersion returns the current settings version for cache invalidation
	GetVersion(ctx context.Context) (int, error)

	// GetPublicConfig returns non-sensitive settings for the public /api/v1/config endpoint
	GetPublicConfig(ctx context.Context) (*models.PublicConfig, error)

	// UpdateSettings updates settings from a partial update request
	UpdateSettings(ctx context.Context, req *models.UpdateSettingsRequest) (*models.SystemSettings, error)

	// GetAuthSettings is a convenience method to get just auth settings
	GetAuthSettings(ctx context.Context) (*models.AuthSettings, error)

	// IsFirstUser checks if this would be the first user in the system
	IsFirstUser(ctx context.Context) (bool, error)

	// IsAdminEmail checks if an email is in the admin emails list
	IsAdminEmail(ctx context.Context, email string) (bool, error)
}

// ClusterManager defines the interface for K8s cluster configuration operations.
type ClusterManager interface {
	// CreateCluster creates a new K8s cluster configuration
	CreateCluster(ctx context.Context, cluster *models.K8sCluster, credentials *models.K8sClusterCredentials) (*models.K8sCluster, error)

	// GetCluster retrieves a K8s cluster by ID
	GetCluster(ctx context.Context, clusterID string) (*models.K8sCluster, error)

	// GetClusterCredentials retrieves decrypted credentials for a cluster
	GetClusterCredentials(ctx context.Context, clusterID string) (*models.K8sClusterCredentials, error)

	// GetDefaultCluster gets the default cluster for a project
	GetDefaultCluster(ctx context.Context, projectID string) (*models.K8sCluster, error)

	// GetDefaultClusterForEnvironment gets the default cluster for a specific environment
	GetDefaultClusterForEnvironment(ctx context.Context, projectID string, environment models.Environment) (*models.K8sCluster, error)

	// ListClusters lists all clusters for a project
	ListClusters(ctx context.Context, projectID string) ([]*models.K8sCluster, error)

	// ListClustersByEnvironment lists clusters for a project filtered by environment
	ListClustersByEnvironment(ctx context.Context, projectID string, environment models.Environment) ([]*models.K8sCluster, error)

	// UpdateClusterStatus updates the connection status of a cluster
	UpdateClusterStatus(ctx context.Context, clusterID, status string, errorMsg *string) error

	// SetDefaultCluster sets a cluster as the default for its project and environment
	SetDefaultCluster(ctx context.Context, clusterID string) error

	// UpdateRunnerConfig updates the runner configuration for a cluster
	UpdateRunnerConfig(ctx context.Context, clusterID string, config models.RunnerConfig) error

	// UpdateSutConfig updates the SUT configuration for a cluster
	UpdateSutConfig(ctx context.Context, clusterID string, config *models.SutConfig) error

	// DeleteCluster deletes a K8s cluster configuration
	DeleteCluster(ctx context.Context, clusterID string) error
}

// TestResultManager defines the interface for test result operations.
type TestResultManager interface {
	// UploadTestResults uploads test execution results (gRPC)
	UploadTestResults(ctx context.Context, req *proto.UploadTestResultsRequest) (*proto.UploadTestResultsResponse, error)

	// GetTestResults retrieves test results by run ID (gRPC)
	GetTestResults(ctx context.Context, req *proto.GetTestResultsRequest) (*proto.TestResultsResponse, error)

	// ListTestResults lists test results for a project with pagination (gRPC)
	ListTestResults(ctx context.Context, req *proto.ListTestResultsRequest) (*proto.ListTestResultsResponse, error)

	// GetTestStatistics retrieves aggregated test statistics (gRPC)
	GetTestStatistics(ctx context.Context, req *proto.GetTestStatisticsRequest) (*proto.TestStatisticsResponse, error)

	// StreamTestResults streams test results in real-time (gRPC)
	StreamTestResults(req *proto.StreamTestResultsRequest, stream proto.TestResultService_StreamTestResultsServer) error

	// REST-compatible CTRF methods for HTTP handlers

	// UploadCtrfReport uploads a CTRF test report
	UploadCtrfReport(ctx context.Context, report *models.CtrfSchemaJson, userID string) (*CtrfUploadResult, error)

	// UpsertCtrfReportByRunID upserts a CTRF report, aggregating by test_run_id
	UpsertCtrfReportByRunID(ctx context.Context, report *models.CtrfSchemaJson, testRunID string, jobCompletionIndex int, userID string) (*CtrfUpsertResult, error)

	// GetCtrfReport retrieves a CTRF report by ID
	GetCtrfReport(ctx context.Context, reportID string) (*models.CtrfSchemaJson, error)

	// ListCtrfReports lists CTRF reports with pagination
	ListCtrfReports(ctx context.Context, page, pageSize int) (*CtrfReportList, error)

	// GetCtrfStatistics retrieves aggregated CTRF statistics
	GetCtrfStatistics(ctx context.Context) (*CtrfStatistics, error)
}

// TestImageManager defines the interface for test image operations.
type TestImageManager interface {
	// AddTestImage adds a new test image
	AddTestImage(ctx context.Context, registryID, imagePath, imageTag, createdBy string, projectID *string) (*TestImage, error)

	// GetTestImage retrieves a test image by ID
	GetTestImage(ctx context.Context, imageID string) (*TestImage, error)

	// ListTestImages lists test images with optional filters
	ListTestImages(ctx context.Context, userID string, registryID, projectID *string, page, pageSize int32) ([]*TestImage, int32, error)

	// UpdateTestImageDiscovery updates test discovery results
	UpdateTestImageDiscovery(ctx context.Context, imageID string, discoveredTests []map[string]interface{}, framework, frameworkVersion, imageDigest *string) error

	// UpdateTestImageDiscoveryStatus updates only the discovery status (for in-progress or failures)
	UpdateTestImageDiscoveryStatus(ctx context.Context, imageID, status string, errorMsg *string) error

	// DeleteTestImage deletes a test image
	DeleteTestImage(ctx context.Context, imageID string) error
}

// RegistryManager defines the interface for container registry operations.
type RegistryManager interface {
	// AddContainerRegistry adds a new container registry
	AddContainerRegistry(ctx context.Context, projectID *string, name, registryURL, registryType string, username, credentials *string, authType, createdBy string) (*ContainerRegistry, error)

	// GetContainerRegistry retrieves a registry by ID
	GetContainerRegistry(ctx context.Context, registryID string) (*ContainerRegistry, error)

	// GetRegistryCredentials retrieves and decrypts registry credentials
	GetRegistryCredentials(ctx context.Context, registryID string) (string, error)

	// ListContainerRegistries lists registries for a user
	ListContainerRegistries(ctx context.Context, userID string, projectID *string, page, pageSize int32) ([]*ContainerRegistry, int32, error)

	// UpdateContainerRegistry updates registry configuration
	UpdateContainerRegistry(ctx context.Context, registryID string, name, username, credentials *string) (*ContainerRegistry, error)

	// TestRegistryConnection tests connectivity to a registry
	TestRegistryConnection(ctx context.Context, registryID string) (bool, string, error)

	// SyncRegistryImages lists available images from a registry
	SyncRegistryImages(ctx context.Context, registryID string) ([]*RegistryImage, error)

	// DeleteContainerRegistry deletes a registry
	DeleteContainerRegistry(ctx context.Context, registryID string) error
}

// TestExecutor defines the interface for test job execution operations.
type TestExecutor interface {
	// TriggerTestJobs triggers test execution for selected tests
	// Returns (k8sJobName, testRunID, jobIDs, error)
	TriggerTestJobs(ctx context.Context, projectID, testImageID, userID string, testIDs []string, baseUrlOverride string, environment map[string]string, resources *k8s.ResourceRequirements, timeoutSeconds, parallelism int32) (string, string, []string, error)

	// GetTestJob retrieves a test job by ID
	GetTestJob(ctx context.Context, jobID string) (*TestJob, error)

	// ListTestJobs lists test jobs
	ListTestJobs(ctx context.Context, projectID string, page, pageSize int32, status, testImageID, k8sJobName *string) ([]*TestJob, int32, *JobStats, error)

	// GetK8sJobStatus retrieves the status of a K8s job directly from the cluster
	GetK8sJobStatus(ctx context.Context, projectID, k8sJobName string) (*K8sJobStatus, error)

	// CancelTestJob cancels a running test job
	CancelTestJob(ctx context.Context, jobID string) error

	// UpdateJobStatus updates a test job status (called by K8s watcher)
	UpdateJobStatus(ctx context.Context, jobID, status string, exitCode *int32, podName *string) error
}

// TestDiscoverer defines the interface for discovering tests from container images.
type TestDiscoverer interface {
	// DiscoverTests discovers tests from a container image
	// forceRefresh bypasses cached results and performs fresh discovery
	DiscoverTests(ctx context.Context, imageID string, forceRefresh bool) error
}

// Compile-time interface implementation checks
var (
	_ UserManager       = (*UserService)(nil)
	_ ProjectManager    = (*ProjectService)(nil)
	_ SettingsManager   = (*SystemSettingsService)(nil)
	_ ClusterManager    = (*K8sClusterService)(nil)
	_ TestResultManager = (*TestResultService)(nil)
	_ TestImageManager  = (*TestImageService)(nil)
	_ RegistryManager   = (*ContainerRegistryService)(nil)
	_ TestExecutor      = (*TestExecutionService)(nil)
	_ TestDiscoverer    = (*TestDiscoveryService)(nil)
)
