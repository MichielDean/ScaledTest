package handlers

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	pb "github.com/MichielDean/ScaledTest/backend/api/proto"
	"github.com/MichielDean/ScaledTest/backend/internal/k8s"
	"github.com/MichielDean/ScaledTest/backend/internal/middleware"
	"github.com/MichielDean/ScaledTest/backend/internal/services"
	"go.uber.org/zap"
	"google.golang.org/grpc/metadata"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// TestJobHandler implements the gRPC TestJobService.
// All dependencies are injected for testability.
type TestJobHandler struct {
	pb.UnimplementedTestJobServiceServer
	projectSvc   services.ProjectManager
	registrySvc  services.RegistryManager
	imageSvc     services.TestImageManager
	executionSvc services.TestExecutor
	clusterSvc   services.ClusterManager
	logger       *zap.Logger
}

// extractUserIDFromContext extracts user ID from gRPC context metadata
// Falls back to checking context values set by middleware
func extractUserIDFromContext(ctx context.Context) string {
	// First, try to get from context value (set by interceptor/middleware)
	if userID, ok := ctx.Value(middleware.UserIDKey).(string); ok && userID != "" {
		return userID
	}

	// Try to get from gRPC metadata
	if md, ok := metadata.FromIncomingContext(ctx); ok {
		if userIDs := md.Get("user_id"); len(userIDs) > 0 && userIDs[0] != "" {
			return userIDs[0]
		}
		if userIDs := md.Get("x-user-id"); len(userIDs) > 0 && userIDs[0] != "" {
			return userIDs[0]
		}
	}

	// Return empty string - caller should handle the error
	return ""
}

// NewTestJobHandler creates a new test job handler with injected dependencies.
func NewTestJobHandler(
	projectSvc services.ProjectManager,
	registrySvc services.RegistryManager,
	imageSvc services.TestImageManager,
	executionSvc services.TestExecutor,
	clusterSvc services.ClusterManager,
	logger *zap.Logger,
) *TestJobHandler {
	return &TestJobHandler{
		projectSvc:   projectSvc,
		registrySvc:  registrySvc,
		imageSvc:     imageSvc,
		executionSvc: executionSvc,
		clusterSvc:   clusterSvc,
		logger:       logger,
	}
}

// getJobManagerForProject creates a JobManager for the project's default cluster
func (h *TestJobHandler) getJobManagerForProject(ctx context.Context, projectID string) (*k8s.JobManager, error) {
	// Get the default cluster for this project
	cluster, err := h.clusterSvc.GetDefaultCluster(ctx, projectID)
	if err != nil {
		return nil, fmt.Errorf("no K8s cluster configured for project: %w", err)
	}

	// Get decrypted credentials
	creds, err := h.clusterSvc.GetClusterCredentials(ctx, cluster.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to get cluster credentials: %w", err)
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
		return nil, fmt.Errorf("failed to create K8s client: %w", err)
	}

	return jobManager, nil
}

// Project Management

func (h *TestJobHandler) CreateProject(ctx context.Context, req *pb.CreateProjectRequest) (*pb.CreateProjectResponse, error) {
	userID := extractUserIDFromContext(ctx)
	if userID == "" {
		return nil, fmt.Errorf("user authentication required")
	}

	project, err := h.projectSvc.CreateProject(
		ctx,
		req.Name,
		ptrOrNil(req.Description),
		nil, // git_repository_url not yet in protobuf, use REST API for this field
		userID,
		ptrOrNil(req.OrganizationId),
		req.Settings,
	)

	if err != nil {
		return nil, err
	}

	return &pb.CreateProjectResponse{
		ProjectId: project.ID,
		Message:   "Project created successfully",
	}, nil
}

