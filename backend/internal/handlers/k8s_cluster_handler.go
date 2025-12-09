package handlers

import (
	"context"
	"time"

	"github.com/MichielDean/ScaledTest/backend/internal/k8s"
	"github.com/MichielDean/ScaledTest/backend/internal/models"
	"github.com/MichielDean/ScaledTest/backend/internal/services"
	"github.com/gofiber/fiber/v2"
	"go.uber.org/zap"
)

// K8sClusterHandler handles K8s cluster configuration REST endpoints
type K8sClusterHandler struct {
	clusterService services.ClusterManager
	logger         *zap.Logger
}

// NewK8sClusterHandler creates a new K8s cluster handler
func NewK8sClusterHandler(clusterService services.ClusterManager, logger *zap.Logger) *K8sClusterHandler {
	return &K8sClusterHandler{
		clusterService: clusterService,
		logger:         logger,
	}
}

// CreateClusterRequest represents a request to create a K8s cluster
type CreateClusterRequest struct {
	Name              string                    `json:"name"`
	Description       *string                   `json:"description,omitempty"`
	APIServerURL      string                    `json:"api_server_url"`
	Namespace         string                    `json:"namespace"`
	AuthType          string                    `json:"auth_type"` // "token", "certificate", "kubeconfig"
	BearerToken       *string                   `json:"bearer_token,omitempty"`
	ClientCertificate *string                   `json:"client_certificate,omitempty"`
	ClientKey         *string                   `json:"client_key,omitempty"`
	CACertificate     *string                   `json:"ca_certificate,omitempty"`
	SkipTLSVerify     bool                      `json:"skip_tls_verify"`
	Kubeconfig        *string                   `json:"kubeconfig,omitempty"`
	IsDefault         bool                      `json:"is_default"`
	ProjectID         string                    `json:"project_id"`
	Environment       models.Environment        `json:"environment,omitempty"` // dev, staging, prod, custom
	SutConfig         *models.SutConfig         `json:"sut_config,omitempty"`  // SUT config for same-cluster testing
	RunnerConfig      *models.RunnerConfig      `json:"runner_config,omitempty"`
}

// CreateClusterResponse represents the response after creating a cluster
type CreateClusterResponse struct {
	Success bool                `json:"success"`
	Cluster *models.K8sCluster  `json:"cluster"`
	Message string              `json:"message,omitempty"`
}

// ListClustersResponse represents the response for listing clusters
type ListClustersResponse struct {
	Success  bool                   `json:"success"`
	Clusters []*models.K8sCluster   `json:"clusters"`
	Total    int                    `json:"total"`
}

// TestConnectionResponse represents the response for a connection test
type TestConnectionResponse struct {
	Success   bool    `json:"success"`
	Connected bool    `json:"connected"`
	Message   string  `json:"message"`
	Error     *string `json:"error,omitempty"`
}

// CreateCluster handles POST /api/k8s/clusters
func (h *K8sClusterHandler) CreateCluster(c *fiber.Ctx) error {
	var req CreateClusterRequest
	if err := c.BodyParser(&req); err != nil {
		h.logger.Warn("Invalid create cluster request", zap.Error(err))
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"error":   "Invalid request body",
		})
	}

	// Validate required fields
	if req.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"error":   "Cluster name is required",
		})
	}

	if req.ProjectID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"error":   "Project ID is required",
		})
	}

	if req.AuthType == "" {
		req.AuthType = "token"
	}

	// Validate auth type and required credentials
	switch req.AuthType {
	case "token":
		if req.APIServerURL == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"error":   "API server URL is required for token auth",
			})
		}
		if req.BearerToken == nil || *req.BearerToken == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"error":   "Bearer token is required for token auth",
			})
		}
	case "certificate":
		if req.APIServerURL == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"error":   "API server URL is required for certificate auth",
			})
		}
		if req.ClientCertificate == nil || *req.ClientCertificate == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"error":   "Client certificate is required for certificate auth",
			})
		}
		if req.ClientKey == nil || *req.ClientKey == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"error":   "Client key is required for certificate auth",
			})
		}
	case "kubeconfig":
		if req.Kubeconfig == nil || *req.Kubeconfig == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"error":   "Kubeconfig is required for kubeconfig auth",
			})
		}
	default:
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"error":   "Invalid auth type. Must be 'token', 'certificate', or 'kubeconfig'",
		})
	}

	// Get user ID from context
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"success": false,
			"error":   "Authentication required",
		})
	}

	namespace := req.Namespace
	if namespace == "" {
		namespace = "default"
	}

	// Default environment to dev if not specified
	environment := req.Environment
	if environment == "" {
		environment = models.EnvironmentDev
	}

	// Validate SUT config if provided
	if req.SutConfig != nil {
		if err := req.SutConfig.Validate(); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"error":   err.Error(),
			})
		}
	}

	// Create cluster and credentials
	cluster := &models.K8sCluster{
		Name:         req.Name,
		Description:  req.Description,
		IsDefault:    req.IsDefault,
		IsActive:     true,
		ProjectID:    &req.ProjectID,
		CreatedBy:    userID,
		Environment:  environment,
		SutConfig:    req.SutConfig,
		RunnerConfig: req.RunnerConfig,
	}

	credentials := &models.K8sClusterCredentials{
		APIServerURL:  req.APIServerURL,
		Namespace:     namespace,
		AuthType:      models.K8sAuthType(req.AuthType),
		SkipTLSVerify: req.SkipTLSVerify,
	}

	if req.BearerToken != nil {
		credentials.BearerToken = *req.BearerToken
	}
	if req.ClientCertificate != nil {
		credentials.ClientCertificate = *req.ClientCertificate
	}
	if req.ClientKey != nil {
		credentials.ClientKey = *req.ClientKey
	}
	if req.CACertificate != nil {
		credentials.CACertificate = *req.CACertificate
	}
	if req.Kubeconfig != nil {
		credentials.Kubeconfig = *req.Kubeconfig
	}

	createdCluster, err := h.clusterService.CreateCluster(c.Context(), cluster, credentials)
	if err != nil {
		h.logger.Error("Failed to create K8s cluster", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"error":   "Failed to create cluster",
		})
	}

	h.logger.Info("K8s cluster created",
		zap.String("id", createdCluster.ID),
		zap.String("name", createdCluster.Name),
		zap.String("projectId", req.ProjectID))

	return c.Status(fiber.StatusCreated).JSON(CreateClusterResponse{
		Success: true,
		Cluster: createdCluster,
		Message: "Cluster created successfully",
	})
}

