package handlers

import (
	"context"
	"errors"
	"time"

	"connectrpc.com/connect"
	pb "github.com/MichielDean/ScaledTest/backend/api/proto"
	"github.com/MichielDean/ScaledTest/backend/internal/k8s"
	"github.com/MichielDean/ScaledTest/backend/internal/middleware"
	"github.com/MichielDean/ScaledTest/backend/internal/models"
	"github.com/MichielDean/ScaledTest/backend/internal/services"
	"go.uber.org/zap"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// TestJobServiceConfig holds all service dependencies for TestJobServiceHandler.
type TestJobServiceConfig struct {
	ProjectService       services.ProjectManager
	RegistryService      services.RegistryManager
	TestImageService     services.TestImageManager
	TestExecutionService services.TestExecutor
	TestDiscoveryService services.TestDiscoverer
	ArtifactService      *services.ArtifactService
}

// TestJobServiceHandler implements the Connect TestJobService.
// This handler covers projects, registries, test images, test jobs, and artifacts.
type TestJobServiceHandler struct {
	config TestJobServiceConfig
	logger *zap.Logger
}

// NewTestJobServiceHandler creates a new TestJobServiceHandler.
func NewTestJobServiceHandler(config TestJobServiceConfig, logger *zap.Logger) *TestJobServiceHandler {
	return &TestJobServiceHandler{
		config: config,
		logger: logger,
	}
}

// ============================================================================
// Project Management
// ============================================================================

// CreateProject creates a new project.
func (h *TestJobServiceHandler) CreateProject(
	ctx context.Context,
	req *connect.Request[pb.CreateProjectRequest],
) (*connect.Response[pb.CreateProjectResponse], error) {
	userID, ok := ctx.Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("authentication required"))
	}

	if req.Msg.Name == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("project name is required"))
	}

	var description *string
	if req.Msg.Description != nil {
		description = req.Msg.Description
	}

	var organizationID *string
	if req.Msg.OrganizationId != nil {
		organizationID = req.Msg.OrganizationId
	}

	project, err := h.config.ProjectService.CreateProject(
		ctx,
		req.Msg.Name,
		description,
		nil, // gitRepositoryURL - not in proto
		userID,
		organizationID,
		req.Msg.Settings,
	)
	if err != nil {
		h.logger.Error("Failed to create project", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to create project"))
	}

	return connect.NewResponse(&pb.CreateProjectResponse{
		ProjectId: project.ID,
		Message:   "Project created successfully",
	}), nil
}

// GetProject retrieves a project by ID.
func (h *TestJobServiceHandler) GetProject(
	ctx context.Context,
	req *connect.Request[pb.GetProjectRequest],
) (*connect.Response[pb.ProjectResponse], error) {
	if req.Msg.ProjectId == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("project_id is required"))
	}

	project, err := h.config.ProjectService.GetProject(ctx, req.Msg.ProjectId)
	if err != nil {
		return nil, mapGrpcErrorToConnect(err)
	}

	return connect.NewResponse(projectToProto(project)), nil
}

// ListProjects lists projects for the authenticated user.
func (h *TestJobServiceHandler) ListProjects(
	ctx context.Context,
	req *connect.Request[pb.ListProjectsRequest],
) (*connect.Response[pb.ListProjectsResponse], error) {
	userID, ok := ctx.Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("authentication required"))
	}

	page := req.Msg.Page
	if page < 1 {
		page = 1
	}
	pageSize := req.Msg.PageSize
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	projects, total, err := h.config.ProjectService.ListProjects(ctx, userID, page, pageSize)
	if err != nil {
		h.logger.Error("Failed to list projects", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to list projects"))
	}

	pbProjects := make([]*pb.ProjectResponse, len(projects))
	for i, p := range projects {
		pbProjects[i] = projectToProto(p)
	}

	return connect.NewResponse(&pb.ListProjectsResponse{
		Projects:   pbProjects,
		TotalCount: total,
	}), nil
}

