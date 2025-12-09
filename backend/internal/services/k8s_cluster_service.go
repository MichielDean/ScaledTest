package services

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/MichielDean/ScaledTest/backend/internal/crypto"
	"github.com/MichielDean/ScaledTest/backend/internal/models"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

// K8sClusterService handles K8s cluster configuration operations
type K8sClusterService struct {
	db            *pgxpool.Pool
	logger        *zap.Logger
	encryptionSvc *crypto.EncryptionService
}

// NewK8sClusterService creates a new K8s cluster service
func NewK8sClusterService(db *pgxpool.Pool, logger *zap.Logger, encryptionSvc *crypto.EncryptionService) *K8sClusterService {
	return &K8sClusterService{
		db:            db,
		logger:        logger,
		encryptionSvc: encryptionSvc,
	}
}

// CreateCluster creates a new K8s cluster configuration
func (s *K8sClusterService) CreateCluster(ctx context.Context, cluster *models.K8sCluster, credentials *models.K8sClusterCredentials) (*models.K8sCluster, error) {
	// Encrypt sensitive fields
	var encryptedToken, encryptedCert, encryptedKey, encryptedCA, encryptedKubeconfig *string

	if credentials.BearerToken != "" {
		encrypted, err := s.encryptionSvc.Encrypt(credentials.BearerToken)
		if err != nil {
			return nil, fmt.Errorf("failed to encrypt bearer token: %w", err)
		}
		encryptedToken = &encrypted
	}

	if credentials.ClientCertificate != "" {
		encrypted, err := s.encryptionSvc.Encrypt(credentials.ClientCertificate)
		if err != nil {
			return nil, fmt.Errorf("failed to encrypt client certificate: %w", err)
		}
		encryptedCert = &encrypted
	}

	if credentials.ClientKey != "" {
		encrypted, err := s.encryptionSvc.Encrypt(credentials.ClientKey)
		if err != nil {
			return nil, fmt.Errorf("failed to encrypt client key: %w", err)
		}
		encryptedKey = &encrypted
	}

	if credentials.CACertificate != "" {
		encrypted, err := s.encryptionSvc.Encrypt(credentials.CACertificate)
		if err != nil {
			return nil, fmt.Errorf("failed to encrypt CA certificate: %w", err)
		}
		encryptedCA = &encrypted
	}

	if credentials.Kubeconfig != "" {
		encrypted, err := s.encryptionSvc.Encrypt(credentials.Kubeconfig)
		if err != nil {
			return nil, fmt.Errorf("failed to encrypt kubeconfig: %w", err)
		}
		encryptedKubeconfig = &encrypted
	}

	// If this is the default cluster, unset other defaults for the same environment first
	if cluster.IsDefault {
		_, err := s.db.Exec(ctx, `
			UPDATE public.k8s_clusters 
			SET is_default = FALSE 
			WHERE project_id = $1 AND environment = $2 AND is_default = TRUE
		`, cluster.ProjectID, cluster.Environment)
		if err != nil {
			s.logger.Warn("Failed to unset previous default cluster", zap.Error(err))
		}
	}

	// Default environment to dev if not specified
	if cluster.Environment == "" {
		cluster.Environment = models.EnvironmentDev
	}

	query := `
		INSERT INTO public.k8s_clusters (
			name, description, api_server_url, namespace, auth_type,
			bearer_token, client_certificate, client_key, ca_certificate,
			skip_tls_verify, kubeconfig, runner_config, environment, sut_config,
			is_default, is_active, project_id, created_by
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
		RETURNING id, created_at, updated_at
	`

	// Serialize runner config to JSON
	var runnerConfigJSON []byte
	if cluster.RunnerConfig != nil {
		var err error
		runnerConfigJSON, err = json.Marshal(cluster.RunnerConfig)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize runner config: %w", err)
		}
	} else {
		// Use defaults
		runnerConfigJSON, _ = json.Marshal(models.DefaultRunnerConfig())
	}

	// Serialize SUT config to JSON
	var sutConfigJSON []byte
	if cluster.SutConfig != nil {
		var err error
		sutConfigJSON, err = json.Marshal(cluster.SutConfig)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize SUT config: %w", err)
		}
	}

	err := s.db.QueryRow(ctx, query,
		cluster.Name,
		cluster.Description,
		credentials.APIServerURL,
		credentials.Namespace,
		credentials.AuthType,
		encryptedToken,
		encryptedCert,
		encryptedKey,
		encryptedCA,
		credentials.SkipTLSVerify,
		encryptedKubeconfig,
		runnerConfigJSON,
		cluster.Environment,
		sutConfigJSON,
		cluster.IsDefault,
		cluster.IsActive,
		cluster.ProjectID,
		cluster.CreatedBy,
	).Scan(&cluster.ID, &cluster.CreatedAt, &cluster.UpdatedAt)

	if err != nil {
		s.logger.Error("Failed to create K8s cluster", zap.Error(err))
		return nil, fmt.Errorf("failed to create K8s cluster: %w", err)
	}

	cluster.APIServerURL = credentials.APIServerURL
	cluster.Namespace = credentials.Namespace
	cluster.AuthType = models.K8sAuthType(credentials.AuthType)
	cluster.SkipTLSVerify = credentials.SkipTLSVerify
	cluster.ConnectionStatus = "unknown"

	s.logger.Info("K8s cluster created",
		zap.String("id", cluster.ID),
		zap.String("name", cluster.Name))

	return cluster, nil
}

