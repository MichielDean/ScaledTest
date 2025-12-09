package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/MichielDean/ScaledTest/backend/internal/database"
	"github.com/MichielDean/ScaledTest/backend/internal/models"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// PostgresClusterRepository handles persistence for K8s clusters using PostgreSQL.
// It implements the ClusterRepository interface.
type PostgresClusterRepository struct {
	db database.Executor
}

// NewPostgresClusterRepository creates a new PostgreSQL cluster repository.
func NewPostgresClusterRepository(db database.Executor) *PostgresClusterRepository {
	return &PostgresClusterRepository{db: db}
}

// Create inserts a new K8s cluster
func (r *PostgresClusterRepository) Create(ctx context.Context, cluster *models.K8sCluster, creds *models.K8sClusterCredentials) (*models.K8sCluster, error) {
	if cluster.ID == "" {
		cluster.ID = uuid.New().String()
	}
	now := time.Now()
	cluster.CreatedAt = now
	cluster.UpdatedAt = now

	// If this is the default cluster, unset other defaults for the same environment
	if cluster.IsDefault && cluster.ProjectID != nil {
		_, _ = r.db.Exec(ctx, `
			UPDATE public.k8s_clusters 
			SET is_default = FALSE 
			WHERE project_id = $1 AND environment = $2 AND is_default = TRUE
		`, cluster.ProjectID, cluster.Environment)
	}

	// Default environment
	if cluster.Environment == "" {
		cluster.Environment = models.EnvironmentDev
	}

	// Serialize configs to JSON
	var runnerConfigJSON, sutConfigJSON []byte
	var err error

	if cluster.RunnerConfig != nil {
		runnerConfigJSON, err = json.Marshal(cluster.RunnerConfig)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize runner config: %w", err)
		}
	} else {
		runnerConfigJSON, _ = json.Marshal(models.DefaultRunnerConfig())
	}

	if cluster.SutConfig != nil {
		sutConfigJSON, err = json.Marshal(cluster.SutConfig)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize SUT config: %w", err)
		}
	}

	query := `
		INSERT INTO public.k8s_clusters (
			id, name, description, api_server_url, namespace, auth_type,
			bearer_token, client_certificate, client_key, ca_certificate,
			skip_tls_verify, kubeconfig, runner_config, environment, sut_config,
			is_default, is_active, project_id, created_by, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
		RETURNING id, created_at, updated_at
	`

	// Note: Credentials should be encrypted before storing - this is handled by the service layer
	err = r.db.QueryRow(ctx, query,
		cluster.ID,
		cluster.Name,
		cluster.Description,
		creds.APIServerURL,
		creds.Namespace,
		creds.AuthType,
		nilIfEmpty(creds.BearerToken),
		nilIfEmpty(creds.ClientCertificate),
		nilIfEmpty(creds.ClientKey),
		nilIfEmpty(creds.CACertificate),
		creds.SkipTLSVerify,
		nilIfEmpty(creds.Kubeconfig),
		runnerConfigJSON,
		cluster.Environment,
		sutConfigJSON,
		cluster.IsDefault,
		cluster.IsActive,
		cluster.ProjectID,
		cluster.CreatedBy,
		cluster.CreatedAt,
		cluster.UpdatedAt,
	).Scan(&cluster.ID, &cluster.CreatedAt, &cluster.UpdatedAt)

	if err != nil {
		return nil, fmt.Errorf("failed to create cluster: %w", err)
	}

	cluster.APIServerURL = creds.APIServerURL
	cluster.Namespace = creds.Namespace
	cluster.AuthType = creds.AuthType
	cluster.SkipTLSVerify = creds.SkipTLSVerify
	cluster.ConnectionStatus = "unknown"

	return cluster, nil
}

// GetByID retrieves a cluster by ID (without credentials)
func (r *PostgresClusterRepository) GetByID(ctx context.Context, id string) (*models.K8sCluster, error) {
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
	var authTypeStr string

	err := r.db.QueryRow(ctx, query, id).Scan(
		&cluster.ID,
		&cluster.Name,
		&cluster.Description,
		&cluster.APIServerURL,
		&cluster.Namespace,
		&authTypeStr,
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
		return nil, fmt.Errorf("cluster not found: %w", err)
	}

	cluster.AuthType = models.K8sAuthType(authTypeStr)

	// Deserialize configs
	if len(runnerConfigJSON) > 0 {
		cluster.RunnerConfig = &models.RunnerConfig{}
		if err := json.Unmarshal(runnerConfigJSON, cluster.RunnerConfig); err != nil {
			cluster.RunnerConfig = models.DefaultRunnerConfig()
		}
	} else {
		cluster.RunnerConfig = models.DefaultRunnerConfig()
	}

	if len(sutConfigJSON) > 0 {
		cluster.SutConfig = &models.SutConfig{}
		if err := json.Unmarshal(sutConfigJSON, cluster.SutConfig); err != nil {
			cluster.SutConfig = nil
		}
	}

	if cluster.Environment == "" {
		cluster.Environment = models.EnvironmentDev
	}

	return cluster, nil
}