// UpdateProject updates a project.
func (h *TestJobServiceHandler) UpdateProject(
	ctx context.Context,
	req *connect.Request[pb.UpdateProjectRequest],
) (*connect.Response[pb.ProjectResponse], error) {
	if req.Msg.ProjectId == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("project_id is required"))
	}

	project, err := h.config.ProjectService.UpdateProject(
		ctx,
		req.Msg.ProjectId,
		req.Msg.Name,
		req.Msg.Description,
		nil, // gitRepositoryURL - not in proto
		req.Msg.Settings,
	)
	if err != nil {
		return nil, mapGrpcErrorToConnect(err)
	}

	return connect.NewResponse(projectToProto(project)), nil
}

// DeleteProject deletes a project.
func (h *TestJobServiceHandler) DeleteProject(
	ctx context.Context,
	req *connect.Request[pb.DeleteProjectRequest],
) (*connect.Response[pb.DeleteProjectResponse], error) {
	if req.Msg.ProjectId == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("project_id is required"))
	}

	if err := h.config.ProjectService.DeleteProject(ctx, req.Msg.ProjectId); err != nil {
		return nil, mapGrpcErrorToConnect(err)
	}

	return connect.NewResponse(&pb.DeleteProjectResponse{
		Success: true,
	}), nil
}

// ============================================================================
// Container Registry Management
// ============================================================================

// AddContainerRegistry adds a new container registry.
func (h *TestJobServiceHandler) AddContainerRegistry(
	ctx context.Context,
	req *connect.Request[pb.AddContainerRegistryRequest],
) (*connect.Response[pb.ContainerRegistryResponse], error) {
	userID, ok := ctx.Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("authentication required"))
	}

	if req.Msg.Name == "" || req.Msg.RegistryUrl == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("name and registry_url are required"))
	}

	// Convert string to *string for optional projectID
	var projectID *string
	if req.Msg.ProjectId != "" {
		projectID = &req.Msg.ProjectId
	}

	registry, err := h.config.RegistryService.AddContainerRegistry(
		ctx,
		projectID,
		req.Msg.Name,
		req.Msg.RegistryUrl,
		req.Msg.RegistryType,
		req.Msg.Username,
		req.Msg.Credentials,
		req.Msg.AuthType,
		userID,
	)
	if err != nil {
		h.logger.Error("Failed to add registry", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to add registry"))
	}

	return connect.NewResponse(registryToProto(registry)), nil
}

// GetContainerRegistry retrieves a registry by ID.
func (h *TestJobServiceHandler) GetContainerRegistry(
	ctx context.Context,
	req *connect.Request[pb.GetContainerRegistryRequest],
) (*connect.Response[pb.ContainerRegistryResponse], error) {
	if req.Msg.RegistryId == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("registry_id is required"))
	}

	registry, err := h.config.RegistryService.GetContainerRegistry(ctx, req.Msg.RegistryId)
	if err != nil {
		return nil, mapGrpcErrorToConnect(err)
	}

	return connect.NewResponse(registryToProto(registry)), nil
}

// TestRegistryConnection tests connectivity to a registry.
func (h *TestJobServiceHandler) TestRegistryConnection(
	ctx context.Context,
	req *connect.Request[pb.TestRegistryConnectionRequest],
) (*connect.Response[pb.TestRegistryConnectionResponse], error) {
	if req.Msg.RegistryId == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("registry_id is required"))
	}

	success, message, err := h.config.RegistryService.TestRegistryConnection(ctx, req.Msg.RegistryId)
	if err != nil {
		return nil, mapGrpcErrorToConnect(err)
	}

	return connect.NewResponse(&pb.TestRegistryConnectionResponse{
		Success:  success,
		Message:  message,
		TestedAt: timestamppb.Now(),
	}), nil
}