func (h *TestJobHandler) GetProject(ctx context.Context, req *pb.GetProjectRequest) (*pb.ProjectResponse, error) {
	project, err := h.projectSvc.GetProject(ctx, req.ProjectId)
	if err != nil {
		return nil, err
	}

	return &pb.ProjectResponse{
		Id:             project.ID,
		Name:           project.Name,
		Description:    ptrToOptional(project.Description),
		CreatedBy:      project.CreatedBy,
		OrganizationId: ptrToOptional(project.OrganizationID),
		Settings:       project.Settings,
		CreatedAt:      timestamppb.New(project.CreatedAt),
		UpdatedAt:      timestamppb.New(project.UpdatedAt),
	}, nil
}

func (h *TestJobHandler) ListProjects(ctx context.Context, req *pb.ListProjectsRequest) (*pb.ListProjectsResponse, error) {
	userID := extractUserIDFromContext(ctx)
	if userID == "" {
		return nil, fmt.Errorf("user authentication required")
	}

	projects, totalCount, err := h.projectSvc.ListProjects(ctx, userID, req.Page, req.PageSize)
	if err != nil {
		return nil, err
	}

	projectResponses := make([]*pb.ProjectResponse, len(projects))
	for i, p := range projects {
		projectResponses[i] = &pb.ProjectResponse{
			Id:             p.ID,
			Name:           p.Name,
			Description:    ptrToOptional(p.Description),
			CreatedBy:      p.CreatedBy,
			OrganizationId: ptrToOptional(p.OrganizationID),
			Settings:       p.Settings,
			CreatedAt:      timestamppb.New(p.CreatedAt),
			UpdatedAt:      timestamppb.New(p.UpdatedAt),
		}
	}

	return &pb.ListProjectsResponse{
		Projects:   projectResponses,
		TotalCount: totalCount,
	}, nil
}

func (h *TestJobHandler) UpdateProject(ctx context.Context, req *pb.UpdateProjectRequest) (*pb.ProjectResponse, error) {
	project, err := h.projectSvc.UpdateProject(
		ctx,
		req.ProjectId,
		ptrOrNil(req.Name),
		ptrOrNil(req.Description),
		nil, // git_repository_url not yet in protobuf, use REST API for this field
		req.Settings,
	)

	if err != nil {
		return nil, err
	}

	return &pb.ProjectResponse{
		Id:             project.ID,
		Name:           project.Name,
		Description:    ptrToOptional(project.Description),
		CreatedBy:      project.CreatedBy,
		OrganizationId: ptrToOptional(project.OrganizationID),
		Settings:       project.Settings,
		CreatedAt:      timestamppb.New(project.CreatedAt),
		UpdatedAt:      timestamppb.New(project.UpdatedAt),
	}, nil
}

func (h *TestJobHandler) DeleteProject(ctx context.Context, req *pb.DeleteProjectRequest) (*pb.DeleteProjectResponse, error) {
	err := h.projectSvc.DeleteProject(ctx, req.ProjectId)
	if err != nil {
		return &pb.DeleteProjectResponse{
			Success: false,
			Message: err.Error(),
		}, err
	}

	return &pb.DeleteProjectResponse{
		Success: true,
		Message: "Project deleted successfully",
	}, nil
}

// Container Registry Management

func (h *TestJobHandler) AddContainerRegistry(ctx context.Context, req *pb.AddContainerRegistryRequest) (*pb.ContainerRegistryResponse, error) {
	userID := extractUserIDFromContext(ctx)
	if userID == "" {
		return nil, fmt.Errorf("user authentication required")
	}
	
	// Convert project_id to pointer
	var projectIDPtr *string
	if req.ProjectId != "" {
		projectIDPtr = &req.ProjectId
	}
	
	registry, err := h.registrySvc.AddContainerRegistry(
		ctx,
		projectIDPtr,
		req.Name,
		req.RegistryUrl,
		req.RegistryType,
		ptrOrNil(req.Username),
		ptrOrNil(req.Credentials),
		req.AuthType,
		userID,
	)

	if err != nil {
		return nil, err
	}

	return &pb.ContainerRegistryResponse{
		Id:           registry.ID,
		ProjectId:    stringPtrToStr(registry.ProjectID),
		Name:         registry.Name,
		RegistryUrl:  registry.RegistryURL,
		RegistryType: registry.RegistryType,
		Username:     ptrToOptional(registry.Username),
		AuthType:     registry.AuthType,
		LastTestedAt: timeToTimestampOptional(registry.LastTestedAt),
		TestStatus:   ptrToOptional(registry.TestStatus),
		TestError:    ptrToOptional(registry.TestError),
		CreatedAt:    timestamppb.New(registry.CreatedAt),
		UpdatedAt:    timestamppb.New(registry.UpdatedAt),
	}, nil
}

