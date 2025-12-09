package services

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/MichielDean/ScaledTest/backend/internal/crypto"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

// ContainerRegistryService handles container registry operations
type ContainerRegistryService struct {
	db              *pgxpool.Pool
	logger          *zap.Logger
	encryptionSvc   *crypto.EncryptionService
}

// ContainerRegistry represents a container registry configuration
type ContainerRegistry struct {
	ID           string
	ProjectID    *string  // Optional - can be nil for user-level registries
	Name         string
	RegistryURL  string
	RegistryType string
	Username     *string
	AuthType     string
	LastTestedAt *time.Time
	TestStatus   *string
	TestError    *string
	CreatedBy    string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// RegistryImage represents an image from a container registry
type RegistryImage struct {
	Name string   `json:"name"`
	Tags []string `json:"tags"`
}

// NewContainerRegistryService creates a new container registry service
func NewContainerRegistryService(db *pgxpool.Pool, logger *zap.Logger, encryptionSvc *crypto.EncryptionService) *ContainerRegistryService {
	return &ContainerRegistryService{
		db:            db,
		logger:        logger,
		encryptionSvc: encryptionSvc,
	}
}

// AddContainerRegistry adds a new container registry
func (s *ContainerRegistryService) AddContainerRegistry(ctx context.Context, projectID *string, name, registryURL, registryType string, username, credentials *string, authType, createdBy string) (*ContainerRegistry, error) {
	registryID := uuid.New().String()
	now := time.Now()

	// Encrypt credentials if provided
	var encryptedCredentials []byte
	var err error
	if credentials != nil && *credentials != "" {
		encryptedCredentials, err = s.encryptionSvc.EncryptBytes([]byte(*credentials))
		if err != nil {
			return nil, fmt.Errorf("failed to encrypt credentials: %w", err)
		}
	}

	query := `
		INSERT INTO public.container_registries 
		(id, project_id, name, registry_url, registry_type, username, encrypted_credentials, auth_type, created_by, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING id, project_id, name, registry_url, registry_type, username, auth_type, created_by, created_at, updated_at
	`

	registry := &ContainerRegistry{}
	err = s.db.QueryRow(ctx, query,
		registryID, projectID, name, registryURL, registryType, username, encryptedCredentials, authType, createdBy, now, now,
	).Scan(
		&registry.ID,
		&registry.ProjectID,
		&registry.Name,
		&registry.RegistryURL,
		&registry.RegistryType,
		&registry.Username,
		&registry.AuthType,
		&registry.CreatedBy,
		&registry.CreatedAt,
		&registry.UpdatedAt,
	)

	if err != nil {
		s.logger.Error("Failed to add container registry", zap.Error(err))
		return nil, fmt.Errorf("failed to add container registry: %w", err)
	}

	s.logger.Info("Container registry added", zap.String("id", registry.ID), zap.String("name", name))
	
	// Test connection asynchronously
	go func() {
		testCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		_, _, _ = s.TestRegistryConnection(testCtx, registryID)
	}()
	
	return registry, nil
}

// GetContainerRegistry retrieves a registry by ID
func (s *ContainerRegistryService) GetContainerRegistry(ctx context.Context, registryID string) (*ContainerRegistry, error) {
	query := `
		SELECT id, project_id, name, registry_url, registry_type, username, auth_type, 
		       last_tested_at, test_status, test_error, created_by, created_at, updated_at
		FROM public.container_registries
		WHERE id = $1
	`

	registry := &ContainerRegistry{}
	err := s.db.QueryRow(ctx, query, registryID).Scan(
		&registry.ID,
		&registry.ProjectID,
		&registry.Name,
		&registry.RegistryURL,
		&registry.RegistryType,
		&registry.Username,
		&registry.AuthType,
		&registry.LastTestedAt,
		&registry.TestStatus,
		&registry.TestError,
		&registry.CreatedBy,
		&registry.CreatedAt,
		&registry.UpdatedAt,
	)

	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("registry not found: %s", registryID)
	}
	if err != nil {
		s.logger.Error("Failed to get registry", zap.Error(err), zap.String("id", registryID))
		return nil, fmt.Errorf("failed to get registry: %w", err)
	}

	return registry, nil
}

