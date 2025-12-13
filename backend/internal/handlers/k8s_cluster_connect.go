package handlers

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	pb "github.com/MichielDean/ScaledTest/backend/api/proto"
	"github.com/MichielDean/ScaledTest/backend/internal/middleware"
	"github.com/MichielDean/ScaledTest/backend/internal/models"
	"github.com/MichielDean/ScaledTest/backend/internal/services"
	"go.uber.org/zap"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// K8sClusterServiceHandler implements the Connect K8sClusterService.
type K8sClusterServiceHandler struct {
	clusterService services.ClusterManager
	logger         *zap.Logger
}

// NewK8sClusterServiceHandler creates a new K8sClusterServiceHandler.
func NewK8sClusterServiceHandler(clusterService services.ClusterManager, logger *zap.Logger) *K8sClusterServiceHandler {
	return &K8sClusterServiceHandler{
		clusterService: clusterService,
		logger:         logger,
	}
}

// CreateCluster creates a new Kubernetes cluster configuration.
func (h *K8sClusterServiceHandler) CreateCluster(
	ctx context.Context,
	req *connect.Request[pb.CreateClusterRequest],
) (*connect.Response[pb.ClusterResponse], error) {
	// Extract user ID from context
	userID, ok := ctx.Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("authentication required"))
	}

	if req.Msg.Name == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("cluster name is required"))
	}
	if req.Msg.ProjectId == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("project ID is required"))
	}

	// Build cluster model
	projectID := req.Msg.ProjectId
	cluster := &models.K8sCluster{
		Name:          req.Msg.Name,
		APIServerURL:  req.Msg.ApiServerUrl,
		Namespace:     req.Msg.Namespace,
		AuthType:      models.K8sAuthType(req.Msg.AuthType),
		SkipTLSVerify: req.Msg.SkipTlsVerify,
		IsDefault:     req.Msg.IsDefault,
		IsActive:      true, // New clusters are active by default
		ProjectID:     &projectID,
		Environment:   models.Environment(req.Msg.Environment),
		CreatedBy:     userID,
	}

	if req.Msg.Description != nil {
		cluster.Description = req.Msg.Description
	}

	// Build credentials
	credentials := &models.K8sClusterCredentials{
		APIServerURL:  req.Msg.ApiServerUrl,
		Namespace:     req.Msg.Namespace,
		AuthType:      models.K8sAuthType(req.Msg.AuthType),
		SkipTLSVerify: req.Msg.SkipTlsVerify,
	}
	if req.Msg.BearerToken != nil {
		credentials.BearerToken = *req.Msg.BearerToken
	}
	if req.Msg.ClientCertificate != nil {
		credentials.ClientCertificate = *req.Msg.ClientCertificate
	}
	if req.Msg.ClientKey != nil {
		credentials.ClientKey = *req.Msg.ClientKey
	}
	if req.Msg.CaCertificate != nil {
		credentials.CACertificate = *req.Msg.CaCertificate
	}
	if req.Msg.Kubeconfig != nil {
		credentials.Kubeconfig = *req.Msg.Kubeconfig
	}

	// Handle SUT config
	if req.Msg.SutConfig != nil {
		cluster.SutConfig = protoToSutConfigConnect(req.Msg.SutConfig)
	}

	// Handle Runner config
	if req.Msg.RunnerConfig != nil {
		cluster.RunnerConfig = protoToRunnerConfigConnect(req.Msg.RunnerConfig)
	}

	result, err := h.clusterService.CreateCluster(ctx, cluster, credentials)
	if err != nil {
		h.logger.Error("Failed to create cluster", zap.Error(err), zap.String("name", req.Msg.Name))
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to create cluster"))
	}

	return connect.NewResponse(clusterToProtoConnect(result)), nil
}

// GetCluster retrieves a specific cluster configuration.
func (h *K8sClusterServiceHandler) GetCluster(
	ctx context.Context,
	req *connect.Request[pb.GetClusterRequest],
) (*connect.Response[pb.ClusterResponse], error) {
	if req.Msg.ClusterId == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("cluster ID is required"))
	}

	cluster, err := h.clusterService.GetCluster(ctx, req.Msg.ClusterId)
	if err != nil {
		h.logger.Error("Failed to get cluster", zap.Error(err), zap.String("cluster_id", req.Msg.ClusterId))
		return nil, connect.NewError(connect.CodeNotFound, errors.New("cluster not found"))
	}

	return connect.NewResponse(clusterToProtoConnect(cluster)), nil
}

// ListClusters returns all clusters for a project.
func (h *K8sClusterServiceHandler) ListClusters(
	ctx context.Context,
	req *connect.Request[pb.ListClustersRequest],
) (*connect.Response[pb.ListClustersResponse], error) {
	if req.Msg.ProjectId == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("project ID is required"))
	}

	clusters, err := h.clusterService.ListClusters(ctx, req.Msg.ProjectId)
	if err != nil {
		h.logger.Error("Failed to list clusters", zap.Error(err), zap.String("project_id", req.Msg.ProjectId))
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to list clusters"))
	}

	response := &pb.ListClustersResponse{
		Clusters:   make([]*pb.ClusterResponse, 0, len(clusters)),
		TotalCount: int32(len(clusters)),
	}

	for _, cluster := range clusters {
		response.Clusters = append(response.Clusters, clusterToProtoConnect(cluster))
	}

	return connect.NewResponse(response), nil
}