// GetCluster retrieves a K8s cluster by ID
func (s *K8sClusterService) GetCluster(ctx context.Context, clusterID string) (*models.K8sCluster, error) {
	query := `
		SELECT id, name, description, api_server_url, namespace, auth_type,
		       skip_tls_verify, runner_config, environment, sut_config,
		       is_default, is_active, last_connected_at,
		       connection_status, connection_error, project_id, created_by,
		       created_at, updated_at
		FROM public.k8s_clusters
		WHERE id = $1
	`

	cluster := &models.K8sCluster{}
	var runnerConfigJSON, sutConfigJSON []byte
	err := s.db.QueryRow(ctx, query, clusterID).Scan(
		&cluster.ID,
		&cluster.Name,
		&cluster.Description,
		&cluster.APIServerURL,
		&cluster.Namespace,
		&cluster.AuthType,
		&cluster.SkipTLSVerify,
		&runnerConfigJSON,
		&cluster.Environment,
		&sutConfigJSON,
		&cluster.IsDefault,
		&cluster.IsActive,
		&cluster.LastConnectedAt,
		&cluster.ConnectionStatus,
		&cluster.ConnectionError,
		&cluster.ProjectID,
		&cluster.CreatedBy,
		&cluster.CreatedAt,
		&cluster.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to get K8s cluster: %w", err)
	}

	// Deserialize runner config
	if len(runnerConfigJSON) > 0 {
		cluster.RunnerConfig = &models.RunnerConfig{}
		if err := json.Unmarshal(runnerConfigJSON, cluster.RunnerConfig); err != nil {
			s.logger.Warn("Failed to parse runner config, using defaults", zap.Error(err))
			cluster.RunnerConfig = models.DefaultRunnerConfig()
		}
	} else {
		cluster.RunnerConfig = models.DefaultRunnerConfig()
	}

	// Deserialize SUT config
	if len(sutConfigJSON) > 0 {
		cluster.SutConfig = &models.SutConfig{}
		if err := json.Unmarshal(sutConfigJSON, cluster.SutConfig); err != nil {
			s.logger.Warn("Failed to parse SUT config", zap.Error(err))
			cluster.SutConfig = nil
		}
	}

	// Default environment if empty
	if cluster.Environment == "" {
		cluster.Environment = models.EnvironmentDev
	}

	return cluster, nil
}

// GetClusterCredentials retrieves decrypted credentials for a cluster
func (s *K8sClusterService) GetClusterCredentials(ctx context.Context, clusterID string) (*models.K8sClusterCredentials, error) {
	query := `
		SELECT api_server_url, namespace, auth_type, bearer_token,
		       client_certificate, client_key, ca_certificate,
		       skip_tls_verify, kubeconfig
		FROM public.k8s_clusters
		WHERE id = $1
	`

	var apiServerURL, namespace, authType string
	var encryptedToken, encryptedCert, encryptedKey, encryptedCA, encryptedKubeconfig *string
	var skipTLSVerify bool

	err := s.db.QueryRow(ctx, query, clusterID).Scan(
		&apiServerURL,
		&namespace,
		&authType,
		&encryptedToken,
		&encryptedCert,
		&encryptedKey,
		&encryptedCA,
		&skipTLSVerify,
		&encryptedKubeconfig,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to get cluster credentials: %w", err)
	}

	creds := &models.K8sClusterCredentials{
		APIServerURL:  apiServerURL,
		Namespace:     namespace,
		AuthType:      models.K8sAuthType(authType),
		SkipTLSVerify: skipTLSVerify,
	}

	// Decrypt fields
	if encryptedToken != nil {
		decrypted, err := s.encryptionSvc.Decrypt(*encryptedToken)
		if err != nil {
			return nil, fmt.Errorf("failed to decrypt bearer token: %w", err)
		}
		creds.BearerToken = decrypted
	}

	if encryptedCert != nil {
		decrypted, err := s.encryptionSvc.Decrypt(*encryptedCert)
		if err != nil {
			return nil, fmt.Errorf("failed to decrypt client certificate: %w", err)
		}
		creds.ClientCertificate = decrypted
	}

	if encryptedKey != nil {
		decrypted, err := s.encryptionSvc.Decrypt(*encryptedKey)
		if err != nil {
			return nil, fmt.Errorf("failed to decrypt client key: %w", err)
		}
		creds.ClientKey = decrypted
	}

	if encryptedCA != nil {
		decrypted, err := s.encryptionSvc.Decrypt(*encryptedCA)
		if err != nil {
			return nil, fmt.Errorf("failed to decrypt CA certificate: %w", err)
		}
		creds.CACertificate = decrypted
	}

	if encryptedKubeconfig != nil {
		decrypted, err := s.encryptionSvc.Decrypt(*encryptedKubeconfig)
		if err != nil {
			return nil, fmt.Errorf("failed to decrypt kubeconfig: %w", err)
		}
		creds.Kubeconfig = decrypted
	}

	return creds, nil
}

