package services

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/docker/docker/client"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/image"
)

// TestDiscoveryService handles test discovery from container images
type TestDiscoveryService struct {
	db             *pgxpool.Pool
	logger         *zap.Logger
	dockerClient   *client.Client
	imageSvc       *TestImageService
	registrySvc    RegistryManager
}

// NewTestDiscoveryService creates a new test discovery service
func NewTestDiscoveryService(db *pgxpool.Pool, logger *zap.Logger, registrySvc RegistryManager) (*TestDiscoveryService, error) {
	dockerClient, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("failed to create Docker client: %w", err)
	}

	return &TestDiscoveryService{
		db:           db,
		logger:       logger,
		dockerClient: dockerClient,
		imageSvc:     NewTestImageService(db, logger),
		registrySvc:  registrySvc,
	}, nil
}

// CTRFReport represents the Common Test Report Format
type CTRFReport struct {
	// Discovery format
	Framework        string                  `json:"framework"`
	FrameworkVersion string                  `json:"frameworkVersion"`
	Language         string                  `json:"language"`
	DiscoveredAt     string                  `json:"discoveredAt"`
	TotalTests       int                     `json:"totalTests"`
	Tests            []CTRFDiscoveredTest    `json:"tests"`
	
	// Execution results format
	Results CTRFResults `json:"results"`
}

// CTRFDiscoveredTest represents a discovered test (not yet executed)
type CTRFDiscoveredTest struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Suite   string   `json:"suite,omitempty"`
	File    string   `json:"file"`
	Project string   `json:"project,omitempty"`
	Tags    []string `json:"tags,omitempty"`
}

// CTRFResults contains the test results
type CTRFResults struct {
	Tool      CTRFTool    `json:"tool"`
	Summary   CTRFSummary `json:"summary"`
	Tests     []CTRFTest  `json:"tests"`
	Extra     interface{} `json:"extra,omitempty"`
}

// CTRFTool contains information about the test tool
type CTRFTool struct {
	Name    string `json:"name"`
	Version string `json:"version,omitempty"`
}

// CTRFSummary contains test summary statistics
type CTRFSummary struct {
	Tests   int `json:"tests"`
	Passed  int `json:"passed"`
	Failed  int `json:"failed"`
	Pending int `json:"pending"`
	Skipped int `json:"skipped"`
	Other   int `json:"other"`
	Start   int64 `json:"start"`
	Stop    int64 `json:"stop"`
}

// CTRFTest represents a single test
type CTRFTest struct {
	Name      string                 `json:"name"`
	Status    string                 `json:"status"`
	Duration  int                    `json:"duration"`
	Start     int64                  `json:"start,omitempty"`
	Stop      int64                  `json:"stop,omitempty"`
	Suite     string                 `json:"suite,omitempty"`
	Message   string                 `json:"message,omitempty"`
	Trace     string                 `json:"trace,omitempty"`
	RawStatus string                 `json:"rawStatus,omitempty"`
	Tags      []string               `json:"tags,omitempty"`
	Type      string                 `json:"type,omitempty"`
	Filepath  string                 `json:"filePath,omitempty"`
	Extra     map[string]interface{} `json:"extra,omitempty"`
}