// GetRegistryCredentials retrieves and decrypts registry credentials
func (s *ContainerRegistryService) GetRegistryCredentials(ctx context.Context, registryID string) (string, error) {
	query := `
		SELECT encrypted_credentials
		FROM public.container_registries
		WHERE id = $1
	`

	var encryptedCredentials []byte
	err := s.db.QueryRow(ctx, query, registryID).Scan(&encryptedCredentials)

	if err == pgx.ErrNoRows {
		return "", fmt.Errorf("registry not found: %s", registryID)
	}
	if err != nil {
		return "", fmt.Errorf("failed to get credentials: %w", err)
	}

	if len(encryptedCredentials) == 0 {
		return "", nil
	}

	decryptedCredentials, err := s.encryptionSvc.DecryptBytes(encryptedCredentials)
	if err != nil {
		s.logger.Error("Failed to decrypt credentials", zap.Error(err), zap.String("registry_id", registryID))
		return "", fmt.Errorf("failed to decrypt credentials: %w", err)
	}

	return string(decryptedCredentials), nil
}

// ListContainerRegistries lists registries for a user
func (s *ContainerRegistryService) ListContainerRegistries(ctx context.Context, userID string, projectID *string, page, pageSize int32) ([]*ContainerRegistry, int32, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	offset := (page - 1) * pageSize

	var countQuery, listQuery string
	var countArgs, listArgs []interface{}

	if projectID != nil {
		// Project-specific registries
		countQuery = `SELECT COUNT(*) FROM public.container_registries WHERE project_id = $1`
		countArgs = []interface{}{*projectID}
		
		listQuery = `
			SELECT id, project_id, name, registry_url, registry_type, username, auth_type,
			       last_tested_at, test_status, test_error, created_by, created_at, updated_at
			FROM public.container_registries
			WHERE project_id = $1
			ORDER BY created_at DESC
			LIMIT $2 OFFSET $3
		`
		listArgs = []interface{}{*projectID, pageSize, offset}
	} else {
		// User-level registries (no project association)
		countQuery = `SELECT COUNT(*) FROM public.container_registries WHERE created_by = $1`
		countArgs = []interface{}{userID}
		
		listQuery = `
			SELECT id, project_id, name, registry_url, registry_type, username, auth_type,
			       last_tested_at, test_status, test_error, created_by, created_at, updated_at
			FROM public.container_registries
			WHERE created_by = $1
			ORDER BY created_at DESC
			LIMIT $2 OFFSET $3
		`
		listArgs = []interface{}{userID, pageSize, offset}
	}

	// Get total count
	var totalCount int32
	err := s.db.QueryRow(ctx, countQuery, countArgs...).Scan(&totalCount)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count registries: %w", err)
	}

	// Get registries
	rows, err := s.db.Query(ctx, listQuery, listArgs...)
	if err != nil {
		s.logger.Error("Failed to list registries", zap.Error(err))
		return nil, 0, fmt.Errorf("failed to list registries: %w", err)
	}
	defer rows.Close()

	var registries []*ContainerRegistry
	for rows.Next() {
		registry := &ContainerRegistry{}
		err := rows.Scan(
			&registry.ID,
			&registry.ProjectID,
			&registry.Name,
			&registry.RegistryURL,
			&registry.RegistryType,
			&registry.Username,
			&registry.AuthType,
			&registry.LastTestedAt,
			&registry.TestStatus,
			&registry.TestError,
			&registry.CreatedBy,
			&registry.CreatedAt,
			&registry.UpdatedAt,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan registry: %w", err)
		}

		registries = append(registries, registry)
	}

	if err = rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("error iterating registries: %w", err)
	}

	return registries, totalCount, nil
}