func (h *TestJobHandler) TestRegistryConnection(ctx context.Context, req *pb.TestRegistryConnectionRequest) (*pb.TestRegistryConnectionResponse, error) {
	success, message, err := h.registrySvc.TestRegistryConnection(ctx, req.RegistryId)
	if err != nil {
		return nil, err
	}

	return &pb.TestRegistryConnectionResponse{
		Success:  success,
		Message:  message,
		TestedAt: timestamppb.Now(),
	}, nil
}

func (h *TestJobHandler) ListContainerRegistries(ctx context.Context, req *pb.ListContainerRegistriesRequest) (*pb.ListContainerRegistriesResponse, error) {
	userID := extractUserIDFromContext(ctx)
	if userID == "" {
		return nil, fmt.Errorf("user authentication required")
	}
	
	// Convert project_id to pointer
	var projectIDPtr *string
	if req.ProjectId != "" {
		projectIDPtr = &req.ProjectId
	}
	
	registries, totalCount, err := h.registrySvc.ListContainerRegistries(ctx, userID, projectIDPtr, req.Page, req.PageSize)
	if err != nil {
		return nil, err
	}

	registryResponses := make([]*pb.ContainerRegistryResponse, len(registries))
	for i, r := range registries {
		registryResponses[i] = &pb.ContainerRegistryResponse{
			Id:           r.ID,
			ProjectId:    stringPtrToStr(r.ProjectID),
			Name:         r.Name,
			RegistryUrl:  r.RegistryURL,
			RegistryType: r.RegistryType,
			Username:     ptrToOptional(r.Username),
			AuthType:     r.AuthType,
			LastTestedAt: timeToTimestampOptional(r.LastTestedAt),
			TestStatus:   ptrToOptional(r.TestStatus),
			TestError:    ptrToOptional(r.TestError),
			CreatedAt:    timestamppb.New(r.CreatedAt),
			UpdatedAt:    timestamppb.New(r.UpdatedAt),
		}
	}

	return &pb.ListContainerRegistriesResponse{
		Registries: registryResponses,
		TotalCount: totalCount,
	}, nil
}

func (h *TestJobHandler) UpdateContainerRegistry(ctx context.Context, req *pb.UpdateContainerRegistryRequest) (*pb.ContainerRegistryResponse, error) {
	registry, err := h.registrySvc.UpdateContainerRegistry(
		ctx,
		req.RegistryId,
		ptrOrNil(req.Name),
		ptrOrNil(req.Username),
		ptrOrNil(req.Credentials),
	)

	if err != nil {
		return nil, err
	}

	return &pb.ContainerRegistryResponse{
		Id:           registry.ID,
		ProjectId:    stringPtrToStr(registry.ProjectID),
		Name:         registry.Name,
		RegistryUrl:  registry.RegistryURL,
		RegistryType: registry.RegistryType,
		Username:     ptrToOptional(registry.Username),
		AuthType:     registry.AuthType,
		LastTestedAt: timeToTimestampOptional(registry.LastTestedAt),
		TestStatus:   ptrToOptional(registry.TestStatus),
		TestError:    ptrToOptional(registry.TestError),
		CreatedAt:    timestamppb.New(registry.CreatedAt),
		UpdatedAt:    timestamppb.New(registry.UpdatedAt),
	}, nil
}