// DiscoverTests discovers tests from a container image
func (s *TestDiscoveryService) DiscoverTests(ctx context.Context, imageID string) error {
	s.logger.Info("Starting test discovery", zap.String("image_id", imageID))

	// Get test image details
	testImage, err := s.imageSvc.GetTestImage(ctx, imageID)
	if err != nil {
		return fmt.Errorf("failed to get test image: %w", err)
	}

	// Update status to discovering
	if err := s.imageSvc.UpdateTestImageDiscoveryStatus(ctx, imageID, "discovering", nil); err != nil {
		return fmt.Errorf("failed to update discovery status: %w", err)
	}

	// Get registry details
	registry, err := s.registrySvc.GetContainerRegistry(ctx, testImage.RegistryID)
	if err != nil {
		errMsg := fmt.Sprintf("Failed to get registry: %v", err)
		s.imageSvc.UpdateTestImageDiscoveryStatus(ctx, imageID, "failed", &errMsg)
		return fmt.Errorf("failed to get registry: %w", err)
	}

	// Get registry credentials
	credentials, err := s.registrySvc.GetRegistryCredentials(ctx, testImage.RegistryID)
	if err != nil && err.Error() != "credentials not found" {
		errMsg := fmt.Sprintf("Failed to get credentials: %v", err)
		s.imageSvc.UpdateTestImageDiscoveryStatus(ctx, imageID, "failed", &errMsg)
		return fmt.Errorf("failed to get credentials: %w", err)
	}

	// Build full image reference
	imageRef := s.buildImageReference(registry.RegistryURL, testImage.ImagePath, testImage.ImageTag)
	s.logger.Info("Built image reference", zap.String("image_ref", imageRef))

	// Pull the image
	if err := s.pullImage(ctx, imageRef, registry, credentials); err != nil {
		errMsg := fmt.Sprintf("Failed to pull image: %v", err)
		s.imageSvc.UpdateTestImageDiscoveryStatus(ctx, imageID, "failed", &errMsg)
		return fmt.Errorf("failed to pull image: %w", err)
	}

	// Run container and discover tests
	discoveredTests, framework, frameworkVersion, err := s.runDiscovery(ctx, imageRef)
	if err != nil {
		errMsg := fmt.Sprintf("Failed to discover tests: %v", err)
		s.imageSvc.UpdateTestImageDiscoveryStatus(ctx, imageID, "failed", &errMsg)
		return fmt.Errorf("failed to discover tests: %w", err)
	}

	// Get image digest
	imageDigest, err := s.getImageDigest(ctx, imageRef)
	if err != nil {
		s.logger.Warn("Failed to get image digest", zap.Error(err))
		imageDigest = nil
	}

	// Update test image with discovered tests
	if err := s.imageSvc.UpdateTestImageDiscovery(ctx, imageID, discoveredTests, &framework, &frameworkVersion, imageDigest); err != nil {
		errMsg := fmt.Sprintf("Failed to update discovery results: %v", err)
		s.imageSvc.UpdateTestImageDiscoveryStatus(ctx, imageID, "failed", &errMsg)
		return fmt.Errorf("failed to update discovery results: %w", err)
	}

	s.logger.Info("Test discovery completed successfully",
		zap.String("image_id", imageID),
		zap.Int("test_count", len(discoveredTests)),
	)

	return nil
}

// buildImageReference constructs the full image reference
func (s *TestDiscoveryService) buildImageReference(registryURL, imagePath, imageTag string) string {
	// Remove protocol from registry URL
	registryHost := strings.TrimPrefix(registryURL, "https://")
	registryHost = strings.TrimPrefix(registryHost, "http://")
	
	// For Docker Hub, don't include registry host
	if strings.Contains(registryHost, "docker.io") || registryHost == "registry-1.docker.io" {
		return fmt.Sprintf("%s:%s", imagePath, imageTag)
	}
	
	return fmt.Sprintf("%s/%s:%s", registryHost, imagePath, imageTag)
}

// pullImage pulls the container image from the registry
func (s *TestDiscoveryService) pullImage(ctx context.Context, imageRef string, registry *ContainerRegistry, credentials string) error {
	s.logger.Info("Pulling image", zap.String("image_ref", imageRef))

	pullOptions := image.PullOptions{}
	
	// Add authentication if credentials exist
	if registry.Username != nil && *registry.Username != "" && credentials != "" {
		authConfig := fmt.Sprintf(`{"username":"%s","password":"%s"}`, *registry.Username, credentials)
		pullOptions.RegistryAuth = authConfig
	}

	reader, err := s.dockerClient.ImagePull(ctx, imageRef, pullOptions)
	if err != nil {
		return fmt.Errorf("failed to pull image: %w", err)
	}
	defer reader.Close()

	// Read the pull output (required to actually perform the pull)
	_, err = io.Copy(io.Discard, reader)
	if err != nil {
		return fmt.Errorf("failed to read pull output: %w", err)
	}

	s.logger.Info("Image pulled successfully", zap.String("image_ref", imageRef))
	return nil
}