// ListContainerRegistries lists registries for the user.
func (h *TestJobServiceHandler) ListContainerRegistries(
	ctx context.Context,
	req *connect.Request[pb.ListContainerRegistriesRequest],
) (*connect.Response[pb.ListContainerRegistriesResponse], error) {
	userID, ok := ctx.Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("authentication required"))
	}

	page := req.Msg.Page
	if page < 1 {
		page = 1
	}
	pageSize := req.Msg.PageSize
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	// Convert string to *string for optional projectID
	var projectID *string
	if req.Msg.ProjectId != "" {
		projectID = &req.Msg.ProjectId
	}

	registries, total, err := h.config.RegistryService.ListContainerRegistries(ctx, userID, projectID, page, pageSize)
	if err != nil {
		h.logger.Error("Failed to list registries", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to list registries"))
	}

	pbRegistries := make([]*pb.ContainerRegistryResponse, len(registries))
	for i, r := range registries {
		pbRegistries[i] = registryToProto(r)
	}

	return connect.NewResponse(&pb.ListContainerRegistriesResponse{
		Registries: pbRegistries,
		TotalCount: total,
	}), nil
}

// UpdateContainerRegistry updates a registry.
func (h *TestJobServiceHandler) UpdateContainerRegistry(
	ctx context.Context,
	req *connect.Request[pb.UpdateContainerRegistryRequest],
) (*connect.Response[pb.ContainerRegistryResponse], error) {
	if req.Msg.RegistryId == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("registry_id is required"))
	}

	registry, err := h.config.RegistryService.UpdateContainerRegistry(
		ctx,
		req.Msg.RegistryId,
		req.Msg.Name,
		req.Msg.Username,
		req.Msg.Credentials,
	)
	if err != nil {
		return nil, mapGrpcErrorToConnect(err)
	}

	return connect.NewResponse(registryToProto(registry)), nil
}

// DeleteContainerRegistry deletes a registry.
func (h *TestJobServiceHandler) DeleteContainerRegistry(
	ctx context.Context,
	req *connect.Request[pb.DeleteContainerRegistryRequest],
) (*connect.Response[pb.DeleteContainerRegistryResponse], error) {
	if req.Msg.RegistryId == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("registry_id is required"))
	}

	if err := h.config.RegistryService.DeleteContainerRegistry(ctx, req.Msg.RegistryId); err != nil {
		return nil, mapGrpcErrorToConnect(err)
	}

	return connect.NewResponse(&pb.DeleteContainerRegistryResponse{
		Success: true,
	}), nil
}

// SyncRegistryImages syncs images from a registry.
func (h *TestJobServiceHandler) SyncRegistryImages(
	ctx context.Context,
	req *connect.Request[pb.SyncRegistryImagesRequest],
) (*connect.Response[pb.SyncRegistryImagesResponse], error) {
	if req.Msg.RegistryId == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("registry_id is required"))
	}

	images, err := h.config.RegistryService.SyncRegistryImages(ctx, req.Msg.RegistryId)
	if err != nil {
		return nil, mapGrpcErrorToConnect(err)
	}

	return connect.NewResponse(&pb.SyncRegistryImagesResponse{
		Success:      true,
		Message:      "Images synced successfully",
		ImagesFound:  int32(len(images)),
		ImagesSynced: int32(len(images)),
	}), nil
}

// ============================================================================
// Test Image Management
// ============================================================================

// AddTestImage adds a new test image.
func (h *TestJobServiceHandler) AddTestImage(
	ctx context.Context,
	req *connect.Request[pb.AddTestImageRequest],
) (*connect.Response[pb.TestImageResponse], error) {
	userID, ok := ctx.Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("authentication required"))
	}

	if req.Msg.RegistryId == "" || req.Msg.ImagePath == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("registry_id and image_path are required"))
	}

	// Convert string to *string for optional projectID
	var projectID *string
	if req.Msg.ProjectId != "" {
		projectID = &req.Msg.ProjectId
	}

	image, err := h.config.TestImageService.AddTestImage(
		ctx,
		req.Msg.RegistryId,
		req.Msg.ImagePath,
		req.Msg.ImageTag,
		userID,
		projectID,
	)
	if err != nil {
		h.logger.Error("Failed to add test image", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to add test image"))
	}

	return connect.NewResponse(testImageToProto(image)), nil
}