func (h *TestJobHandler) DeleteContainerRegistry(ctx context.Context, req *pb.DeleteContainerRegistryRequest) (*pb.DeleteContainerRegistryResponse, error) {
	err := h.registrySvc.DeleteContainerRegistry(ctx, req.RegistryId)
	if err != nil {
		return &pb.DeleteContainerRegistryResponse{
			Success: false,
			Message: err.Error(),
		}, err
	}

	return &pb.DeleteContainerRegistryResponse{
		Success: true,
		Message: "Registry deleted successfully",
	}, nil
}

// Test Image Management
// TODO: These gRPC handlers need to be updated to match new TestImageService signatures
// For now, use the REST API endpoints in test_image_handler.go instead

func (h *TestJobHandler) AddTestImage(ctx context.Context, req *pb.AddTestImageRequest) (*pb.TestImageResponse, error) {
	// Get user ID from context (gRPC metadata)
	userID := "system" // TODO: Extract from gRPC metadata
	projectIDPtr := &req.ProjectId
	
	image, err := h.imageSvc.AddTestImage(ctx, req.RegistryId, req.ImagePath, req.ImageTag, userID, projectIDPtr)
	if err != nil {
		return nil, err
	}

	// Trigger discovery if requested
	if req.AutoDiscover {
		go func() {
			// Update status to discovering
			if err := h.imageSvc.UpdateTestImageDiscoveryStatus(context.Background(), image.ID, "discovering", nil); err != nil {
				h.logger.Error("Failed to update discovery status", zap.Error(err))
			}
			// TODO: Actual discovery logic in Phase 9
		}()
	}

	return h.buildTestImageResponse(image), nil
}

func (h *TestJobHandler) DiscoverTests(ctx context.Context, req *pb.DiscoverTestsRequest) (*pb.DiscoverTestsResponse, error) {
	// TODO: Implement in Phase 9 - Test Discovery Logic
	return &pb.DiscoverTestsResponse{
		Success:   false,
		Message:   "Test discovery not yet implemented. Use REST API endpoints.",
		TestCount: 0,
		Tests:     nil,
	}, nil
}

func (h *TestJobHandler) GetTestImage(ctx context.Context, req *pb.GetTestImageRequest) (*pb.TestImageResponse, error) {
	image, err := h.imageSvc.GetTestImage(ctx, req.TestImageId)
	if err != nil {
		return nil, err
	}

	return h.buildTestImageResponse(image), nil
}

func (h *TestJobHandler) ListTestImages(ctx context.Context, req *pb.ListTestImagesRequest) (*pb.ListTestImagesResponse, error) {
	// TODO: Update to match new service signature
	// For now, return empty list
	return &pb.ListTestImagesResponse{
		Images:     []*pb.TestImageResponse{},
		TotalCount: 0,
	}, nil
}

func (h *TestJobHandler) DeleteTestImage(ctx context.Context, req *pb.DeleteTestImageRequest) (*pb.DeleteTestImageResponse, error) {
	err := h.imageSvc.DeleteTestImage(ctx, req.TestImageId)
	if err != nil {
		return &pb.DeleteTestImageResponse{
			Success: false,
			Message: err.Error(),
		}, err
	}

	return &pb.DeleteTestImageResponse{
		Success: true,
		Message: "Test image deleted successfully",
	}, nil
}

// Test Job Execution