// GetCredentials retrieves encrypted credentials for a cluster
// Note: The service layer should decrypt these
func (r *PostgresClusterRepository) GetCredentials(ctx context.Context, id string) (*models.K8sClusterCredentials, error) {
	query := `
		SELECT api_server_url, namespace, auth_type, bearer_token,
		       client_certificate, client_key, ca_certificate,
		       skip_tls_verify, kubeconfig
		FROM public.k8s_clusters
		WHERE id = $1
	`

	creds := &models.K8sClusterCredentials{}
	var authTypeStr string
	var bearerToken, clientCert, clientKey, caCert, kubeconfig *string

	err := r.db.QueryRow(ctx, query, id).Scan(
		&creds.APIServerURL,
		&creds.Namespace,
		&authTypeStr,
		&bearerToken,
		&clientCert,
		&clientKey,
		&caCert,
		&creds.SkipTLSVerify,
		&kubeconfig,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to get cluster credentials: %w", err)
	}

	creds.AuthType = models.K8sAuthType(authTypeStr)
	if bearerToken != nil {
		creds.BearerToken = *bearerToken
	}
	if clientCert != nil {
		creds.ClientCertificate = *clientCert
	}
	if clientKey != nil {
		creds.ClientKey = *clientKey
	}
	if caCert != nil {
		creds.CACertificate = *caCert
	}
	if kubeconfig != nil {
		creds.Kubeconfig = *kubeconfig
	}

	return creds, nil
}

// ListByProject retrieves all clusters for a project
func (r *PostgresClusterRepository) ListByProject(ctx context.Context, projectID string) ([]*models.K8sCluster, error) {
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

	rows, err := r.db.Query(ctx, query, projectID)
	if err != nil {
		return nil, fmt.Errorf("failed to list clusters: %w", err)
	}
	defer rows.Close()

	return r.scanClusters(rows)
}

// ListByEnvironment retrieves clusters for a project filtered by environment
func (r *PostgresClusterRepository) ListByEnvironment(ctx context.Context, projectID string, env models.Environment) ([]*models.K8sCluster, error) {
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

	rows, err := r.db.Query(ctx, query, projectID, env)
	if err != nil {
		return nil, fmt.Errorf("failed to list clusters: %w", err)
	}
	defer rows.Close()

	return r.scanClusters(rows)
}

// GetDefault retrieves the default cluster for a project (optionally filtered by environment)
func (r *PostgresClusterRepository) GetDefault(ctx context.Context, projectID string, env *models.Environment) (*models.K8sCluster, error) {
	var query string
	var args []interface{}

	if env != nil {
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
		args = []interface{}{projectID, *env}
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
		args = []interface{}{projectID}
	}

	cluster := &models.K8sCluster{}
	var runnerConfigJSON, sutConfigJSON []byte
	var authTypeStr string

	err := r.db.QueryRow(ctx, query, args...).Scan(
		&cluster.ID,
		&cluster.Name,
		&cluster.Description,
		&cluster.APIServerURL,
		&cluster.Namespace,
		&authTypeStr,
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
		return nil, fmt.Errorf("no default cluster configured: %w", err)
	}

	cluster.AuthType = models.K8sAuthType(authTypeStr)

	if len(runnerConfigJSON) > 0 {
		cluster.RunnerConfig = &models.RunnerConfig{}
		json.Unmarshal(runnerConfigJSON, cluster.RunnerConfig)
	} else {
		cluster.RunnerConfig = models.DefaultRunnerConfig()
	}

	if len(sutConfigJSON) > 0 {
		cluster.SutConfig = &models.SutConfig{}
		json.Unmarshal(sutConfigJSON, cluster.SutConfig)
	}

	if cluster.Environment == "" {
		cluster.Environment = models.EnvironmentDev
	}

	return cluster, nil
}