// UpdateContainerRegistry updates registry configuration
func (s *ContainerRegistryService) UpdateContainerRegistry(ctx context.Context, registryID string, name, username, credentials *string) (*ContainerRegistry, error) {
	query := `UPDATE public.container_registries SET updated_at = $1`
	args := []interface{}{time.Now()}
	argIndex := 2

	if name != nil {
		query += fmt.Sprintf(", name = $%d", argIndex)
		args = append(args, *name)
		argIndex++
	}

	if username != nil {
		query += fmt.Sprintf(", username = $%d", argIndex)
		args = append(args, *username)
		argIndex++
	}

	if credentials != nil && *credentials != "" {
		encryptedCredentials, err := s.encryptionSvc.EncryptBytes([]byte(*credentials))
		if err != nil {
			return nil, fmt.Errorf("failed to encrypt credentials: %w", err)
		}
		query += fmt.Sprintf(", encrypted_credentials = $%d", argIndex)
		args = append(args, encryptedCredentials)
		argIndex++
	}

	query += fmt.Sprintf(" WHERE id = $%d", argIndex)
	args = append(args, registryID)

	result, err := s.db.Exec(ctx, query, args...)
	if err != nil {
		s.logger.Error("Failed to update registry", zap.Error(err), zap.String("id", registryID))
		return nil, fmt.Errorf("failed to update registry: %w", err)
	}

	if result.RowsAffected() == 0 {
		return nil, fmt.Errorf("registry not found: %s", registryID)
	}

	return s.GetContainerRegistry(ctx, registryID)
}

// TestRegistryConnection tests connectivity to a registry using Docker Registry HTTP API V2
func (s *ContainerRegistryService) TestRegistryConnection(ctx context.Context, registryID string) (bool, string, error) {
	now := time.Now()
	
	// Get registry details
	registry, err := s.GetContainerRegistry(ctx, registryID)
	if err != nil {
		return false, "", err
	}

	// Get credentials
	credentials, err := s.GetRegistryCredentials(ctx, registryID)
	if err != nil {
		return false, "", err
	}

	s.logger.Info("Testing registry connection", 
		zap.String("registry_id", registryID),
		zap.String("url", registry.RegistryURL),
		zap.String("type", registry.RegistryType))

	// Test connection based on registry type
	var testErr error
	switch registry.RegistryType {
	case "docker-registry", "dockerhub", "ghcr", "generic":
		testErr = s.testDockerRegistryV2(ctx, registry, credentials)
	default:
		testErr = fmt.Errorf("unsupported registry type: %s", registry.RegistryType)
	}

	// Update test status in database
	var testStatus string
	var testError *string
	var successMsg string

	if testErr != nil {
		testStatus = "failed"
		errMsg := testErr.Error()
		testError = &errMsg
		s.logger.Error("Registry connection test failed", zap.Error(testErr))
	} else {
		testStatus = "success"
		successMsg = fmt.Sprintf("Successfully connected to registry %s", registry.RegistryURL)
		if credentials != "" {
			successMsg += " with authentication"
		}
	}

	query := `
		UPDATE public.container_registries
		SET last_tested_at = $1, test_status = $2, test_error = $3, updated_at = $4
		WHERE id = $5
	`

	_, err = s.db.Exec(ctx, query, now, testStatus, testError, now, registryID)
	if err != nil {
		s.logger.Error("Failed to update test status", zap.Error(err))
		return false, "", fmt.Errorf("failed to update test status: %w", err)
	}

	if testErr != nil {
		return false, "", testErr
	}

	return true, successMsg, nil
}