// DiscoverTests discovers tests from an image.
func (h *TestJobServiceHandler) DiscoverTests(
	ctx context.Context,
	req *connect.Request[pb.DiscoverTestsRequest],
) (*connect.Response[pb.DiscoverTestsResponse], error) {
	if req.Msg.TestImageId == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("test_image_id is required"))
	}

	// Default to false if not provided (proto might not be regenerated yet)
	forceRefresh := false
	if req.Msg.ForceRefresh != nil {
		forceRefresh = *req.Msg.ForceRefresh
	}

	if err := h.config.TestDiscoveryService.DiscoverTests(ctx, req.Msg.TestImageId, forceRefresh); err != nil {
		return nil, mapGrpcErrorToConnect(err)
	}

	// Get the updated image with discovered tests
	image, err := h.config.TestImageService.GetTestImage(ctx, req.Msg.TestImageId)
	if err != nil {
		return nil, mapGrpcErrorToConnect(err)
	}

	pbImage := testImageToProto(image)
	return connect.NewResponse(&pb.DiscoverTestsResponse{
		Success:   true,
		Message:   "Tests discovered successfully",
		TestCount: pbImage.TotalTestCount,
		Tests:     pbImage.DiscoveredTests,
	}), nil
}

// GetTestImage retrieves a test image by ID.
func (h *TestJobServiceHandler) GetTestImage(
	ctx context.Context,
	req *connect.Request[pb.GetTestImageRequest],
) (*connect.Response[pb.TestImageResponse], error) {
	if req.Msg.TestImageId == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("test_image_id is required"))
	}

	image, err := h.config.TestImageService.GetTestImage(ctx, req.Msg.TestImageId)
	if err != nil {
		return nil, mapGrpcErrorToConnect(err)
	}

	return connect.NewResponse(testImageToProto(image)), nil
}

// ListTestImages lists test images.
func (h *TestJobServiceHandler) ListTestImages(
	ctx context.Context,
	req *connect.Request[pb.ListTestImagesRequest],
) (*connect.Response[pb.ListTestImagesResponse], error) {
	userID, ok := ctx.Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("authentication required"))
	}

	page := req.Msg.Page
	if page < 1 {
		page = 1
	}
	pageSize := req.Msg.PageSize
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	// Convert strings to *string for optional filters
	var projectID *string
	if req.Msg.ProjectId != "" {
		projectID = &req.Msg.ProjectId
	}

	images, total, err := h.config.TestImageService.ListTestImages(ctx, userID, nil, projectID, page, pageSize)
	if err != nil {
		h.logger.Error("Failed to list test images", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to list test images"))
	}

	pbImages := make([]*pb.TestImageResponse, len(images))
	for i, img := range images {
		pbImages[i] = testImageToProto(img)
	}

	return connect.NewResponse(&pb.ListTestImagesResponse{
		Images:     pbImages,
		TotalCount: total,
	}), nil
}

// DeleteTestImage deletes a test image.
func (h *TestJobServiceHandler) DeleteTestImage(
	ctx context.Context,
	req *connect.Request[pb.DeleteTestImageRequest],
) (*connect.Response[pb.DeleteTestImageResponse], error) {
	if req.Msg.TestImageId == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("test_image_id is required"))
	}

	if err := h.config.TestImageService.DeleteTestImage(ctx, req.Msg.TestImageId); err != nil {
		return nil, mapGrpcErrorToConnect(err)
	}

	return connect.NewResponse(&pb.DeleteTestImageResponse{
		Success: true,
	}), nil
}

// ============================================================================
// Test Job Execution
// ============================================================================