// GetDefaultCluster gets the default cluster for a project and environment
func (s *K8sClusterService) GetDefaultCluster(ctx context.Context, projectID string) (*models.K8sCluster, error) {
	return s.GetDefaultClusterForEnvironment(ctx, projectID, "")
}

// GetDefaultClusterForEnvironment gets the default cluster for a specific environment
// If environment is empty, returns any default cluster for the project
func (s *K8sClusterService) GetDefaultClusterForEnvironment(ctx context.Context, projectID string, environment models.Environment) (*models.K8sCluster, error) {
	var query string
	var args []any

	if environment != "" {
		query = `
			SELECT id, name, description, api_server_url, namespace, auth_type,
			       skip_tls_verify, runner_config, environment, sut_config,
			       is_default, is_active, last_connected_at,
			       connection_status, connection_error, project_id, created_by,
			       created_at, updated_at
			FROM public.k8s_clusters
			WHERE project_id = $1 AND environment = $2 AND is_default = TRUE AND is_active = TRUE
			LIMIT 1
		`
		args = []any{projectID, environment}
	} else {
		query = `
			SELECT id, name, description, api_server_url, namespace, auth_type,
			       skip_tls_verify, runner_config, environment, sut_config,
			       is_default, is_active, last_connected_at,
			       connection_status, connection_error, project_id, created_by,
			       created_at, updated_at
			FROM public.k8s_clusters
			WHERE project_id = $1 AND is_default = TRUE AND is_active = TRUE
			LIMIT 1
		`
		args = []any{projectID}
	}

	cluster := &models.K8sCluster{}
	var runnerConfigJSON, sutConfigJSON []byte
	err := s.db.QueryRow(ctx, query, args...).Scan(
		&cluster.ID,
		&cluster.Name,
		&cluster.Description,
		&cluster.APIServerURL,
		&cluster.Namespace,
		&cluster.AuthType,
		&cluster.SkipTLSVerify,
		&runnerConfigJSON,
		&cluster.Environment,
		&sutConfigJSON,
		&cluster.IsDefault,
		&cluster.IsActive,
		&cluster.LastConnectedAt,
		&cluster.ConnectionStatus,
		&cluster.ConnectionError,
		&cluster.ProjectID,
		&cluster.CreatedBy,
		&cluster.CreatedAt,
		&cluster.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("no default cluster configured for project: %w", err)
	}

	// Deserialize runner config
	if len(runnerConfigJSON) > 0 {
		cluster.RunnerConfig = &models.RunnerConfig{}
		if err := json.Unmarshal(runnerConfigJSON, cluster.RunnerConfig); err != nil {
			s.logger.Warn("Failed to parse runner config, using defaults", zap.Error(err))
			cluster.RunnerConfig = models.DefaultRunnerConfig()
		}
	} else {
		cluster.RunnerConfig = models.DefaultRunnerConfig()
	}

	// Deserialize SUT config
	if len(sutConfigJSON) > 0 {
		cluster.SutConfig = &models.SutConfig{}
		if err := json.Unmarshal(sutConfigJSON, cluster.SutConfig); err != nil {
			s.logger.Warn("Failed to parse SUT config", zap.Error(err))
			cluster.SutConfig = nil
		}
	}

	// Default environment if empty
	if cluster.Environment == "" {
		cluster.Environment = models.EnvironmentDev
	}

	return cluster, nil
}

