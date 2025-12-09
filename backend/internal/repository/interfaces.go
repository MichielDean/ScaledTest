// Package repository provides data access layer interfaces and implementations.
// All repository implementations should implement these interfaces to enable
// dependency injection and testability.
//
// Naming Convention:
// - Interface names are clean and descriptive (e.g., UserRepository, ProjectRepository)
// - Concrete implementations are prefixed with storage type (e.g., PostgresUserRepository)
// - This follows Go idiomatic naming where interfaces describe behavior
package repository

import (
	"context"
	"time"

	"github.com/MichielDean/ScaledTest/backend/internal/models"
)

// UserRepository defines the interface for user data access operations.
// Implementations handle persistence for users and profiles.
type UserRepository interface {
	// GetProfileByID retrieves a user profile by ID
	GetProfileByID(ctx context.Context, id string) (*models.Profile, error)

	// GetUserWithRole retrieves a user profile with their role from auth.users
	GetUserWithRole(ctx context.Context, id string) (*models.User, error)

	// UpdateProfile updates a user's profile
	UpdateProfile(ctx context.Context, profile *models.Profile) error

	// ListUsers retrieves users with pagination and filtering
	ListUsers(ctx context.Context, opts ListUsersOptions) ([]*models.User, int32, error)
}

// ProjectRepository defines the interface for project data access operations.
type ProjectRepository interface {
	// Create inserts a new project and returns it with generated ID and timestamps
	Create(ctx context.Context, project *models.Project) (*models.Project, error)

	// GetByID retrieves a project by its ID
	GetByID(ctx context.Context, id string) (*models.Project, error)

	// ListByUser retrieves all projects for a user with pagination
	ListByUser(ctx context.Context, userID string, page, pageSize int32) ([]*models.Project, int32, error)

	// Update updates an existing project
	Update(ctx context.Context, project *models.Project) error

	// Delete removes a project by ID
	Delete(ctx context.Context, id string) error
}

// ClusterRepository defines the interface for K8s cluster data access operations.
type ClusterRepository interface {
	// Create inserts a new K8s cluster
	Create(ctx context.Context, cluster *models.K8sCluster, creds *models.K8sClusterCredentials) (*models.K8sCluster, error)

	// GetByID retrieves a cluster by ID (without credentials)
	GetByID(ctx context.Context, id string) (*models.K8sCluster, error)

	// GetCredentials retrieves encrypted credentials for a cluster
	GetCredentials(ctx context.Context, id string) (*models.K8sClusterCredentials, error)

	// ListByProject retrieves all clusters for a project
	ListByProject(ctx context.Context, projectID string) ([]*models.K8sCluster, error)

	// ListByEnvironment retrieves clusters for a project filtered by environment
	ListByEnvironment(ctx context.Context, projectID string, env models.Environment) ([]*models.K8sCluster, error)

	// GetDefault retrieves the default cluster for a project (optionally filtered by environment)
	GetDefault(ctx context.Context, projectID string, env *models.Environment) (*models.K8sCluster, error)

	// UpdateStatus updates the connection status of a cluster
	UpdateStatus(ctx context.Context, id, status string, errorMsg *string) error

	// SetDefault sets a cluster as the default for its environment
	SetDefault(ctx context.Context, id string) error

	// UpdateRunnerConfig updates the runner configuration for a cluster
	UpdateRunnerConfig(ctx context.Context, id string, config *models.RunnerConfig) error

	// UpdateSutConfig updates the SUT configuration for a cluster
	UpdateSutConfig(ctx context.Context, id string, config *models.SutConfig) error

	// Delete removes a cluster by ID
	Delete(ctx context.Context, id string) error
}

// ArtifactRepository defines the interface for test artifact data access operations.
type ArtifactRepository interface {
	// Create inserts a new artifact metadata record
	Create(ctx context.Context, artifact *models.TestArtifact) error

	// GetByID retrieves an artifact by ID
	GetByID(ctx context.Context, id string) (*models.TestArtifact, error)

	// ListByTestRunID retrieves all artifacts for a test run
	ListByTestRunID(ctx context.Context, testRunID string) ([]*models.TestArtifact, error)

	// ListByTestJobID retrieves all artifacts for a test job
	ListByTestJobID(ctx context.Context, testJobID string) ([]*models.TestArtifact, error)

	// ListOlderThan retrieves artifacts older than a given time
	ListOlderThan(ctx context.Context, cutoff time.Time) ([]*models.TestArtifact, error)

	// Delete removes an artifact by ID
	Delete(ctx context.Context, id string) error

	// DeleteByTestRunID removes all artifacts for a test run
	DeleteByTestRunID(ctx context.Context, testRunID string) (int, error)
}

// Compile-time interface implementation checks
var (
	_ UserRepository     = (*PostgresUserRepository)(nil)
	_ ProjectRepository  = (*PostgresProjectRepository)(nil)
	_ ClusterRepository  = (*PostgresClusterRepository)(nil)
	_ ArtifactRepository = (*PostgresArtifactRepository)(nil)
)