// TriggerTestJobs triggers test execution.
func (h *TestJobServiceHandler) TriggerTestJobs(
	ctx context.Context,
	req *connect.Request[pb.TriggerTestJobsRequest],
) (*connect.Response[pb.TriggerTestJobsResponse], error) {
	userID, ok := ctx.Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("authentication required"))
	}

	// Validate: must provide either test_image_id OR image (direct reference)
	hasImageID := req.Msg.TestImageId != nil && *req.Msg.TestImageId != ""
	hasDirectImage := req.Msg.Image != nil && *req.Msg.Image != ""
	if req.Msg.ProjectId == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("project_id is required"))
	}
	if !hasImageID && !hasDirectImage {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("either test_image_id or image must be provided"))
	}

	var resources *k8s.ResourceRequirements
	if req.Msg.Resources != nil {
		resources = &k8s.ResourceRequirements{
			CPURequest:    req.Msg.Resources.GetCpuRequest(),
			CPULimit:      req.Msg.Resources.GetCpuLimit(),
			MemoryRequest: req.Msg.Resources.GetMemoryRequest(),
			MemoryLimit:   req.Msg.Resources.GetMemoryLimit(),
		}
	}

	// Use getter methods which handle nil checks
	timeout := req.Msg.GetTimeoutSeconds()
	parallelism := req.Msg.GetParallelism()

	var k8sJobName, testRunID string
	var jobIDs []string
	var err error

	if hasDirectImage {
		// Use direct image reference - simpler path without registry lookup
		k8sJobName, testRunID, jobIDs, err = h.config.TestExecutionService.TriggerTestJobsDirect(
			ctx,
			req.Msg.ProjectId,
			*req.Msg.Image,
			userID,
			req.Msg.TestIds,
			"", // baseUrlOverride - not in proto
			req.Msg.Environment,
			resources,
			timeout,
			parallelism,
		)
	} else {
		// Use registered test image (original path)
		k8sJobName, testRunID, jobIDs, err = h.config.TestExecutionService.TriggerTestJobs(
			ctx,
			req.Msg.ProjectId,
			*req.Msg.TestImageId,
			userID,
			req.Msg.TestIds,
			"", // baseUrlOverride - not in proto
			req.Msg.Environment,
			resources,
			timeout,
			parallelism,
		)
	}
	if err != nil {
		h.logger.Error("Failed to trigger test jobs", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to trigger test jobs"))
	}

	return connect.NewResponse(&pb.TriggerTestJobsResponse{
		Success:    true,
		Message:    "Test jobs triggered successfully",
		K8SJobName: k8sJobName,
		TestRunId:  testRunID,
		JobIds:     jobIDs,
		TotalTests: int32(len(req.Msg.TestIds)),
	}), nil
}

// GetTestJob retrieves a test job by ID.
func (h *TestJobServiceHandler) GetTestJob(
	ctx context.Context,
	req *connect.Request[pb.GetTestJobRequest],
) (*connect.Response[pb.TestJobResponse], error) {
	if req.Msg.JobId == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("job_id is required"))
	}

	job, err := h.config.TestExecutionService.GetTestJob(ctx, req.Msg.JobId)
	if err != nil {
		return nil, mapGrpcErrorToConnect(err)
	}

	return connect.NewResponse(testJobToProto(job)), nil
}