// runDiscovery runs the container in discovery mode
func (s *TestDiscoveryService) runDiscovery(ctx context.Context, imageRef string) ([]map[string]interface{}, string, string, error) {
	s.logger.Info("Running test discovery container", zap.String("image_ref", imageRef))

	// Create container with discovery mode enabled
	containerConfig := &container.Config{
		Image: imageRef,
		Env: []string{
			"DISCOVERY_MODE=true",
			"NODE_ENV=test",
		},
	}

	hostConfig := &container.HostConfig{
		AutoRemove: true,
		NetworkMode: "bridge",
	}

	resp, err := s.dockerClient.ContainerCreate(ctx, containerConfig, hostConfig, nil, nil, "")
	if err != nil {
		return nil, "", "", fmt.Errorf("failed to create container: %w", err)
	}
	containerID := resp.ID

	// Start container
	if err := s.dockerClient.ContainerStart(ctx, containerID, container.StartOptions{}); err != nil {
		return nil, "", "", fmt.Errorf("failed to start container: %w", err)
	}

	// Wait for container to complete (with timeout)
	waitCtx, cancel := context.WithTimeout(ctx, 120*time.Second)
	defer cancel()

	statusCh, errCh := s.dockerClient.ContainerWait(waitCtx, containerID, container.WaitConditionNotRunning)
	select {
	case err := <-errCh:
		if err != nil {
			return nil, "", "", fmt.Errorf("error waiting for container: %w", err)
		}
	case <-statusCh:
	}

	// Get container logs
	logs, err := s.dockerClient.ContainerLogs(ctx, containerID, container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
	})
	if err != nil {
		return nil, "", "", fmt.Errorf("failed to get container logs: %w", err)
	}
	defer logs.Close()

	logBytes, err := io.ReadAll(logs)
	if err != nil {
		return nil, "", "", fmt.Errorf("failed to read container logs: %w", err)
	}

	logOutput := string(logBytes)
	s.logger.Debug("Container output", zap.String("output", logOutput))

	// Strip Docker log prefixes (8-byte header: stream type + 3 bytes padding + 4 bytes size)
	// Format: [stream_type][0][0][0][size][size][size][size][message]
	cleanOutput := ""
	for i := 0; i < len(logBytes); {
		if i+8 > len(logBytes) {
			break
		}
		// Read size from bytes 4-7 (big endian)
		size := int(logBytes[i+4])<<24 | int(logBytes[i+5])<<16 | int(logBytes[i+6])<<8 | int(logBytes[i+7])
		if i+8+size > len(logBytes) {
			break
		}
		// Extract message
		cleanOutput += string(logBytes[i+8 : i+8+size])
		i += 8 + size
	}

	if cleanOutput == "" {
		cleanOutput = logOutput // Fallback to raw output if parsing fails
	}

	s.logger.Debug("Cleaned container output", zap.String("output", cleanOutput))

	// Look for CTRF JSON output in logs
	// The discover-tests.sh script outputs CTRF format between markers
	var ctrf CTRFReport
	
	// Extract JSON between markers
	jsonStart := strings.Index(cleanOutput, "=== CTRF JSON START ===")
	jsonEnd := strings.Index(cleanOutput, "=== CTRF JSON END ===")
	
	if jsonStart == -1 || jsonEnd == -1 {
		return nil, "", "", fmt.Errorf("no JSON markers found in container output: %s", cleanOutput)
	}
	
	// Extract the JSON content between markers
	jsonStart += len("=== CTRF JSON START ===\n")
	jsonOutput := strings.TrimSpace(cleanOutput[jsonStart:jsonEnd])
	
	if err := json.Unmarshal([]byte(jsonOutput), &ctrf); err != nil {
		return nil, "", "", fmt.Errorf("failed to parse CTRF response: %w (output: %s)", err, jsonOutput)
	}

	// Extract framework information from discovery format
	framework := ctrf.Framework
	frameworkVersion := ctrf.FrameworkVersion

	// Convert discovery tests to map format for storage
	discoveredTests := make([]map[string]interface{}, len(ctrf.Tests))
	for i, test := range ctrf.Tests {
		testMap := map[string]interface{}{
			"id":      test.ID,
			"name":    test.Name,
			"file":    test.File,
			"project": test.Project,
		}

		if test.Suite != "" {
			testMap["suite"] = test.Suite
		}

		if len(test.Tags) > 0 {
			testMap["tags"] = test.Tags
		}

		if test.Project != "" {
			testMap["project"] = test.Project
		}

		discoveredTests[i] = testMap
	}

	s.logger.Info("Tests discovered from container",
		zap.String("framework", framework),
		zap.String("version", frameworkVersion),
		zap.Int("test_count", len(discoveredTests)),
	)

	return discoveredTests, framework, frameworkVersion, nil
}

// getImageDigest retrieves the image digest
func (s *TestDiscoveryService) getImageDigest(ctx context.Context, imageRef string) (*string, error) {
	inspect, _, err := s.dockerClient.ImageInspectWithRaw(ctx, imageRef)
	if err != nil {
		return nil, fmt.Errorf("failed to inspect image: %w", err)
	}

	if len(inspect.RepoDigests) > 0 {
		digest := inspect.RepoDigests[0]
		return &digest, nil
	}

	return nil, nil
}

// Close closes the Docker client
func (s *TestDiscoveryService) Close() error {
	if s.dockerClient != nil {
		return s.dockerClient.Close()
	}
	return nil
}