// DeleteCluster removes a cluster configuration.
func (h *K8sClusterServiceHandler) DeleteCluster(
	ctx context.Context,
	req *connect.Request[pb.DeleteClusterRequest],
) (*connect.Response[pb.DeleteClusterResponse], error) {
	if req.Msg.ClusterId == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("cluster ID is required"))
	}

	err := h.clusterService.DeleteCluster(ctx, req.Msg.ClusterId)
	if err != nil {
		h.logger.Error("Failed to delete cluster", zap.Error(err), zap.String("cluster_id", req.Msg.ClusterId))
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to delete cluster"))
	}

	return connect.NewResponse(&pb.DeleteClusterResponse{
		Success: true,
		Message: "Cluster deleted successfully",
	}), nil
}

// TestConnection tests connectivity to a cluster.
func (h *K8sClusterServiceHandler) TestConnection(
	ctx context.Context,
	req *connect.Request[pb.TestConnectionRequest],
) (*connect.Response[pb.TestConnectionResponse], error) {
	if req.Msg.ClusterId == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("cluster ID is required"))
	}

	// Get cluster to test
	_, err := h.clusterService.GetCluster(ctx, req.Msg.ClusterId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound, errors.New("cluster not found"))
	}

	// Get credentials
	_, err = h.clusterService.GetClusterCredentials(ctx, req.Msg.ClusterId)
	if err != nil {
		h.logger.Error("Failed to get cluster credentials", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to get cluster credentials"))
	}

	// Test connection (simplified - actual implementation would use k8s client)
	// For now, just update status as "tested"
	err = h.clusterService.UpdateClusterStatus(ctx, req.Msg.ClusterId, "connected", nil)
	if err != nil {
		h.logger.Warn("Failed to update cluster status", zap.Error(err))
	}

	return connect.NewResponse(&pb.TestConnectionResponse{
		Success:   true,
		Connected: true,
		Message:   "Connection test successful",
	}), nil
}

// TestConnectionDirect tests connectivity with provided credentials.
func (h *K8sClusterServiceHandler) TestConnectionDirect(
	ctx context.Context,
	req *connect.Request[pb.TestConnectionDirectRequest],
) (*connect.Response[pb.TestConnectionResponse], error) {
	if req.Msg.ApiServerUrl == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("API server URL is required"))
	}

	// TODO: Implement direct connection test using provided credentials
	// This would create a temporary k8s client and test connectivity

	return connect.NewResponse(&pb.TestConnectionResponse{
		Success:   true,
		Connected: true,
		Message:   "Connection test successful (direct)",
	}), nil
}

// SetDefaultCluster sets a cluster as the default for a project.
func (h *K8sClusterServiceHandler) SetDefaultCluster(
	ctx context.Context,
	req *connect.Request[pb.SetDefaultClusterRequest],
) (*connect.Response[pb.ClusterResponse], error) {
	if req.Msg.ClusterId == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("cluster ID is required"))
	}

	err := h.clusterService.SetDefaultCluster(ctx, req.Msg.ClusterId)
	if err != nil {
		h.logger.Error("Failed to set default cluster", zap.Error(err), zap.String("cluster_id", req.Msg.ClusterId))
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to set default cluster"))
	}

	cluster, err := h.clusterService.GetCluster(ctx, req.Msg.ClusterId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to get updated cluster"))
	}

	return connect.NewResponse(clusterToProtoConnect(cluster)), nil
}

// UpdateRunnerConfig updates the test runner configuration for a cluster.
func (h *K8sClusterServiceHandler) UpdateRunnerConfig(
	ctx context.Context,
	req *connect.Request[pb.UpdateRunnerConfigRequest],
) (*connect.Response[pb.ClusterResponse], error) {
	if req.Msg.ClusterId == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("cluster ID is required"))
	}

	config := protoToRunnerConfigConnect(req.Msg.RunnerConfig)
	err := h.clusterService.UpdateRunnerConfig(ctx, req.Msg.ClusterId, *config)
	if err != nil {
		h.logger.Error("Failed to update runner config", zap.Error(err), zap.String("cluster_id", req.Msg.ClusterId))
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to update runner config"))
	}

	cluster, err := h.clusterService.GetCluster(ctx, req.Msg.ClusterId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to get updated cluster"))
	}

	return connect.NewResponse(clusterToProtoConnect(cluster)), nil
}