// GetCluster handles GET /api/k8s/clusters/:id
func (h *K8sClusterHandler) GetCluster(c *fiber.Ctx) error {
	clusterID := c.Params("id")
	if clusterID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"error":   "Cluster ID is required",
		})
	}

	cluster, err := h.clusterService.GetCluster(c.Context(), clusterID)
	if err != nil {
		h.logger.Warn("Cluster not found", zap.String("id", clusterID), zap.Error(err))
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"error":   "Cluster not found",
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"cluster": cluster,
	})
}

// ListClusters handles GET /api/k8s/clusters?project_id=xxx
func (h *K8sClusterHandler) ListClusters(c *fiber.Ctx) error {
	projectID := c.Query("project_id")
	if projectID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"error":   "Project ID is required",
		})
	}

	clusters, err := h.clusterService.ListClusters(c.Context(), projectID)
	if err != nil {
		h.logger.Error("Failed to list clusters", zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"error":   "Failed to list clusters",
		})
	}

	if clusters == nil {
		clusters = []*models.K8sCluster{}
	}

	return c.JSON(ListClustersResponse{
		Success:  true,
		Clusters: clusters,
		Total:    len(clusters),
	})
}

// DeleteCluster handles DELETE /api/k8s/clusters/:id
func (h *K8sClusterHandler) DeleteCluster(c *fiber.Ctx) error {
	clusterID := c.Params("id")
	if clusterID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"error":   "Cluster ID is required",
		})
	}

	err := h.clusterService.DeleteCluster(c.Context(), clusterID)
	if err != nil {
		h.logger.Error("Failed to delete cluster", zap.String("id", clusterID), zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"error":   "Failed to delete cluster",
		})
	}

	h.logger.Info("K8s cluster deleted", zap.String("id", clusterID))

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Cluster deleted successfully",
	})
}

// SetDefaultCluster handles POST /api/k8s/clusters/:id/set-default
func (h *K8sClusterHandler) SetDefaultCluster(c *fiber.Ctx) error {
	clusterID := c.Params("id")
	if clusterID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"error":   "Cluster ID is required",
		})
	}

	err := h.clusterService.SetDefaultCluster(c.Context(), clusterID)
	if err != nil {
		h.logger.Error("Failed to set default cluster", zap.String("id", clusterID), zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"error":   "Failed to set default cluster",
		})
	}

	h.logger.Info("K8s cluster set as default", zap.String("id", clusterID))

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Cluster set as default",
	})
}