// ListTestJobs lists test jobs.
func (h *TestJobServiceHandler) ListTestJobs(
	ctx context.Context,
	req *connect.Request[pb.ListTestJobsRequest],
) (*connect.Response[pb.ListTestJobsResponse], error) {
	if req.Msg.ProjectId == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("project_id is required"))
	}

	page := req.Msg.Page
	if page < 1 {
		page = 1
	}
	pageSize := req.Msg.PageSize
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	// Use getter methods which handle nil checks - pass pointers where proto has *string
	var status, testImageID, k8sJobName *string
	if s := req.Msg.GetStatus(); s != "" {
		status = &s
	}
	if t := req.Msg.GetTestImageId(); t != "" {
		testImageID = &t
	}
	if k := req.Msg.GetK8SJobName(); k != "" {
		k8sJobName = &k
	}

	jobs, total, stats, err := h.config.TestExecutionService.ListTestJobs(
		ctx,
		req.Msg.ProjectId,
		page,
		pageSize,
		status,
		testImageID,
		k8sJobName,
	)
	if err != nil {
		h.logger.Error("Failed to list test jobs", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to list test jobs"))
	}

	pbJobs := make([]*pb.TestJobResponse, len(jobs))
	for i, j := range jobs {
		pbJobs[i] = testJobToProto(j)
	}

	resp := &pb.ListTestJobsResponse{
		Jobs:       pbJobs,
		TotalCount: total,
	}

	if stats != nil {
		resp.Stats = &pb.JobStatsSummary{
			Pending:   stats.Pending,
			Running:   stats.Running,
			Succeeded: stats.Succeeded,
			Failed:    stats.Failed,
			Cancelled: stats.Cancelled,
		}
	}

	return connect.NewResponse(resp), nil
}

// CancelTestJob cancels a running test job.
func (h *TestJobServiceHandler) CancelTestJob(
	ctx context.Context,
	req *connect.Request[pb.CancelTestJobRequest],
) (*connect.Response[pb.CancelTestJobResponse], error) {
	if req.Msg.JobId == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("job_id is required"))
	}

	if err := h.config.TestExecutionService.CancelTestJob(ctx, req.Msg.JobId); err != nil {
		return nil, mapGrpcErrorToConnect(err)
	}

	return connect.NewResponse(&pb.CancelTestJobResponse{
		Success: true,
	}), nil
}

// ============================================================================
// Artifact Management
// ============================================================================

// GetArtifact retrieves artifact metadata.
func (h *TestJobServiceHandler) GetArtifact(
	ctx context.Context,
	req *connect.Request[pb.GetArtifactRequest],
) (*connect.Response[pb.ArtifactResponse], error) {
	if h.config.ArtifactService == nil {
		return nil, connect.NewError(connect.CodeUnimplemented, errors.New("artifact service not configured"))
	}

	if req.Msg.ArtifactId == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("artifact_id is required"))
	}

	artifact, err := h.config.ArtifactService.GetArtifact(ctx, req.Msg.ArtifactId)
	if err != nil {
		h.logger.Error("Failed to get artifact", zap.Error(err))
		return nil, connect.NewError(connect.CodeNotFound, errors.New("artifact not found"))
	}

	// Get test job to retrieve test_run_id
	testJob, err := h.config.TestExecutionService.GetTestJob(ctx, artifact.TestJobID)
	if err != nil {
		h.logger.Warn("Failed to get test job for artifact", zap.String("test_job_id", artifact.TestJobID), zap.Error(err))
	}

	testRunID := ""
	if testJob != nil && testJob.TestRunID != nil {
		testRunID = *testJob.TestRunID
	}

	contentType := ""
	if artifact.ContentType != nil {
		contentType = *artifact.ContentType
	}

	sizeBytes := int64(0)
	if artifact.SizeBytes != nil {
		sizeBytes = *artifact.SizeBytes
	}

	return connect.NewResponse(&pb.ArtifactResponse{
		Id:           artifact.ID,
		TestRunId:    testRunID,
		TestJobId:    artifact.TestJobID,
		Filename:     artifact.FilePath,
		ContentType:  contentType,
		SizeBytes:    sizeBytes,
		ArtifactType: string(artifact.ArtifactType),
		StoragePath:  artifact.AbsolutePath,
		CreatedAt:    timestamppb.New(artifact.CreatedAt),
	}), nil
}

