package services

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

// TestImageService handles test image operations
type TestImageService struct {
	db     *pgxpool.Pool
	logger *zap.Logger
}

// TestImage represents a container image with tests
type TestImage struct {
	ID                string                   `json:"id"`
	ProjectID         *string                  `json:"project_id,omitempty"`
	RegistryID        string                   `json:"registry_id"`
	ImagePath         string                   `json:"image_path"`
	ImageTag          string                   `json:"image_tag"`
	ImageDigest       *string                  `json:"image_digest,omitempty"`
	DiscoveryStatus   string                   `json:"discovery_status"`
	DiscoveryError    *string                  `json:"discovery_error,omitempty"`
	Framework         *string                  `json:"framework,omitempty"`
	FrameworkVersion  *string                  `json:"framework_version,omitempty"`
	TotalTestCount    int                      `json:"total_test_count"`
	DiscoveredTests   []map[string]interface{} `json:"discovered_tests,omitempty"`
	LastDiscoveredAt  *time.Time               `json:"last_discovered_at,omitempty"`
	CreatedBy         string                   `json:"created_by"`
	CreatedAt         time.Time                `json:"created_at"`
	UpdatedAt         time.Time                `json:"updated_at"`
}

// NewTestImageService creates a new test image service
func NewTestImageService(db *pgxpool.Pool, logger *zap.Logger) *TestImageService {
	return &TestImageService{
		db:     db,
		logger: logger,
	}
}

// AddTestImage adds a new test image
func (s *TestImageService) AddTestImage(ctx context.Context, registryID, imagePath, imageTag, createdBy string, projectID *string) (*TestImage, error) {
	imageID := uuid.New().String()
	now := time.Now()

	query := `
		INSERT INTO public.test_images 
		(id, registry_id, project_id, image_path, image_tag, discovery_status, total_test_count, created_by, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id, registry_id, project_id, image_path, image_tag, image_digest, discovery_status, 
		          discovery_error, framework, framework_version, total_test_count, last_discovered_at,
		          created_by, created_at, updated_at
	`

	image := &TestImage{}
	err := s.db.QueryRow(ctx, query,
		imageID, registryID, projectID, imagePath, imageTag, "pending", 0, createdBy, now, now,
	).Scan(
		&image.ID,
		&image.RegistryID,
		&image.ProjectID,
		&image.ImagePath,
		&image.ImageTag,
		&image.ImageDigest,
		&image.DiscoveryStatus,
		&image.DiscoveryError,
		&image.Framework,
		&image.FrameworkVersion,
		&image.TotalTestCount,
		&image.LastDiscoveredAt,
		&image.CreatedBy,
		&image.CreatedAt,
		&image.UpdatedAt,
	)

	if err != nil {
		s.logger.Error("Failed to add test image", zap.Error(err))
		return nil, fmt.Errorf("failed to add test image: %w", err)
	}

	s.logger.Info("Test image added",
		zap.String("image_id", image.ID),
		zap.String("image_path", imagePath),
		zap.String("image_tag", imageTag),
	)

	return image, nil
}

// GetTestImage retrieves a test image by ID
func (s *TestImageService) GetTestImage(ctx context.Context, imageID string) (*TestImage, error) {
	query := `
		SELECT id, registry_id, project_id, image_path, image_tag, image_digest, discovered_tests,
		       discovery_status, discovery_error, framework, framework_version, total_test_count,
		       last_discovered_at, created_by, created_at, updated_at
		FROM public.test_images
		WHERE id = $1
	`

	image := &TestImage{}
	var discoveredTestsJSON []byte

	err := s.db.QueryRow(ctx, query, imageID).Scan(
		&image.ID,
		&image.RegistryID,
		&image.ProjectID,
		&image.ImagePath,
		&image.ImageTag,
		&image.ImageDigest,
		&discoveredTestsJSON,
		&image.DiscoveryStatus,
		&image.DiscoveryError,
		&image.Framework,
		&image.FrameworkVersion,
		&image.TotalTestCount,
		&image.LastDiscoveredAt,
		&image.CreatedBy,
		&image.CreatedAt,
		&image.UpdatedAt,
	)

	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("test image not found: %s", imageID)
	}
	if err != nil {
		s.logger.Error("Failed to get test image", zap.Error(err))
		return nil, fmt.Errorf("failed to get test image: %w", err)
	}

	// Parse discovered tests JSON
	if len(discoveredTestsJSON) > 0 {
		if err := json.Unmarshal(discoveredTestsJSON, &image.DiscoveredTests); err != nil {
			s.logger.Warn("Failed to parse discovered_tests JSON", zap.Error(err))
		}
	}

	return image, nil
}