func (h *TestJobHandler) TriggerTestJobs(ctx context.Context, req *pb.TriggerTestJobsRequest) (*pb.TriggerTestJobsResponse, error) {
	// Extract user ID from context
	userID := extractUserIDFromContext(ctx)
	if userID == "" {
		h.logger.Warn("No user ID found in gRPC context, TriggerTestJobs requires authentication")
		return &pb.TriggerTestJobsResponse{
			Success: false,
			Message: "User authentication required",
		}, nil
	}

	// Convert resources
	var resources *k8s.ResourceRequirements
	if req.Resources != nil {
		resources = &k8s.ResourceRequirements{
			CPURequest:    strOrDefault(req.Resources.CpuRequest),
			CPULimit:      strOrDefault(req.Resources.CpuLimit),
			MemoryRequest: strOrDefault(req.Resources.MemoryRequest),
			MemoryLimit:   strOrDefault(req.Resources.MemoryLimit),
		}
	}

	timeout := int32OrDefault(req.TimeoutSeconds, 3600)
	parallelism := int32OrDefault(req.Parallelism, int32(len(req.TestIds)))

	// Get base URL from request if provided (for gRPC, it would be in Environment)
	baseUrlOverride := ""
	if url, ok := req.Environment["BASE_URL"]; ok {
		baseUrlOverride = url
	}

	k8sJobName, testRunID, jobIDs, err := h.executionSvc.TriggerTestJobs(
		ctx,
		req.ProjectId,
		req.TestImageId,
		userID,
		req.TestIds,
		baseUrlOverride,
		req.Environment,
		resources,
		timeout,
		parallelism,
	)

	if err != nil {
		return &pb.TriggerTestJobsResponse{
			Success: false,
			Message: err.Error(),
		}, err
	}

	h.logger.Info("Test jobs triggered via gRPC",
		zap.String("k8s_job_name", k8sJobName),
		zap.String("test_run_id", testRunID),
		zap.Int("test_count", len(req.TestIds)))

	return &pb.TriggerTestJobsResponse{
		Success:    true,
		Message:    "Test jobs triggered successfully",
		K8SJobName: k8sJobName,
		TestRunId:  testRunID,
		JobIds:     jobIDs,
		TotalTests: int32(len(req.TestIds)),
	}, nil
}

func (h *TestJobHandler) GetTestJob(ctx context.Context, req *pb.GetTestJobRequest) (*pb.TestJobResponse, error) {
	job, err := h.executionSvc.GetTestJob(ctx, req.JobId)
	if err != nil {
		return nil, err
	}

	return h.buildTestJobResponse(job), nil
}

func (h *TestJobHandler) ListTestJobs(ctx context.Context, req *pb.ListTestJobsRequest) (*pb.ListTestJobsResponse, error) {
	jobs, totalCount, stats, err := h.executionSvc.ListTestJobs(
		ctx,
		req.ProjectId,
		req.Page,
		req.PageSize,
		ptrOrNil(req.Status),
		ptrOrNil(req.TestImageId),
		ptrOrNil(req.K8SJobName),
	)

	if err != nil {
		return nil, err
	}

	jobResponses := make([]*pb.TestJobResponse, len(jobs))
	for i, job := range jobs {
		jobResponses[i] = h.buildTestJobResponse(job)
	}

	var statsResponse *pb.JobStatsSummary
	if stats != nil {
		statsResponse = &pb.JobStatsSummary{
			Pending:   stats.Pending,
			Running:   stats.Running,
			Succeeded: stats.Succeeded,
			Failed:    stats.Failed,
			Cancelled: stats.Cancelled,
		}
	}

	return &pb.ListTestJobsResponse{
		Jobs:       jobResponses,
		TotalCount: totalCount,
		Stats:      statsResponse,
	}, nil
}

func (h *TestJobHandler) CancelTestJob(ctx context.Context, req *pb.CancelTestJobRequest) (*pb.CancelTestJobResponse, error) {
	err := h.executionSvc.CancelTestJob(ctx, req.JobId)
	if err != nil {
		return &pb.CancelTestJobResponse{
			Success: false,
			Message: err.Error(),
		}, err
	}

	return &pb.CancelTestJobResponse{
		Success: true,
		Message: "Test job cancelled successfully",
	}, nil
}