// testDockerRegistryV2 tests Docker Registry HTTP API V2 connection
func (s *ContainerRegistryService) testDockerRegistryV2(ctx context.Context, registry *ContainerRegistry, credentials string) error {
	// Construct base URL
	baseURL := registry.RegistryURL
	if !strings.HasPrefix(baseURL, "http://") && !strings.HasPrefix(baseURL, "https://") {
		if strings.Contains(baseURL, "localhost") || strings.Contains(baseURL, "127.0.0.1") {
			baseURL = "http://" + baseURL
		} else {
			baseURL = "https://" + baseURL
		}
	}

	// Try to access /v2/ endpoint
	url := strings.TrimSuffix(baseURL, "/") + "/v2/"

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	// Add authentication if available
	if registry.AuthType == "basic" && registry.Username != nil && credentials != "" {
		req.SetBasicAuth(*registry.Username, credentials)
	} else if registry.AuthType == "token" && credentials != "" {
		req.Header.Set("Authorization", "Bearer "+credentials)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to connect to registry: %w", err)
	}
	defer resp.Body.Close()

	// Accept both 200 OK and 401 Unauthorized (401 means registry exists but needs auth)
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusUnauthorized {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("registry returned status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

// SyncRegistryImages lists available images from a registry
func (s *ContainerRegistryService) SyncRegistryImages(ctx context.Context, registryID string) ([]*RegistryImage, error) {
	registry, err := s.GetContainerRegistry(ctx, registryID)
	if err != nil {
		return nil, err
	}

	// Get credentials
	credentials, err := s.GetRegistryCredentials(ctx, registryID)
	if err != nil {
		return nil, err
	}

	// Sync based on registry type
	switch registry.RegistryType {
	case "docker-registry", "dockerhub", "ghcr", "generic":
		return s.syncDockerRegistryV2(ctx, registry, credentials)
	default:
		return nil, fmt.Errorf("unsupported registry type: %s", registry.RegistryType)
	}
}

// syncDockerRegistryV2 lists images from Docker Registry HTTP API V2
func (s *ContainerRegistryService) syncDockerRegistryV2(ctx context.Context, registry *ContainerRegistry, credentials string) ([]*RegistryImage, error) {
	baseURL := registry.RegistryURL
	if !strings.HasPrefix(baseURL, "http://") && !strings.HasPrefix(baseURL, "https://") {
		if strings.Contains(baseURL, "localhost") || strings.Contains(baseURL, "127.0.0.1") {
			baseURL = "http://" + baseURL
		} else {
			baseURL = "https://" + baseURL
		}
	}

	// List catalog
	catalogURL := strings.TrimSuffix(baseURL, "/") + "/v2/_catalog"

	req, err := http.NewRequestWithContext(ctx, "GET", catalogURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Add authentication
	if registry.AuthType == "basic" && registry.Username != nil && credentials != "" {
		req.SetBasicAuth(*registry.Username, credentials)
	} else if registry.AuthType == "token" && credentials != "" {
		req.Header.Set("Authorization", "Bearer "+credentials)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to list catalog: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("registry returned status %d: %s", resp.StatusCode, string(body))
	}

	var catalogResp struct {
		Repositories []string `json:"repositories"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&catalogResp); err != nil {
		return nil, fmt.Errorf("failed to decode catalog: %w", err)
	}

	// For each repository, list tags
	var images []*RegistryImage
	for _, repo := range catalogResp.Repositories {
		tagsURL := strings.TrimSuffix(baseURL, "/") + "/v2/" + repo + "/tags/list"

		tagsReq, err := http.NewRequestWithContext(ctx, "GET", tagsURL, nil)
		if err != nil {
			s.logger.Warn("Failed to create tags request", zap.String("repo", repo), zap.Error(err))
			continue
		}

		// Add authentication
		if registry.AuthType == "basic" && registry.Username != nil && credentials != "" {
			tagsReq.SetBasicAuth(*registry.Username, credentials)
		} else if registry.AuthType == "token" && credentials != "" {
			tagsReq.Header.Set("Authorization", "Bearer "+credentials)
		}

		tagsResp, err := client.Do(tagsReq)
		if err != nil {
			s.logger.Warn("Failed to list tags", zap.String("repo", repo), zap.Error(err))
			continue
		}

		if tagsResp.StatusCode == http.StatusOK {
			var tagsData struct {
				Name string   `json:"name"`
				Tags []string `json:"tags"`
			}
			if err := json.NewDecoder(tagsResp.Body).Decode(&tagsData); err == nil && len(tagsData.Tags) > 0 {
				images = append(images, &RegistryImage{
					Name: repo,
					Tags: tagsData.Tags,
				})
			}
		}
		tagsResp.Body.Close()
	}

	s.logger.Info("Synced images from registry",
		zap.String("registry_id", registry.ID),
		zap.Int("image_count", len(images)),
	)

	return images, nil
}

// DeleteContainerRegistry deletes a registry
func (s *ContainerRegistryService) DeleteContainerRegistry(ctx context.Context, registryID string) error {
	query := `DELETE FROM public.container_registries WHERE id = $1`

	result, err := s.db.Exec(ctx, query, registryID)
	if err != nil {
		s.logger.Error("Failed to delete registry", zap.Error(err), zap.String("id", registryID))
		return fmt.Errorf("failed to delete registry: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("registry not found: %s", registryID)
	}

	s.logger.Info("Registry deleted", zap.String("id", registryID))
	return nil
}