// ListClusters lists all clusters for a project
func (s *K8sClusterService) ListClusters(ctx context.Context, projectID string) ([]*models.K8sCluster, error) {
	query := `
		SELECT id, name, description, api_server_url, namespace, auth_type,
		       skip_tls_verify, runner_config, environment, sut_config,
		       is_default, is_active, last_connected_at,
		       connection_status, connection_error, project_id, created_by,
		       created_at, updated_at
		FROM public.k8s_clusters
		WHERE project_id = $1
		ORDER BY environment ASC, is_default DESC, name ASC
	`

	rows, err := s.db.Query(ctx, query, projectID)
	if err != nil {
		return nil, fmt.Errorf("failed to list clusters: %w", err)
	}
	defer rows.Close()

	var clusters []*models.K8sCluster
	for rows.Next() {
		cluster := &models.K8sCluster{}
		var runnerConfigJSON, sutConfigJSON []byte
		err := rows.Scan(
			&cluster.ID,
			&cluster.Name,
			&cluster.Description,
			&cluster.APIServerURL,
			&cluster.Namespace,
			&cluster.AuthType,
			&cluster.SkipTLSVerify,
			&runnerConfigJSON,
			&cluster.Environment,
			&sutConfigJSON,
			&cluster.IsDefault,
			&cluster.IsActive,
			&cluster.LastConnectedAt,
			&cluster.ConnectionStatus,
			&cluster.ConnectionError,
			&cluster.ProjectID,
			&cluster.CreatedBy,
			&cluster.CreatedAt,
			&cluster.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan cluster: %w", err)
		}
		
		// Deserialize runner config
		if len(runnerConfigJSON) > 0 {
			cluster.RunnerConfig = &models.RunnerConfig{}
			if err := json.Unmarshal(runnerConfigJSON, cluster.RunnerConfig); err != nil {
				cluster.RunnerConfig = models.DefaultRunnerConfig()
			}
		} else {
			cluster.RunnerConfig = models.DefaultRunnerConfig()
		}

		// Deserialize SUT config
		if len(sutConfigJSON) > 0 {
			cluster.SutConfig = &models.SutConfig{}
			if err := json.Unmarshal(sutConfigJSON, cluster.SutConfig); err != nil {
				cluster.SutConfig = nil
			}
		}

		// Default environment if empty
		if cluster.Environment == "" {
			cluster.Environment = models.EnvironmentDev
		}
		
		clusters = append(clusters, cluster)
	}

	return clusters, nil
}

// UpdateClusterStatus updates the connection status of a cluster
func (s *K8sClusterService) UpdateClusterStatus(ctx context.Context, clusterID, status string, errorMsg *string) error {
	query := `
		UPDATE public.k8s_clusters
		SET connection_status = $1, connection_error = $2, last_connected_at = $3
		WHERE id = $4
	`

	var lastConnected *time.Time
	if status == "connected" {
		now := time.Now()
		lastConnected = &now
	}

	_, err := s.db.Exec(ctx, query, status, errorMsg, lastConnected, clusterID)
	if err != nil {
		return fmt.Errorf("failed to update cluster status: %w", err)
	}

	return nil
}

// SetDefaultCluster sets a cluster as the default for its project and environment
func (s *K8sClusterService) SetDefaultCluster(ctx context.Context, clusterID string) error {
	// Get the cluster to find its project and environment
	cluster, err := s.GetCluster(ctx, clusterID)
	if err != nil {
		return err
	}

	// Unset other defaults for the same environment
	_, err = s.db.Exec(ctx, `
		UPDATE public.k8s_clusters 
		SET is_default = FALSE 
		WHERE project_id = $1 AND environment = $2 AND is_default = TRUE
	`, cluster.ProjectID, cluster.Environment)
	if err != nil {
		return fmt.Errorf("failed to unset previous default: %w", err)
	}

	// Set this as default
	_, err = s.db.Exec(ctx, `
		UPDATE public.k8s_clusters 
		SET is_default = TRUE 
		WHERE id = $1
	`, clusterID)
	if err != nil {
		return fmt.Errorf("failed to set default cluster: %w", err)
	}

	return nil
}

// DeleteCluster deletes a K8s cluster configuration
func (s *K8sClusterService) DeleteCluster(ctx context.Context, clusterID string) error {
	_, err := s.db.Exec(ctx, "DELETE FROM public.k8s_clusters WHERE id = $1", clusterID)
	if err != nil {
		return fmt.Errorf("failed to delete cluster: %w", err)
	}

	s.logger.Info("K8s cluster deleted", zap.String("id", clusterID))
	return nil
}