// ListTestImages lists test images with optional filters
func (s *TestImageService) ListTestImages(ctx context.Context, userID string, registryID, projectID *string, page, pageSize int32) ([]*TestImage, int32, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	offset := (page - 1) * pageSize

	// Build WHERE clause
	whereClause := "WHERE created_by = $1"
	args := []interface{}{userID}
	argIndex := 2

	if registryID != nil {
		whereClause += fmt.Sprintf(" AND registry_id = $%d", argIndex)
		args = append(args, *registryID)
		argIndex++
	}

	if projectID != nil {
		whereClause += fmt.Sprintf(" AND project_id = $%d", argIndex)
		args = append(args, *projectID)
		argIndex++
	}

	// Get total count
	var totalCount int32
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM public.test_images %s", whereClause)
	err := s.db.QueryRow(ctx, countQuery, args...).Scan(&totalCount)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count test images: %w", err)
	}

	// Get images
	query := fmt.Sprintf(`
		SELECT id, registry_id, project_id, image_path, image_tag, image_digest, discovered_tests,
		       discovery_status, discovery_error, framework, framework_version,
		       total_test_count, last_discovered_at, created_by, created_at, updated_at
		FROM public.test_images
		%s
		ORDER BY created_at DESC
		LIMIT $%d OFFSET $%d
	`, whereClause, argIndex, argIndex+1)

	args = append(args, pageSize, offset)

	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		s.logger.Error("Failed to list test images", zap.Error(err))
		return nil, 0, fmt.Errorf("failed to list test images: %w", err)
	}
	defer rows.Close()

	var images []*TestImage
	for rows.Next() {
		image := &TestImage{}
		var discoveredTestsJSON []byte

		err := rows.Scan(
			&image.ID,
			&image.RegistryID,
			&image.ProjectID,
			&image.ImagePath,
			&image.ImageTag,
			&image.ImageDigest,
			&discoveredTestsJSON,
			&image.DiscoveryStatus,
			&image.DiscoveryError,
			&image.Framework,
			&image.FrameworkVersion,
			&image.TotalTestCount,
			&image.LastDiscoveredAt,
			&image.CreatedBy,
			&image.CreatedAt,
			&image.UpdatedAt,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan test image: %w", err)
		}

		// Parse discovered tests JSON
		if len(discoveredTestsJSON) > 0 {
			if err := json.Unmarshal(discoveredTestsJSON, &image.DiscoveredTests); err != nil {
				s.logger.Warn("Failed to parse discovered_tests JSON", zap.Error(err))
			}
		}

		images = append(images, image)
	}

	if err = rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("error iterating test images: %w", err)
	}

	return images, totalCount, nil
}

// UpdateTestImageDiscovery updates test discovery results
func (s *TestImageService) UpdateTestImageDiscovery(ctx context.Context, imageID string, discoveredTests []map[string]interface{}, framework, frameworkVersion, imageDigest *string) error {
	now := time.Now()
	testCount := len(discoveredTests)

	// Marshal discovered tests to JSON
	discoveredTestsJSON, err := json.Marshal(discoveredTests)
	if err != nil {
		return fmt.Errorf("failed to marshal discovered tests: %w", err)
	}

	query := `
		UPDATE public.test_images
		SET discovered_tests = $1,
		    discovery_status = $2,
		    discovery_error = NULL,
		    framework = $3,
		    framework_version = $4,
		    image_digest = $5,
		    total_test_count = $6,
		    last_discovered_at = $7,
		    updated_at = $8
		WHERE id = $9
	`

	result, err := s.db.Exec(ctx, query,
		discoveredTestsJSON, "discovered", framework, frameworkVersion, imageDigest, testCount, now, now, imageID,
	)

	if err != nil {
		s.logger.Error("Failed to update test image discovery", zap.Error(err))
		return fmt.Errorf("failed to update test image discovery: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("test image not found: %s", imageID)
	}

	s.logger.Info("Test image discovery updated",
		zap.String("image_id", imageID),
		zap.Int("test_count", testCount),
	)

	return nil
}

// UpdateTestImageDiscoveryStatus updates only the discovery status (for in-progress or failures)
func (s *TestImageService) UpdateTestImageDiscoveryStatus(ctx context.Context, imageID, status string, errorMsg *string) error {
	now := time.Now()

	query := `
		UPDATE public.test_images
		SET discovery_status = $1,
		    discovery_error = $2,
		    updated_at = $3
		WHERE id = $4
	`

	result, err := s.db.Exec(ctx, query, status, errorMsg, now, imageID)
	if err != nil {
		s.logger.Error("Failed to update test image status", zap.Error(err))
		return fmt.Errorf("failed to update test image status: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("test image not found: %s", imageID)
	}

	s.logger.Info("Test image status updated",
		zap.String("image_id", imageID),
		zap.String("status", status),
	)

	return nil
}

// DeleteTestImage deletes a test image
func (s *TestImageService) DeleteTestImage(ctx context.Context, imageID string) error {
	query := `DELETE FROM public.test_images WHERE id = $1`

	result, err := s.db.Exec(ctx, query, imageID)
	if err != nil {
		s.logger.Error("Failed to delete test image", zap.Error(err))
		return fmt.Errorf("failed to delete test image: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("test image not found: %s", imageID)
	}

	s.logger.Info("Test image deleted", zap.String("image_id", imageID))
	return nil
}
