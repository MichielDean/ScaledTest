//go:build wireinject
// +build wireinject

// Package wire provides dependency injection configuration using Google Wire.
// This file contains Wire provider sets organized by domain for maintainability.
//
// Naming Convention:
// - Interfaces use "Manager/Executor" suffix (e.g., UserManager, TestExecutor)
// - Concrete implementations use "Service" suffix (e.g., UserService, TestExecutionService)
// - Repositories: Interface is "Repository", concrete is "PostgresXxxRepository"
package wire

import (
	"context"
	"os"

	"github.com/MichielDean/ScaledTest/backend/internal/crypto"
	"github.com/MichielDean/ScaledTest/backend/internal/database"
	"github.com/MichielDean/ScaledTest/backend/internal/handlers"
	"github.com/MichielDean/ScaledTest/backend/internal/repository"
	"github.com/MichielDean/ScaledTest/backend/internal/services"
	"github.com/MichielDean/ScaledTest/backend/internal/storage"
	"github.com/google/wire"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

// AppConfig holds configuration values needed for initialization.
type AppConfig struct {
	JWTSecret   string
	Environment string
}

// AppDependencies holds all initialized dependencies for the application.
// Services are exposed as interfaces for proper DI and testability.
// For gRPC registration, use type assertions to the proto.XXXServiceServer interfaces.
type AppDependencies struct {
	DB *database.Database

	// Repositories (interfaces)
	UserRepo    repository.UserRepository
	ProjectRepo repository.ProjectRepository

	// Services (interfaces for DI)
	UserService           services.UserManager
	ProjectService        services.ProjectManager
	TestResultService     services.TestResultManager
	TestImageService      services.TestImageManager
	AuthService           services.AuthManager
	SettingsService       services.SettingsManager
	RegistryService       services.RegistryManager
	ClusterService        services.ClusterManager
	TestExecutionService  services.TestExecutor
	TestDiscoveryService  services.TestDiscoverer
	ArtifactService       *services.ArtifactService

	// Handlers
	UserHandler           *handlers.UserHandler
	ProjectHandler        *handlers.ProjectHandler
	AuthHandler           *handlers.AuthHandler
	SystemSettingsHandler *handlers.SystemSettingsHandler
	TestResultHandler     *handlers.TestResultHandler
	TestImageHandler      *handlers.TestImageHandler
	RegistryHandler       *handlers.RegistryHandler
	K8sClusterHandler     *handlers.K8sClusterHandler
	TestJobHandler        *handlers.TestJobHandler
	TestJobRESTHandler    *handlers.TestJobRESTHandler
}

// ProvideDatabase creates the database connection pool.
// This is a fundamental provider used by all repositories and services.
func ProvideDatabase(ctx context.Context, config *database.Config, logger *zap.Logger) (*database.Database, func(), error) {
	db, err := database.Connect(ctx, config, logger)
	if err != nil {
		return nil, nil, err
	}
	cleanup := func() {
		db.Close()
	}
	return db, cleanup, nil
}

// ProvideDBPool extracts the pgxpool.Pool from the Database wrapper.
func ProvideDBPool(db *database.Database) *pgxpool.Pool {
	return db.Pool
}

// ProvideExecutor extracts the Executor interface from the Database wrapper.
func ProvideExecutor(db *database.Database) database.Executor {
	return db.Pool
}

// ProvideJWTSecret extracts the JWT secret from AppConfig.
func ProvideJWTSecret(cfg *AppConfig) string {
	return cfg.JWTSecret
}

// ProvideEncryptionService creates the encryption service using JWT secret.
func ProvideEncryptionService(jwtSecret string) (*crypto.EncryptionService, error) {
	return crypto.NewEncryptionService(jwtSecret)
}

// ProvideTestDiscoveryService creates the test discovery service.
func ProvideTestDiscoveryService(db *pgxpool.Pool, logger *zap.Logger, registrySvc services.RegistryManager) (*services.TestDiscoveryService, error) {
	return services.NewTestDiscoveryService(db, logger, registrySvc)
}

// ProvideS3StorageConfig creates S3Storage configuration from environment variables.
func ProvideS3StorageConfig() storage.Config {
	return storage.Config{
		Endpoint:  getEnv("S3_ENDPOINT", "localhost:9000"),
		Bucket:    getEnv("S3_BUCKET", "artifacts"),
		AccessKey: getEnv("S3_ACCESS_KEY", "scaledtest"),
		SecretKey: getEnv("S3_SECRET_KEY", "scaledtest123"),
		UseSSL:    getEnv("S3_USE_SSL", "false") == "true",
		Region:    getEnv("S3_REGION", "us-east-1"),
	}
}

// ProvideS3Storage creates the S3Storage instance.
func ProvideS3Storage(config storage.Config, logger *zap.Logger) (*storage.S3Storage, error) {
	return storage.NewS3Storage(config, logger)
}

// ProvideArtifactService creates the artifact service.
func ProvideArtifactService(s3Storage *storage.S3Storage, artifactRepo repository.ArtifactRepository, logger *zap.Logger) *services.ArtifactService {
	return services.NewArtifactService(s3Storage, artifactRepo, logger)
}

// getEnv retrieves an environment variable or returns a default value.
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// DatabaseSet provides database-related dependencies.
var DatabaseSet = wire.NewSet(
	ProvideDatabase,
	ProvideDBPool,
	ProvideExecutor,
)

// RepositorySet provides all repository implementations.
var RepositorySet = wire.NewSet(
	repository.NewPostgresUserRepository,
	repository.NewPostgresProjectRepository,
	repository.NewPostgresClusterRepository,
	repository.NewPostgresAuthRepository,
	repository.NewPostgresArtifactRepository,
	// Bind concrete implementations to interfaces
	wire.Bind(new(repository.UserRepository), new(*repository.PostgresUserRepository)),
	wire.Bind(new(repository.ProjectRepository), new(*repository.PostgresProjectRepository)),
	wire.Bind(new(repository.ClusterRepository), new(*repository.PostgresClusterRepository)),
	wire.Bind(new(repository.AuthRepository), new(*repository.PostgresAuthRepository)),
	wire.Bind(new(repository.ArtifactRepository), new(*repository.PostgresArtifactRepository)),
)

// CryptoSet provides cryptography-related dependencies.
var CryptoSet = wire.NewSet(
	ProvideJWTSecret,
	ProvideEncryptionService,
)

// AuthProviderSet provides authentication-related dependencies.
// Includes: SystemSettingsService, AuthService, AuthHandler
var AuthProviderSet = wire.NewSet(
	services.NewSystemSettingsService,
	services.NewAuthService,
	handlers.NewSystemSettingsHandler,
	handlers.NewAuthHandler,
	// Bind concrete types to interfaces
	wire.Bind(new(services.SettingsManager), new(*services.SystemSettingsService)),
	wire.Bind(new(services.AuthManager), new(*services.AuthService)),
)

// UserProviderSet provides user-related dependencies.
// Includes: UserService, UserHandler
var UserProviderSet = wire.NewSet(
	services.NewUserService,
	handlers.NewUserHandler,
	wire.Bind(new(services.UserManager), new(*services.UserService)),
)

// ProjectProviderSet provides project-related dependencies.
// Includes: ProjectService, ProjectHandler
var ProjectProviderSet = wire.NewSet(
	services.NewProjectService,
	handlers.NewProjectHandler,
	wire.Bind(new(services.ProjectManager), new(*services.ProjectService)),
)

// TestProviderSet provides test-related dependencies.
// Includes: TestResultService, TestImageService, TestResultHandler
var TestProviderSet = wire.NewSet(
	services.NewTestResultService,
	services.NewTestImageService,
	ProvideTestDiscoveryService,
	handlers.NewTestResultHandler,
	handlers.NewTestImageHandler,
	wire.Bind(new(services.TestResultManager), new(*services.TestResultService)),
	wire.Bind(new(services.TestImageManager), new(*services.TestImageService)),
	wire.Bind(new(services.TestDiscoverer), new(*services.TestDiscoveryService)),
)

// K8sProviderSet provides Kubernetes-related dependencies.
// Includes: K8sClusterService, RegistryService, TestExecutionService, handlers
var K8sProviderSet = wire.NewSet(
	services.NewK8sClusterService,
	services.NewContainerRegistryService,
	services.NewTestExecutionService,
	handlers.NewK8sClusterHandler,
	handlers.NewRegistryHandler,
	handlers.NewTestJobHandler,
	handlers.NewTestJobRESTHandler,
	wire.Bind(new(services.ClusterManager), new(*services.K8sClusterService)),
	wire.Bind(new(services.RegistryManager), new(*services.ContainerRegistryService)),
	wire.Bind(new(services.TestExecutor), new(*services.TestExecutionService)),
)

// StorageProviderSet provides artifact storage dependencies.
// Includes: S3Storage, ArtifactService
var StorageProviderSet = wire.NewSet(
	ProvideS3StorageConfig,
	ProvideS3Storage,
	ProvideArtifactService,
)

// AllProviderSets combines all provider sets for full application initialization.
var AllProviderSets = wire.NewSet(
	DatabaseSet,
	RepositorySet,
	CryptoSet,
	AuthProviderSet,
	UserProviderSet,
	ProjectProviderSet,
	TestProviderSet,
	K8sProviderSet,
	StorageProviderSet,
)

// InitializeApp creates and wires all application dependencies.
// This is the main entry point for Wire to generate dependency injection code.
func InitializeApp(ctx context.Context, dbConfig *database.Config, appConfig *AppConfig, logger *zap.Logger) (*AppDependencies, func(), error) {
	wire.Build(AllProviderSets, wire.Struct(new(AppDependencies), "*"))
	return nil, nil, nil
}