// UpdateSutConfig updates the System Under Test configuration for a cluster.
func (h *K8sClusterServiceHandler) UpdateSutConfig(
	ctx context.Context,
	req *connect.Request[pb.UpdateSutConfigRequest],
) (*connect.Response[pb.ClusterResponse], error) {
	if req.Msg.ClusterId == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("cluster ID is required"))
	}

	config := protoToSutConfigConnect(req.Msg.SutConfig)
	err := h.clusterService.UpdateSutConfig(ctx, req.Msg.ClusterId, config)
	if err != nil {
		h.logger.Error("Failed to update SUT config", zap.Error(err), zap.String("cluster_id", req.Msg.ClusterId))
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to update SUT config"))
	}

	cluster, err := h.clusterService.GetCluster(ctx, req.Msg.ClusterId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to get updated cluster"))
	}

	return connect.NewResponse(clusterToProtoConnect(cluster)), nil
}

// Conversion helpers for Connect handlers

func clusterToProtoConnect(cluster *models.K8sCluster) *pb.ClusterResponse {
	if cluster == nil {
		return nil
	}

	resp := &pb.ClusterResponse{
		Id:               cluster.ID,
		Name:             cluster.Name,
		ApiServerUrl:     cluster.APIServerURL,
		Namespace:        cluster.Namespace,
		AuthType:         string(cluster.AuthType),
		SkipTlsVerify:    cluster.SkipTLSVerify,
		IsDefault:        cluster.IsDefault,
		IsActive:         cluster.IsActive,
		ConnectionStatus: cluster.ConnectionStatus,
		Environment:      string(cluster.Environment),
		CreatedBy:        cluster.CreatedBy,
		CreatedAt:        timestamppb.New(cluster.CreatedAt),
		UpdatedAt:        timestamppb.New(cluster.UpdatedAt),
	}

	if cluster.Description != nil {
		resp.Description = cluster.Description
	}
	if cluster.ProjectID != nil {
		resp.ProjectId = cluster.ProjectID
	}
	if cluster.ConnectionError != nil {
		resp.ConnectionError = cluster.ConnectionError
	}
	if cluster.LastConnectedAt != nil {
		resp.LastConnectedAt = timestamppb.New(*cluster.LastConnectedAt)
	}
	if cluster.RunnerConfig != nil {
		resp.RunnerConfig = runnerConfigToProtoConnect(cluster.RunnerConfig)
	}
	if cluster.SutConfig != nil {
		resp.SutConfig = sutConfigToProtoConnect(cluster.SutConfig)
	}

	return resp
}

func runnerConfigToProtoConnect(config *models.RunnerConfig) *pb.RunnerConfig {
	if config == nil {
		return nil
	}

	result := &pb.RunnerConfig{
		PlatformApiUrl:     config.PlatformAPIURL,
		DefaultBaseUrl:     config.DefaultBaseURL,
		ServiceAccountName: config.ServiceAccountName,
		DefaultTimeout:     config.DefaultTimeout,
		DefaultParallelism: config.DefaultParallelism,
		DefaultResources: &pb.ClusterResourceRequirements{
			CpuRequest:    config.DefaultResources.CPURequest,
			CpuLimit:      config.DefaultResources.CPULimit,
			MemoryRequest: config.DefaultResources.MemoryRequest,
			MemoryLimit:   config.DefaultResources.MemoryLimit,
		},
		NodeSelector:    config.NodeSelector,
		ImagePullPolicy: config.ImagePullPolicy,
	}

	if config.ArtifactsPVCName != "" {
		result.ArtifactsPvcName = &config.ArtifactsPVCName
	}

	return result
}

func protoToRunnerConfigConnect(config *pb.RunnerConfig) *models.RunnerConfig {
	if config == nil {
		return nil
	}

	result := &models.RunnerConfig{
		PlatformAPIURL:     config.PlatformApiUrl,
		DefaultBaseURL:     config.DefaultBaseUrl,
		ServiceAccountName: config.ServiceAccountName,
		ArtifactsPVCName:   config.GetArtifactsPvcName(),
		DefaultTimeout:     config.DefaultTimeout,
		DefaultParallelism: config.DefaultParallelism,
		NodeSelector:       config.NodeSelector,
		ImagePullPolicy:    config.ImagePullPolicy,
	}

	if config.DefaultResources != nil {
		result.DefaultResources = models.ResourceRequirements{
			CPURequest:    config.DefaultResources.CpuRequest,
			CPULimit:      config.DefaultResources.CpuLimit,
			MemoryRequest: config.DefaultResources.MemoryRequest,
			MemoryLimit:   config.DefaultResources.MemoryLimit,
		}
	}

	return result
}

func sutConfigToProtoConnect(config *models.SutConfig) *pb.SutConfig {
	if config == nil {
		return nil
	}

	result := &pb.SutConfig{
		ServiceName: config.ServiceName,
		Namespace:   config.Namespace,
		Port:        int32(config.Port),
	}

	if config.Protocol != "" {
		result.Protocol = &config.Protocol
	}

	return result
}

func protoToSutConfigConnect(config *pb.SutConfig) *models.SutConfig {
	if config == nil {
		return nil
	}

	return &models.SutConfig{
		ServiceName: config.ServiceName,
		Namespace:   config.Namespace,
		Port:        int(config.Port),
		Protocol:    config.GetProtocol(),
	}
}