// GetArtifactDownloadUrl gets a download URL for an artifact.
func (h *TestJobServiceHandler) GetArtifactDownloadUrl(
	ctx context.Context,
	req *connect.Request[pb.GetArtifactDownloadUrlRequest],
) (*connect.Response[pb.GetArtifactDownloadUrlResponse], error) {
	if h.config.ArtifactService == nil {
		return nil, connect.NewError(connect.CodeUnimplemented, errors.New("artifact service not configured"))
	}

	if req.Msg.ArtifactId == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("artifact_id is required"))
	}

	expiry := 15 * time.Minute
	if req.Msg.ExpiresInSeconds != nil && *req.Msg.ExpiresInSeconds > 0 {
		expiry = time.Duration(*req.Msg.ExpiresInSeconds) * time.Second
	}

	url, err := h.config.ArtifactService.GetArtifactDownloadURL(ctx, req.Msg.ArtifactId, expiry)
	if err != nil {
		h.logger.Error("Failed to generate download URL", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to generate download URL"))
	}

	return connect.NewResponse(&pb.GetArtifactDownloadUrlResponse{
		DownloadUrl: url,
		ExpiresAt:   timestamppb.New(time.Now().Add(expiry)),
	}), nil
}

// ListArtifactsByTestRun lists artifacts by test run.
func (h *TestJobServiceHandler) ListArtifactsByTestRun(
	ctx context.Context,
	req *connect.Request[pb.ListArtifactsByTestRunRequest],
) (*connect.Response[pb.ListArtifactsResponse], error) {
	if h.config.ArtifactService == nil {
		return nil, connect.NewError(connect.CodeUnimplemented, errors.New("artifact service not configured"))
	}

	if req.Msg.TestRunId == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("test_run_id is required"))
	}

	artifacts, err := h.config.ArtifactService.ListArtifactsByTestRun(ctx, req.Msg.TestRunId)
	if err != nil {
		h.logger.Error("Failed to list artifacts", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to list artifacts"))
	}

	pbArtifacts := make([]*pb.ArtifactInfo, len(artifacts))
	for i, a := range artifacts {
		contentType := ""
		if a.ContentType != nil {
			contentType = *a.ContentType
		}

		sizeBytes := int64(0)
		if a.SizeBytes != nil {
			sizeBytes = *a.SizeBytes
		}

		pbArtifacts[i] = &pb.ArtifactInfo{
			Id:           a.ID,
			JobId:        a.TestJobID,
			FilePath:     a.FilePath,
			ContentType:  &contentType,
			SizeBytes:    sizeBytes,
			ArtifactType: string(a.ArtifactType),
			CreatedAt:    timestamppb.New(a.CreatedAt),
		}
	}

	return connect.NewResponse(&pb.ListArtifactsResponse{
		Artifacts:   pbArtifacts,
		TotalCount:  int32(len(artifacts)),
		TotalSizeBytes: 0, // TODO: Calculate if needed
	}), nil
}

// ============================================================================
// Helper Functions - Model to Proto Conversions
// ============================================================================

// projectToProto converts a Project model to a ProjectResponse proto.
func projectToProto(p *models.Project) *pb.ProjectResponse {
	resp := &pb.ProjectResponse{
		Id:        p.ID,
		Name:      p.Name,
		CreatedBy: p.CreatedBy,
		CreatedAt: timestamppb.New(p.CreatedAt),
		UpdatedAt: timestamppb.New(p.UpdatedAt),
		Settings:  p.Settings,
	}
	if p.Description != nil {
		resp.Description = p.Description
	}
	if p.OrganizationID != nil {
		resp.OrganizationId = p.OrganizationID
	}
	return resp
}

// registryToProto converts a services.ContainerRegistry to a ContainerRegistryResponse proto.
func registryToProto(r *services.ContainerRegistry) *pb.ContainerRegistryResponse {
	resp := &pb.ContainerRegistryResponse{
		Id:           r.ID,
		Name:         r.Name,
		RegistryUrl:  r.RegistryURL,
		RegistryType: r.RegistryType,
		AuthType:     r.AuthType,
		CreatedAt:    timestamppb.New(r.CreatedAt),
		UpdatedAt:    timestamppb.New(r.UpdatedAt),
	}
	if r.ProjectID != nil {
		resp.ProjectId = *r.ProjectID
	}
	if r.Username != nil {
		resp.Username = r.Username
	}
	if r.LastTestedAt != nil {
		resp.LastTestedAt = timestamppb.New(*r.LastTestedAt)
	}
	if r.TestStatus != nil {
		resp.TestStatus = r.TestStatus
	}
	if r.TestError != nil {
		resp.TestError = r.TestError
	}
	return resp
}

