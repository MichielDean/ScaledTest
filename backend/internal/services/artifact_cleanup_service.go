package services

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

// ArtifactCleanupService handles cleanup of expired artifacts
type ArtifactCleanupService struct {
	db              *pgxpool.Pool
	artifactService *ArtifactService
	logger          *zap.Logger
}

// NewArtifactCleanupService creates a new artifact cleanup service
func NewArtifactCleanupService(db *pgxpool.Pool, artifactService *ArtifactService, logger *zap.Logger) *ArtifactCleanupService {
	return &ArtifactCleanupService{
		db:              db,
		artifactService: artifactService,
		logger:          logger,
	}
}

// CleanupExpiredArtifacts removes artifacts older than the retention period
// Returns the number of artifacts deleted
func (s *ArtifactCleanupService) CleanupExpiredArtifacts(ctx context.Context) (int, error) {
	s.logger.Info("Starting artifact cleanup")

	// Get all projects with their retention settings
	projectsQuery := `
		SELECT id, settings
		FROM public.projects
		WHERE deleted_at IS NULL
	`

	rows, err := s.db.Query(ctx, projectsQuery)
	if err != nil {
		return 0, fmt.Errorf("failed to query projects: %w", err)
	}
	defer rows.Close()

	totalDeleted := 0

	for rows.Next() {
		var projectID string
		var settings map[string]interface{}

		if err := rows.Scan(&projectID, &settings); err != nil {
			s.logger.Error("Failed to scan project", zap.Error(err))
			continue
		}

		// Get retention days from settings, default to 30 days
		retentionDays := 30
		if settings != nil {
			if days, ok := settings["artifactRetentionDays"].(float64); ok {
				retentionDays = int(days)
			} else if days, ok := settings["artifactRetentionDays"].(int); ok {
				retentionDays = days
			}
		}

		cutoffTime := time.Now().AddDate(0, 0, -retentionDays)

		s.logger.Debug("Processing project artifacts",
			zap.String("project_id", projectID),
			zap.Int("retention_days", retentionDays),
			zap.Time("cutoff_time", cutoffTime),
		)

		// Find artifacts for this project older than cutoff
		artifactsQuery := `
			SELECT a.id, a.absolute_path
			FROM public.test_artifacts a
			JOIN public.test_jobs j ON j.id = a.test_job_id
			WHERE j.project_id = $1 AND a.created_at < $2
			LIMIT 1000
		`

		artifactRows, err := s.db.Query(ctx, artifactsQuery, projectID, cutoffTime)
		if err != nil {
			s.logger.Error("Failed to query artifacts",
				zap.String("project_id", projectID),
				zap.Error(err),
			)
			continue
		}

		var artifactsToDelete []struct {
			ID   string
			Path string
		}

		for artifactRows.Next() {
			var id, path string
			if err := artifactRows.Scan(&id, &path); err != nil {
				s.logger.Error("Failed to scan artifact", zap.Error(err))
				continue
			}
			artifactsToDelete = append(artifactsToDelete, struct {
				ID   string
				Path string
			}{id, path})
		}
		artifactRows.Close()

		// Delete artifacts from storage and database
		for _, artifact := range artifactsToDelete {
			// Delete from S3 storage
			if err := s.artifactService.storage.DeleteArtifact(ctx, artifact.Path); err != nil {
				s.logger.Warn("Failed to delete artifact from storage",
					zap.String("artifact_id", artifact.ID),
					zap.String("path", artifact.Path),
					zap.Error(err),
				)
				// Continue to delete from database anyway
			}

			// Delete from database
			deleteQuery := `DELETE FROM public.test_artifacts WHERE id = $1`
			if _, err := s.db.Exec(ctx, deleteQuery, artifact.ID); err != nil {
				s.logger.Error("Failed to delete artifact from database",
					zap.String("artifact_id", artifact.ID),
					zap.Error(err),
				)
				continue
			}

			totalDeleted++
		}

		if len(artifactsToDelete) > 0 {
			s.logger.Info("Deleted artifacts for project",
				zap.String("project_id", projectID),
				zap.Int("count", len(artifactsToDelete)),
			)
		}
	}

	s.logger.Info("Artifact cleanup completed",
		zap.Int("total_deleted", totalDeleted),
	)

	return totalDeleted, nil
}

// CleanupArtifactsForProject removes all artifacts for a specific project older than retention period
func (s *ArtifactCleanupService) CleanupArtifactsForProject(ctx context.Context, projectID string, retentionDays int) (int, error) {
	cutoffTime := time.Now().AddDate(0, 0, -retentionDays)

	s.logger.Info("Cleaning up artifacts for project",
		zap.String("project_id", projectID),
		zap.Int("retention_days", retentionDays),
		zap.Time("cutoff_time", cutoffTime),
	)

	// Find artifacts older than cutoff
	artifactsQuery := `
		SELECT a.id, a.absolute_path
		FROM public.test_artifacts a
		JOIN public.test_jobs j ON j.id = a.test_job_id
		WHERE j.project_id = $1 AND a.created_at < $2
	`

	rows, err := s.db.Query(ctx, artifactsQuery, projectID, cutoffTime)
	if err != nil {
		return 0, fmt.Errorf("failed to query artifacts: %w", err)
	}
	defer rows.Close()

	deleted := 0

	for rows.Next() {
		var id, path string
		if err := rows.Scan(&id, &path); err != nil {
			s.logger.Error("Failed to scan artifact", zap.Error(err))
			continue
		}

		// Delete from S3 storage
		if err := s.artifactService.storage.DeleteArtifact(ctx, path); err != nil {
			s.logger.Warn("Failed to delete artifact from storage",
				zap.String("artifact_id", id),
				zap.String("path", path),
				zap.Error(err),
			)
		}

		// Delete from database
		deleteQuery := `DELETE FROM public.test_artifacts WHERE id = $1`
		if _, err := s.db.Exec(ctx, deleteQuery, id); err != nil {
			s.logger.Error("Failed to delete artifact from database",
				zap.String("artifact_id", id),
				zap.Error(err),
			)
			continue
		}

		deleted++
	}

	s.logger.Info("Cleanup completed for project",
		zap.String("project_id", projectID),
		zap.Int("deleted", deleted),
	)

	return deleted, nil
}