func (h *TestJobHandler) StreamJobLogs(req *pb.StreamJobLogsRequest, stream pb.TestJobService_StreamJobLogsServer) error {
	ctx := stream.Context()

	// Get job details to find pod name and project
	job, err := h.executionSvc.GetTestJob(ctx, req.JobId)
	if err != nil {
		return fmt.Errorf("failed to get job: %w", err)
	}

	// Need pod name to get logs
	if job.PodName == nil || *job.PodName == "" {
		return fmt.Errorf("job has no associated pod yet")
	}

	// Get JobManager for this project's cluster
	jobManager, err := h.getJobManagerForProject(ctx, job.ProjectID)
	if err != nil {
		return fmt.Errorf("failed to get K8s client: %w", err)
	}

	// Determine tail lines
	tailLines := int64(100) // Default
	if req.TailLines != nil && *req.TailLines > 0 {
		tailLines = int64(*req.TailLines)
	}

	// Stream logs from the pod
	logStream, err := jobManager.StreamPodLogs(ctx, *job.PodName, tailLines, req.Follow)
	if err != nil {
		return fmt.Errorf("failed to stream pod logs: %w", err)
	}
	defer logStream.Close()

	// Read and send log lines
	buf := make([]byte, 4096)
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
			n, err := logStream.Read(buf)
			if n > 0 {
				chunk := &pb.JobLogChunk{
					JobId:     req.JobId,
					LogLine:   string(buf[:n]),
					Timestamp: timestamppb.Now(),
				}
				if sendErr := stream.Send(chunk); sendErr != nil {
					return sendErr
				}
			}
			if err != nil {
				if err == io.EOF {
					return nil
				}
				return fmt.Errorf("error reading logs: %w", err)
			}
		}
	}
}

func (h *TestJobHandler) StreamJobStatus(req *pb.StreamJobStatusRequest, stream pb.TestJobService_StreamJobStatusServer) error {
	ctx := stream.Context()

	// Get JobManager for this project's cluster
	jobManager, err := h.getJobManagerForProject(ctx, req.ProjectId)
	if err != nil {
		return fmt.Errorf("failed to get K8s client: %w", err)
	}

	// Track previous status for each job to detect changes
	previousStatus := make(map[string]string)

	// Poll for status changes (K8s watch would be better but this is simpler)
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			// Get jobs from database with optional filter
			var k8sJobName *string
			if req.K8SJobName != nil && *req.K8SJobName != "" {
				k8sJobName = req.K8SJobName
			}

			jobs, _, _, err := h.executionSvc.ListTestJobs(ctx, req.ProjectId, 1, 1000, nil, nil, k8sJobName)
			if err != nil {
				h.logger.Warn("Failed to list jobs for status stream", zap.Error(err))
				continue
			}

			for _, job := range jobs {
				prevStatus, exists := previousStatus[job.ID]
				if !exists || prevStatus != job.Status {
					// Status changed, send update
					update := &pb.TestJobStatusUpdate{
						JobId:          job.ID,
						TestId:         job.TestID,
						PreviousStatus: prevStatus,
						CurrentStatus:  job.Status,
						UpdatedAt:      timestamppb.Now(),
					}
					if job.ExitCode != nil {
						update.ExitCode = job.ExitCode
					}

					if err := stream.Send(update); err != nil {
						return err
					}

					previousStatus[job.ID] = job.Status
				}
			}

			// Check if all jobs in the batch are complete
			if k8sJobName != nil {
				status, err := jobManager.GetJobStatus(ctx, *k8sJobName)
				if err == nil && status.Active == 0 {
					// All pods finished, stream can end
					return nil
				}
			}
		}
	}
}

// Artifact Management