// UpdateStatus updates the connection status of a cluster
func (r *PostgresClusterRepository) UpdateStatus(ctx context.Context, id, status string, errorMsg *string) error {
	var lastConnected *time.Time
	if status == "connected" {
		now := time.Now()
		lastConnected = &now
	}

	query := `
		UPDATE public.k8s_clusters
		SET connection_status = $1, connection_error = $2, last_connected_at = $3, updated_at = NOW()
		WHERE id = $4
	`

	_, err := r.db.Exec(ctx, query, status, errorMsg, lastConnected, id)
	if err != nil {
		return fmt.Errorf("failed to update cluster status: %w", err)
	}

	return nil
}

// SetDefault sets a cluster as the default for its environment
func (r *PostgresClusterRepository) SetDefault(ctx context.Context, id string) error {
	// Get the cluster to find its project and environment
	cluster, err := r.GetByID(ctx, id)
	if err != nil {
		return err
	}

	// Unset other defaults for the same environment
	_, err = r.db.Exec(ctx, `
		UPDATE public.k8s_clusters 
		SET is_default = FALSE, updated_at = NOW()
		WHERE project_id = $1 AND environment = $2 AND is_default = TRUE
	`, cluster.ProjectID, cluster.Environment)
	if err != nil {
		return fmt.Errorf("failed to unset previous default: %w", err)
	}

	// Set this as default
	_, err = r.db.Exec(ctx, `
		UPDATE public.k8s_clusters 
		SET is_default = TRUE, updated_at = NOW()
		WHERE id = $1
	`, id)
	if err != nil {
		return fmt.Errorf("failed to set default cluster: %w", err)
	}

	return nil
}

// UpdateRunnerConfig updates the runner configuration for a cluster
func (r *PostgresClusterRepository) UpdateRunnerConfig(ctx context.Context, id string, config *models.RunnerConfig) error {
	configJSON, err := json.Marshal(config)
	if err != nil {
		return fmt.Errorf("failed to marshal runner config: %w", err)
	}

	result, err := r.db.Exec(ctx, `
		UPDATE public.k8s_clusters 
		SET runner_config = $1, updated_at = NOW()
		WHERE id = $2
	`, configJSON, id)
	if err != nil {
		return fmt.Errorf("failed to update runner config: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("cluster not found: %s", id)
	}

	return nil
}

// UpdateSutConfig updates the SUT configuration for a cluster
func (r *PostgresClusterRepository) UpdateSutConfig(ctx context.Context, id string, config *models.SutConfig) error {
	var configJSON []byte
	var err error
	if config != nil {
		configJSON, err = json.Marshal(config)
		if err != nil {
			return fmt.Errorf("failed to marshal SUT config: %w", err)
		}
	}

	result, err := r.db.Exec(ctx, `
		UPDATE public.k8s_clusters 
		SET sut_config = $1, updated_at = NOW()
		WHERE id = $2
	`, configJSON, id)
	if err != nil {
		return fmt.Errorf("failed to update SUT config: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("cluster not found: %s", id)
	}

	return nil
}

// Delete removes a cluster by ID
func (r *PostgresClusterRepository) Delete(ctx context.Context, id string) error {
	result, err := r.db.Exec(ctx, "DELETE FROM public.k8s_clusters WHERE id = $1", id)
	if err != nil {
		return fmt.Errorf("failed to delete cluster: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("cluster not found: %s", id)
	}

	return nil
}

// scanClusters is a helper to scan multiple cluster rows
func (r *PostgresClusterRepository) scanClusters(rows pgx.Rows) ([]*models.K8sCluster, error) {
	var clusters []*models.K8sCluster

	for rows.Next() {
		cluster := &models.K8sCluster{}
		var runnerConfigJSON, sutConfigJSON []byte
		var authTypeStr string

		err := rows.Scan(
			&cluster.ID,
			&cluster.Name,
			&cluster.Description,
			&cluster.APIServerURL,
			&cluster.Namespace,
			&authTypeStr,
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

		cluster.AuthType = models.K8sAuthType(authTypeStr)

		if len(runnerConfigJSON) > 0 {
			cluster.RunnerConfig = &models.RunnerConfig{}
			json.Unmarshal(runnerConfigJSON, cluster.RunnerConfig)
		} else {
			cluster.RunnerConfig = models.DefaultRunnerConfig()
		}

		if len(sutConfigJSON) > 0 {
			cluster.SutConfig = &models.SutConfig{}
			json.Unmarshal(sutConfigJSON, cluster.SutConfig)
		}

		if cluster.Environment == "" {
			cluster.Environment = models.EnvironmentDev
		}

		clusters = append(clusters, cluster)
	}

	return clusters, nil
}

// nilIfEmpty returns nil if the string is empty, otherwise returns a pointer to it
func nilIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