// UpdateRunnerConfig updates the runner configuration for a cluster
func (s *K8sClusterService) UpdateRunnerConfig(ctx context.Context, clusterID string, config models.RunnerConfig) error {
	configJSON, err := json.Marshal(config)
	if err != nil {
		return fmt.Errorf("failed to marshal runner config: %w", err)
	}

	result, err := s.db.Exec(ctx, `
		UPDATE public.k8s_clusters 
		SET runner_config = $1
		WHERE id = $2
	`, configJSON, clusterID)
	if err != nil {
		return fmt.Errorf("failed to update runner config: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("cluster not found: %s", clusterID)
	}

	s.logger.Info("Runner config updated",
		zap.String("cluster_id", clusterID),
		zap.String("platform_api_url", config.PlatformAPIURL),
		zap.String("service_account", config.ServiceAccountName))
	return nil
}

// UpdateSutConfig updates the SUT configuration for a cluster
func (s *K8sClusterService) UpdateSutConfig(ctx context.Context, clusterID string, config *models.SutConfig) error {
	// Validate config if provided
	if config != nil {
		if err := config.Validate(); err != nil {
			return fmt.Errorf("invalid SUT config: %w", err)
		}
	}

	var configJSON []byte
	var err error
	if config != nil {
		configJSON, err = json.Marshal(config)
		if err != nil {
			return fmt.Errorf("failed to marshal SUT config: %w", err)
		}
	}

	result, err := s.db.Exec(ctx, `
		UPDATE public.k8s_clusters 
		SET sut_config = $1
		WHERE id = $2
	`, configJSON, clusterID)
	if err != nil {
		return fmt.Errorf("failed to update SUT config: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("cluster not found: %s", clusterID)
	}

	if config != nil {
		s.logger.Info("SUT config updated",
			zap.String("cluster_id", clusterID),
			zap.String("service_name", config.ServiceName),
			zap.String("namespace", config.Namespace),
			zap.String("internal_url", config.InternalURL()))
	} else {
		s.logger.Info("SUT config cleared", zap.String("cluster_id", clusterID))
	}
	return nil
}

// ListClustersByEnvironment lists clusters for a project filtered by environment
func (s *K8sClusterService) ListClustersByEnvironment(ctx context.Context, projectID string, environment models.Environment) ([]*models.K8sCluster, error) {
	query := `
		SELECT id, name, description, api_server_url, namespace, auth_type,
		       skip_tls_verify, runner_config, environment, sut_config,
		       is_default, is_active, last_connected_at,
		       connection_status, connection_error, project_id, created_by,
		       created_at, updated_at
		FROM public.k8s_clusters
		WHERE project_id = $1 AND environment = $2
		ORDER BY is_default DESC, name ASC
	`

	rows, err := s.db.Query(ctx, query, projectID, environment)
	if err != nil {
		return nil, fmt.Errorf("failed to list clusters: %w", err)
	}
	defer rows.Close()

	var clusters []*models.K8sCluster
	for rows.Next() {
		cluster := &models.K8sCluster{}
		var runnerConfigJSON, sutConfigJSON []byte
		err := rows.Scan(
			&cluster.ID,
			&cluster.Name,
			&cluster.Description,
			&cluster.APIServerURL,
			&cluster.Namespace,
			&cluster.AuthType,
			&cluster.SkipTLSVerify,
			&runnerConfigJSON,
			&cluster.Environment,
			&sutConfigJSON,
			&cluster.IsDefault,
			&cluster.IsActive,
			&cluster.LastConnectedAt,
			&cluster.ConnectionStatus,
			&cluster.ConnectionError,
			&cluster.ProjectID,
			&cluster.CreatedBy,
			&cluster.CreatedAt,
			&cluster.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan cluster: %w", err)
		}
		
		// Deserialize runner config
		if len(runnerConfigJSON) > 0 {
			cluster.RunnerConfig = &models.RunnerConfig{}
			if err := json.Unmarshal(runnerConfigJSON, cluster.RunnerConfig); err != nil {
				cluster.RunnerConfig = models.DefaultRunnerConfig()
			}
		} else {
			cluster.RunnerConfig = models.DefaultRunnerConfig()
		}

		// Deserialize SUT config
		if len(sutConfigJSON) > 0 {
			cluster.SutConfig = &models.SutConfig{}
			if err := json.Unmarshal(sutConfigJSON, cluster.SutConfig); err != nil {
				cluster.SutConfig = nil
			}
		}
		
		clusters = append(clusters, cluster)
	}

	return clusters, nil
}