// testImageToProto converts a services.TestImage to a TestImageResponse proto.
func testImageToProto(img *services.TestImage) *pb.TestImageResponse {
	resp := &pb.TestImageResponse{
		Id:              img.ID,
		RegistryId:      img.RegistryID,
		ImagePath:       img.ImagePath,
		ImageTag:        img.ImageTag,
		DiscoveryStatus: img.DiscoveryStatus,
		TotalTestCount:  int32(img.TotalTestCount),
		CreatedAt:       timestamppb.New(img.CreatedAt),
		UpdatedAt:       timestamppb.New(img.UpdatedAt),
	}
	if img.ProjectID != nil {
		resp.ProjectId = *img.ProjectID
	}
	if img.ImageDigest != nil {
		resp.ImageDigest = img.ImageDigest
	}
	if img.DiscoveryError != nil {
		resp.DiscoveryError = img.DiscoveryError
	}
	if img.Framework != nil {
		resp.Framework = img.Framework
	}
	if img.FrameworkVersion != nil {
		resp.FrameworkVersion = img.FrameworkVersion
	}
	if img.LastDiscoveredAt != nil {
		resp.LastDiscoveredAt = timestamppb.New(*img.LastDiscoveredAt)
	}

	// Convert discovered tests from map to proto
	if len(img.DiscoveredTests) > 0 {
		resp.DiscoveredTests = make([]*pb.DiscoveredTest, len(img.DiscoveredTests))
		for i, testMap := range img.DiscoveredTests {
			resp.DiscoveredTests[i] = &pb.DiscoveredTest{}
			if v, ok := testMap["test_id"].(string); ok {
				resp.DiscoveredTests[i].Id = v
			}
			if v, ok := testMap["test_name"].(string); ok {
				resp.DiscoveredTests[i].Name = v
			}
			if v, ok := testMap["test_file"].(string); ok {
				resp.DiscoveredTests[i].File = v
			}
			if v, ok := testMap["test_suite"].(string); ok {
				suite := v
				resp.DiscoveredTests[i].Suite = &suite
			}
			if v, ok := testMap["tags"].([]string); ok {
				resp.DiscoveredTests[i].Tags = v
			}
		}
	}

	return resp
}

// testJobToProto converts a services.TestJob to a TestJobResponse proto.
func testJobToProto(j *services.TestJob) *pb.TestJobResponse {
	var testImageID string
	if j.TestImageID != nil {
		testImageID = *j.TestImageID
	}

	resp := &pb.TestJobResponse{
		Id:           j.ID,
		ProjectId:    j.ProjectID,
		TestImageId:  testImageID,
		K8SJobName:   j.K8sJobName,
		K8SNamespace: j.K8sNamespace,
		TestId:       j.TestID,
		JobIndex:     j.JobIndex,
		Status:       j.Status,
		Config:       j.Config,
		CreatedAt:    timestamppb.New(j.CreatedAt),
	}
	if j.TestRunID != nil {
		resp.TestRunId = j.TestRunID
	}
	if j.ExitCode != nil {
		resp.ExitCode = j.ExitCode
	}
	if j.PodName != nil {
		resp.PodName = j.PodName
	}
	if j.ArtifactVolumePath != nil {
		resp.ArtifactVolumePath = j.ArtifactVolumePath
	}
	if j.StartedAt != nil {
		resp.StartedAt = timestamppb.New(*j.StartedAt)
	}
	if j.CompletedAt != nil {
		resp.CompletedAt = timestamppb.New(*j.CompletedAt)
	}
	if j.DurationMs != nil {
		resp.DurationMs = j.DurationMs
	}
	return resp
}

// Ensure time package is used
var _ = time.Now
