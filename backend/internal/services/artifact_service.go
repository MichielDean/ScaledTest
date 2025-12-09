package services

import (
	"context"
	"fmt"
	"io"
	"path"
	"strings"
	"time"

	"github.com/MichielDean/ScaledTest/backend/internal/models"
	"github.com/MichielDean/ScaledTest/backend/internal/repository"
	"github.com/MichielDean/ScaledTest/backend/internal/storage"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// ArtifactService handles test artifact operations.
type ArtifactService struct {
	storage storage.ObjectStorage
	repo    repository.ArtifactRepository
	logger  *zap.Logger
}

// NewArtifactService creates a new ArtifactService with injected dependencies.
func NewArtifactService(storage storage.ObjectStorage, repo repository.ArtifactRepository, logger *zap.Logger) *ArtifactService {
	return &ArtifactService{
		storage: storage,
		repo:    repo,
		logger:  logger,
	}
}

// UploadArtifactRequest contains the data for uploading an artifact.
type UploadArtifactRequest struct {
	TestRunID    string
	TestJobID    string
	ArtifactType models.ArtifactType
	Filename     string
	ContentType  string
	Reader       io.Reader
	Size         int64
}

// ArtifactUploadResult contains the result of an artifact upload.
type ArtifactUploadResult struct {
	ID         string `json:"id"`
	ObjectKey  string `json:"object_key"`
	URL        string `json:"url"`
	UploadedAt string `json:"uploaded_at"`
}

// UploadArtifact uploads an artifact and stores its metadata.
func (s *ArtifactService) UploadArtifact(ctx context.Context, req *UploadArtifactRequest, userID string) (*ArtifactUploadResult, error) {
	artifactID := uuid.New().String()

	// Generate object key: testRunID/jobID/artifactType/filename
	objectKey := s.generateObjectKey(req.TestRunID, req.TestJobID, string(req.ArtifactType), artifactID, req.Filename)

	// Upload to S3
	if err := s.storage.UploadArtifact(ctx, objectKey, req.Reader, req.Size, req.ContentType); err != nil {
		s.logger.Error("Failed to upload artifact to storage",
			zap.String("artifact_id", artifactID),
			zap.Error(err))
		return nil, fmt.Errorf("upload to storage: %w", err)
	}

	// Store metadata in database
	artifact := &models.TestArtifact{
		ID:           artifactID,
		TestJobID:    req.TestJobID,
		ArtifactType: req.ArtifactType,
		FilePath:     req.Filename,
		AbsolutePath: objectKey,
		ContentType:  &req.ContentType,
		SizeBytes:    &req.Size,
		CreatedAt:    time.Now(),
	}

	if err := s.repo.Create(ctx, artifact); err != nil {
		// Try to clean up the uploaded file
		_ = s.storage.DeleteArtifact(ctx, objectKey)
		s.logger.Error("Failed to store artifact metadata",
			zap.String("artifact_id", artifactID),
			zap.Error(err))
		return nil, fmt.Errorf("store metadata: %w", err)
	}

	s.logger.Info("Artifact uploaded successfully",
		zap.String("artifact_id", artifactID),
		zap.String("object_key", objectKey),
		zap.Int64("size", req.Size))

	return &ArtifactUploadResult{
		ID:         artifactID,
		ObjectKey:  objectKey,
		UploadedAt: time.Now().Format(time.RFC3339),
	}, nil
}

// GetArtifact retrieves an artifact by ID.
func (s *ArtifactService) GetArtifact(ctx context.Context, artifactID string) (*models.TestArtifact, error) {
	artifact, err := s.repo.GetByID(ctx, artifactID)
	if err != nil {
		return nil, fmt.Errorf("get artifact: %w", err)
	}
	return artifact, nil
}

// GetArtifactDownloadURL generates a presigned URL for downloading an artifact.
func (s *ArtifactService) GetArtifactDownloadURL(ctx context.Context, artifactID string, expiry time.Duration) (string, error) {
	artifact, err := s.repo.GetByID(ctx, artifactID)
	if err != nil {
		return "", fmt.Errorf("get artifact: %w", err)
	}

	if artifact == nil {
		return "", fmt.Errorf("artifact not found")
	}

	url, err := s.storage.GetPresignedURL(ctx, artifact.AbsolutePath, expiry)
	if err != nil {
		return "", fmt.Errorf("generate presigned URL: %w", err)
	}

	return url, nil
}

// DownloadArtifact retrieves the artifact content directly.
func (s *ArtifactService) DownloadArtifact(ctx context.Context, artifactID string) (io.ReadCloser, *models.TestArtifact, error) {
	artifact, err := s.repo.GetByID(ctx, artifactID)
	if err != nil {
		return nil, nil, fmt.Errorf("get artifact: %w", err)
	}

	if artifact == nil {
		return nil, nil, fmt.Errorf("artifact not found")
	}

	reader, _, err := s.storage.GetArtifact(ctx, artifact.AbsolutePath)
	if err != nil {
		return nil, nil, fmt.Errorf("get artifact from storage: %w", err)
	}

	return reader, artifact, nil
}

// ListArtifactsByTestRun lists all artifacts for a test run.
func (s *ArtifactService) ListArtifactsByTestRun(ctx context.Context, testRunID string) ([]*models.TestArtifact, error) {
	artifacts, err := s.repo.ListByTestRunID(ctx, testRunID)
	if err != nil {
		return nil, fmt.Errorf("list artifacts: %w", err)
	}
	return artifacts, nil
}

// ListArtifactsByTestJob lists all artifacts for a test job.
func (s *ArtifactService) ListArtifactsByTestJob(ctx context.Context, testJobID string) ([]*models.TestArtifact, error) {
	artifacts, err := s.repo.ListByTestJobID(ctx, testJobID)
	if err != nil {
		return nil, fmt.Errorf("list artifacts: %w", err)
	}
	return artifacts, nil
}

// DeleteArtifact deletes an artifact by ID.
func (s *ArtifactService) DeleteArtifact(ctx context.Context, artifactID string) error {
	artifact, err := s.repo.GetByID(ctx, artifactID)
	if err != nil {
		return fmt.Errorf("get artifact: %w", err)
	}

	if artifact == nil {
		return fmt.Errorf("artifact not found")
	}

	// Delete from storage
	if err := s.storage.DeleteArtifact(ctx, artifact.AbsolutePath); err != nil {
		s.logger.Warn("Failed to delete artifact from storage",
			zap.String("artifact_id", artifactID),
			zap.Error(err))
		// Continue to delete metadata anyway
	}

	// Delete metadata
	if err := s.repo.Delete(ctx, artifactID); err != nil {
		return fmt.Errorf("delete artifact metadata: %w", err)
	}

	s.logger.Info("Artifact deleted", zap.String("artifact_id", artifactID))
	return nil
}

// DeleteArtifactsByTestRun deletes all artifacts for a test run.
func (s *ArtifactService) DeleteArtifactsByTestRun(ctx context.Context, testRunID string) (int, error) {
	// Delete from storage by prefix
	prefix := fmt.Sprintf("%s/", testRunID)
	deletedFromStorage, err := s.storage.DeleteArtifactsByPrefix(ctx, prefix)
	if err != nil {
		s.logger.Warn("Failed to delete some artifacts from storage",
			zap.String("test_run_id", testRunID),
			zap.Error(err))
	}

	// Delete metadata
	deleted, err := s.repo.DeleteByTestRunID(ctx, testRunID)
	if err != nil {
		return deletedFromStorage, fmt.Errorf("delete artifact metadata: %w", err)
	}

	s.logger.Info("Artifacts deleted for test run",
		zap.String("test_run_id", testRunID),
		zap.Int("storage_deleted", deletedFromStorage),
		zap.Int("metadata_deleted", deleted))

	return deleted, nil
}

// DeleteArtifactsOlderThan deletes artifacts older than the specified duration.
func (s *ArtifactService) DeleteArtifactsOlderThan(ctx context.Context, age time.Duration) (int, error) {
	cutoff := time.Now().Add(-age)

	// Get old artifacts
	artifacts, err := s.repo.ListOlderThan(ctx, cutoff)
	if err != nil {
		return 0, fmt.Errorf("list old artifacts: %w", err)
	}

	deleted := 0
	for _, artifact := range artifacts {
		if err := s.storage.DeleteArtifact(ctx, artifact.AbsolutePath); err != nil {
			s.logger.Warn("Failed to delete old artifact from storage",
				zap.String("artifact_id", artifact.ID),
				zap.Error(err))
			continue
		}

		if err := s.repo.Delete(ctx, artifact.ID); err != nil {
			s.logger.Warn("Failed to delete old artifact metadata",
				zap.String("artifact_id", artifact.ID),
				zap.Error(err))
			continue
		}

		deleted++
	}

	s.logger.Info("Cleaned up old artifacts",
		zap.Duration("age", age),
		zap.Int("deleted", deleted))

	return deleted, nil
}

// generateObjectKey creates a structured object key for storage.
func (s *ArtifactService) generateObjectKey(testRunID, testJobID, artifactType, artifactID, filename string) string {
	// Sanitize filename
	safeFilename := strings.ReplaceAll(filename, "..", "")
	safeFilename = path.Base(safeFilename)

	// Structure: testRunID/jobID/type/artifactID-filename
	return fmt.Sprintf("%s/%s/%s/%s-%s", testRunID, testJobID, artifactType, artifactID, safeFilename)
}