func (h *TestJobHandler) ListArtifacts(ctx context.Context, req *pb.ListArtifactsRequest) (*pb.ListArtifactsResponse, error) {
	// Get job details to find artifact path
	job, err := h.executionSvc.GetTestJob(ctx, req.JobId)
	if err != nil {
		return nil, fmt.Errorf("failed to get job: %w", err)
	}

	// Check if job has artifact path
	if job.ArtifactVolumePath == nil || *job.ArtifactVolumePath == "" {
		return &pb.ListArtifactsResponse{
			Artifacts:      []*pb.ArtifactInfo{},
			TotalCount:     0,
			TotalSizeBytes: 0,
		}, nil
	}

	// List files in the artifact directory
	artifactPath := *job.ArtifactVolumePath
	entries, err := os.ReadDir(artifactPath)
	if err != nil {
		if os.IsNotExist(err) {
			return &pb.ListArtifactsResponse{
				Artifacts:      []*pb.ArtifactInfo{},
				TotalCount:     0,
				TotalSizeBytes: 0,
			}, nil
		}
		return nil, fmt.Errorf("failed to read artifact directory: %w", err)
	}

	var artifacts []*pb.ArtifactInfo
	var totalSize int64

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			h.logger.Warn("Failed to get file info", zap.String("file", entry.Name()), zap.Error(err))
			continue
		}

		// Determine artifact type from extension
		artifactType := determineArtifactType(entry.Name())

		// Filter by type if requested
		if req.ArtifactType != nil && *req.ArtifactType != "" && artifactType != *req.ArtifactType {
			continue
		}

		artifacts = append(artifacts, &pb.ArtifactInfo{
			Id:           fmt.Sprintf("%s/%s", req.JobId, entry.Name()),
			JobId:        req.JobId,
			ArtifactType: artifactType,
			FilePath:     filepath.Join(artifactPath, entry.Name()),
			ContentType:  getContentType(entry.Name()),
			SizeBytes:    info.Size(),
			CreatedAt:    timestamppb.New(info.ModTime()),
		})

		totalSize += info.Size()
	}

	return &pb.ListArtifactsResponse{
		Artifacts:      artifacts,
		TotalCount:     int32(len(artifacts)),
		TotalSizeBytes: totalSize,
	}, nil
}

func (h *TestJobHandler) GetArtifactDownloadUrl(ctx context.Context, req *pb.GetArtifactDownloadUrlRequest) (*pb.GetArtifactDownloadUrlResponse, error) {
	// Artifact ID format: jobId/filename
	// The actual download will be served via REST endpoint
	expiresIn := int32(3600) // 1 hour default
	if req.ExpiresInSeconds != nil && *req.ExpiresInSeconds > 0 {
		expiresIn = *req.ExpiresInSeconds
	}

	// Generate a download URL pointing to the REST endpoint
	// In production, this could be a pre-signed URL for object storage
	downloadUrl := fmt.Sprintf("/api/v1/artifacts/%s/download", req.ArtifactId)

	return &pb.GetArtifactDownloadUrlResponse{
		DownloadUrl: downloadUrl,
		ExpiresAt:   timestamppb.New(time.Now().Add(time.Duration(expiresIn) * time.Second)),
	}, nil
}

// determineArtifactType returns the artifact type based on file extension
func determineArtifactType(filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".png", ".jpg", ".jpeg", ".gif", ".webp":
		return "screenshot"
	case ".webm", ".mp4", ".avi":
		return "video"
	case ".zip":
		if strings.Contains(strings.ToLower(filename), "trace") {
			return "trace"
		}
		return "archive"
	case ".log", ".txt":
		return "log"
	case ".json", ".html", ".xml":
		return "report"
	default:
		return "other"
	}
}

// getContentType returns the MIME type based on file extension
func getContentType(filename string) *string {
	ext := strings.ToLower(filepath.Ext(filename))
	contentTypes := map[string]string{
		".png":  "image/png",
		".jpg":  "image/jpeg",
		".jpeg": "image/jpeg",
		".gif":  "image/gif",
		".webp": "image/webp",
		".webm": "video/webm",
		".mp4":  "video/mp4",
		".zip":  "application/zip",
		".log":  "text/plain",
		".txt":  "text/plain",
		".json": "application/json",
		".html": "text/html",
		".xml":  "application/xml",
	}
	if ct, ok := contentTypes[ext]; ok {
		return &ct
	}
	ct := "application/octet-stream"
	return &ct
}

// Helper functions