// TestConnection handles POST /api/k8s/clusters/:id/test-connection
func (h *K8sClusterHandler) TestConnection(c *fiber.Ctx) error {
	clusterID := c.Params("id")
	if clusterID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(TestConnectionResponse{
			Success:   false,
			Connected: false,
			Message:   "Cluster ID is required",
		})
	}

	// Get cluster credentials
	creds, err := h.clusterService.GetClusterCredentials(c.Context(), clusterID)
	if err != nil {
		h.logger.Error("Failed to get cluster credentials", zap.String("id", clusterID), zap.Error(err))
		errMsg := err.Error()
		return c.Status(fiber.StatusInternalServerError).JSON(TestConnectionResponse{
			Success:   false,
			Connected: false,
			Message:   "Failed to get cluster credentials",
			Error:     &errMsg,
		})
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
		h.logger.Error("Failed to create JobManager", zap.String("id", clusterID), zap.Error(err))
		errMsg := err.Error()
		_ = h.clusterService.UpdateClusterStatus(c.Context(), clusterID, "failed", &errMsg)
		return c.JSON(TestConnectionResponse{
			Success:   true,
			Connected: false,
			Message:   "Failed to create Kubernetes client",
			Error:     &errMsg,
		})
	}

	// Test connection with timeout
	ctx, cancel := context.WithTimeout(c.Context(), 10*time.Second)
	defer cancel()

	err = jobManager.TestConnection(ctx)
	if err != nil {
		h.logger.Info("Cluster connection test failed",
			zap.String("id", clusterID),
			zap.Error(err))
		errMsg := err.Error()
		_ = h.clusterService.UpdateClusterStatus(c.Context(), clusterID, "failed", &errMsg)
		return c.JSON(TestConnectionResponse{
			Success:   true,
			Connected: false,
			Message:   "Connection test failed",
			Error:     &errMsg,
		})
	}

	// Update status to connected
	_ = h.clusterService.UpdateClusterStatus(c.Context(), clusterID, "connected", nil)

	h.logger.Info("Cluster connection test passed", zap.String("id", clusterID))

	return c.JSON(TestConnectionResponse{
		Success:   true,
		Connected: true,
		Message:   "Successfully connected to Kubernetes cluster",
	})
}

// TestConnectionDirect handles POST /api/k8s/clusters/test-connection
// This tests a connection without creating a cluster first (for validation)
func (h *K8sClusterHandler) TestConnectionDirect(c *fiber.Ctx) error {
	var req CreateClusterRequest
	if err := c.BodyParser(&req); err != nil {
		h.logger.Warn("Invalid test connection request", zap.Error(err))
		return c.Status(fiber.StatusBadRequest).JSON(TestConnectionResponse{
			Success:   false,
			Connected: false,
			Message:   "Invalid request body",
		})
	}

	namespace := req.Namespace
	if namespace == "" {
		namespace = "default"
	}

	creds := k8s.ClusterCredentials{
		APIServerURL:  req.APIServerURL,
		Namespace:     namespace,
		AuthType:      req.AuthType,
		SkipTLSVerify: req.SkipTLSVerify,
	}

	if req.BearerToken != nil {
		creds.BearerToken = *req.BearerToken
	}
	if req.ClientCertificate != nil {
		creds.ClientCertificate = *req.ClientCertificate
	}
	if req.ClientKey != nil {
		creds.ClientKey = *req.ClientKey
	}
	if req.CACertificate != nil {
		creds.CACertificate = *req.CACertificate
	}
	if req.Kubeconfig != nil {
		creds.Kubeconfig = *req.Kubeconfig
	}

	// Create JobManager with provided credentials
	jobManager, err := k8s.NewJobManagerFromCredentials(creds)
	if err != nil {
		errMsg := err.Error()
		return c.JSON(TestConnectionResponse{
			Success:   true,
			Connected: false,
			Message:   "Failed to create Kubernetes client",
			Error:     &errMsg,
		})
	}

	// Test connection with timeout
	ctx, cancel := context.WithTimeout(c.Context(), 10*time.Second)
	defer cancel()

	err = jobManager.TestConnection(ctx)
	if err != nil {
		errMsg := err.Error()
		return c.JSON(TestConnectionResponse{
			Success:   true,
			Connected: false,
			Message:   "Connection test failed",
			Error:     &errMsg,
		})
	}

	return c.JSON(TestConnectionResponse{
		Success:   true,
		Connected: true,
		Message:   "Successfully connected to Kubernetes cluster",
	})
}

// UpdateRunnerConfigRequest represents a request to update runner configuration
type UpdateRunnerConfigRequest struct {
	PlatformAPIURL     string                       `json:"platform_api_url"`
	DefaultBaseURL     string                       `json:"default_base_url,omitempty"` // URL where the AUT is accessible from test runners
	ServiceAccountName string                       `json:"service_account_name"`
	ArtifactsPVCName   string                       `json:"artifacts_pvc_name,omitempty"`
	DefaultTimeout     int32                        `json:"default_timeout"`
	DefaultParallelism int32                        `json:"default_parallelism"`
	DefaultResources   *models.ResourceRequirements `json:"default_resources,omitempty"`
	NodeSelector       map[string]string            `json:"node_selector,omitempty"`
	ImagePullPolicy    string                       `json:"image_pull_policy,omitempty"`
}