func (h *TestJobHandler) buildTestImageResponse(image *services.TestImage) *pb.TestImageResponse {
	discoveredTests := make([]*pb.DiscoveredTest, len(image.DiscoveredTests))
	for i, t := range image.DiscoveredTests {
		// DiscoveredTests is now []map[string]interface{} from JSONB
		suite := getOptionalStringFromMap(t, "suite")
		discoveredTests[i] = &pb.DiscoveredTest{
			Id:    getStringFromMap(t, "id"),
			Name:  getStringFromMap(t, "name"),
			Suite: &suite,
			File:  getStringFromMap(t, "file"),
			Tags:  getStringArrayFromMap(t, "tags"),
		}
	}

	projectID := ""
	if image.ProjectID != nil {
		projectID = *image.ProjectID
	}

	return &pb.TestImageResponse{
		Id:                image.ID,
		ProjectId:         projectID,
		RegistryId:        image.RegistryID,
		ImagePath:         image.ImagePath,
		ImageTag:          image.ImageTag,
		ImageDigest:       ptrToOptional(image.ImageDigest),
		DiscoveryStatus:   image.DiscoveryStatus,
		DiscoveryError:    ptrToOptional(image.DiscoveryError),
		Framework:         ptrToOptional(image.Framework),
		FrameworkVersion:  ptrToOptional(image.FrameworkVersion),
		TotalTestCount:    int32(image.TotalTestCount),
		DiscoveredTests:   discoveredTests,
		LastDiscoveredAt:  timeToTimestampOptional(image.LastDiscoveredAt),
		CreatedAt:         timestamppb.New(image.CreatedAt),
		UpdatedAt:         timestamppb.New(image.UpdatedAt),
	}
}

// Helper functions for extracting values from map[string]interface{}
func getStringFromMap(m map[string]interface{}, key string) string {
	if v, ok := m[key]; ok {
		if str, ok := v.(string); ok {
			return str
		}
	}
	return ""
}

func getOptionalStringFromMap(m map[string]interface{}, key string) string {
	return getStringFromMap(m, key)
}

func getStringArrayFromMap(m map[string]interface{}, key string) []string {
	if v, ok := m[key]; ok {
		if arr, ok := v.([]interface{}); ok {
			result := make([]string, 0, len(arr))
			for _, item := range arr {
				if str, ok := item.(string); ok {
					result = append(result, str)
				}
			}
			return result
		}
	}
	return []string{}
}

func (h *TestJobHandler) buildTestJobResponse(job *services.TestJob) *pb.TestJobResponse {
	return &pb.TestJobResponse{
		Id:                 job.ID,
		ProjectId:          job.ProjectID,
		TestImageId:        job.TestImageID,
		TestRunId:          ptrToOptional(job.TestRunID),
		K8SJobName:         job.K8sJobName,
		K8SNamespace:       job.K8sNamespace,
		TestId:             job.TestID,
		JobIndex:           job.JobIndex,
		Status:             job.Status,
		ExitCode:           int32PtrToVal(job.ExitCode),
		PodName:            ptrToOptional(job.PodName),
		ArtifactVolumePath: ptrToOptional(job.ArtifactVolumePath),
		Config:             job.Config,
		StartedAt:          timeToTimestampOptional(job.StartedAt),
		CompletedAt:        timeToTimestampOptional(job.CompletedAt),
		DurationMs:         int64PtrToVal(job.DurationMs),
		CreatedAt:          timestamppb.New(job.CreatedAt),
	}
}

func ptrOrNil(s *string) *string {
	if s == nil || *s == "" {
		return nil
	}
	return s
}

func ptrToOptional(s *string) *string {
	return s
}

func timeToTimestampOptional(t *time.Time) *timestamppb.Timestamp {
	if t == nil {
		return nil
	}
	return timestamppb.New(*t)
}

func strOrDefault(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func stringPtrToStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func int32OrDefault(i *int32, defaultVal int32) int32 {
	if i == nil || *i == 0 {
		return defaultVal
	}
	return *i
}

func int32OrZero(i *int32) int32 {
	if i == nil {
		return 0
	}
	return *i
}

func int64OrZero(i *int64) int64 {
	if i == nil {
		return 0
	}
	return *i
}

func int32PtrToVal(i *int32) *int32 {
	if i == nil {
		zero := int32(0)
		return &zero
	}
	return i
}

func int64PtrToVal(i *int64) *int64 {
	if i == nil {
		zero := int64(0)
		return &zero
	}
	return i
}