// UpdateRunnerConfig handles PATCH /api/k8s/clusters/:id/runner-config
func (h *K8sClusterHandler) UpdateRunnerConfig(c *fiber.Ctx) error {
	clusterID := c.Params("id")
	if clusterID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"error":   "Cluster ID is required",
		})
	}

	var req UpdateRunnerConfigRequest
	if err := c.BodyParser(&req); err != nil {
		h.logger.Warn("Invalid update runner config request", zap.Error(err))
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"error":   "Invalid request body",
		})
	}

	// Validate required fields
	if req.PlatformAPIURL == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"error":   "Platform API URL is required",
		})
	}

	// Build RunnerConfig from request
	runnerConfig := models.RunnerConfig{
		PlatformAPIURL:     req.PlatformAPIURL,
		DefaultBaseURL:     req.DefaultBaseURL,
		ServiceAccountName: req.ServiceAccountName,
		ArtifactsPVCName:   req.ArtifactsPVCName,
		DefaultTimeout:     req.DefaultTimeout,
		DefaultParallelism: req.DefaultParallelism,
		ImagePullPolicy:    req.ImagePullPolicy,
		NodeSelector:       req.NodeSelector,
	}

	// Apply defaults if not specified
	if runnerConfig.ServiceAccountName == "" {
		runnerConfig.ServiceAccountName = "default"
	}
	if runnerConfig.DefaultTimeout == 0 {
		runnerConfig.DefaultTimeout = 3600
	}
	if runnerConfig.DefaultParallelism == 0 {
		runnerConfig.DefaultParallelism = 5
	}
	if runnerConfig.ImagePullPolicy == "" {
		runnerConfig.ImagePullPolicy = "IfNotPresent"
	}

	// Set default resources
	if req.DefaultResources != nil {
		runnerConfig.DefaultResources = *req.DefaultResources
	} else {
		runnerConfig.DefaultResources = models.ResourceRequirements{
			CPURequest:    "100m",
			CPULimit:      "1000m",
			MemoryRequest: "256Mi",
			MemoryLimit:   "1Gi",
		}
	}

	// Update the runner config
	err := h.clusterService.UpdateRunnerConfig(c.Context(), clusterID, runnerConfig)
	if err != nil {
		h.logger.Error("Failed to update runner config", zap.Error(err), zap.String("cluster_id", clusterID))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"error":   "Failed to update runner configuration",
		})
	}

	h.logger.Info("Runner config updated",
		zap.String("cluster_id", clusterID),
		zap.String("platform_api_url", req.PlatformAPIURL))

	return c.JSON(fiber.Map{
		"success":       true,
		"message":       "Runner configuration updated successfully",
		"runner_config": runnerConfig,
	})
}

// UpdateSutConfigRequest represents a request to update SUT configuration
type UpdateSutConfigRequest struct {
	ServiceName string `json:"service_name"`
	Namespace   string `json:"namespace"`
	Port        int    `json:"port,omitempty"`
	Protocol    string `json:"protocol,omitempty"` // http or https
}

// UpdateSutConfig handles PATCH /api/k8s/clusters/:id/sut-config
func (h *K8sClusterHandler) UpdateSutConfig(c *fiber.Ctx) error {
	clusterID := c.Params("id")
	if clusterID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"error":   "Cluster ID is required",
		})
	}

	var req UpdateSutConfigRequest
	if err := c.BodyParser(&req); err != nil {
		h.logger.Warn("Invalid update SUT config request", zap.Error(err))
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"error":   "Invalid request body",
		})
	}

	// Build SutConfig from request (nil if clearing)
	var sutConfig *models.SutConfig
	if req.ServiceName != "" || req.Namespace != "" {
		sutConfig = &models.SutConfig{
			ServiceName: req.ServiceName,
			Namespace:   req.Namespace,
			Port:        req.Port,
			Protocol:    req.Protocol,
		}

		// Validate
		if err := sutConfig.Validate(); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"error":   err.Error(),
			})
		}
	}

	// Update the SUT config
	err := h.clusterService.UpdateSutConfig(c.Context(), clusterID, sutConfig)
	if err != nil {
		h.logger.Error("Failed to update SUT config", zap.Error(err), zap.String("cluster_id", clusterID))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"error":   "Failed to update SUT configuration",
		})
	}

	response := fiber.Map{
		"success": true,
		"message": "SUT configuration updated successfully",
	}

	if sutConfig != nil {
		response["sut_config"] = sutConfig
		response["internal_url"] = sutConfig.InternalURL()
	}

	return c.JSON(response)
}
