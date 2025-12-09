package services

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/MichielDean/ScaledTest/backend/internal/models"
	"github.com/robfig/cron/v3"
	"go.uber.org/zap"
)

// RetentionScheduler manages scheduled cleanup jobs for data retention.
type RetentionScheduler struct {
	cron            *cron.Cron
	settingsManager SettingsManager
	artifactService *ArtifactService
	// testResultService and logService would be added here
	logger  *zap.Logger
	mu      sync.Mutex
	entryID cron.EntryID
	running bool
}

// NewRetentionScheduler creates a new retention scheduler.
func NewRetentionScheduler(
	settingsManager SettingsManager,
	artifactService *ArtifactService,
	logger *zap.Logger,
) *RetentionScheduler {
	return &RetentionScheduler{
		cron:            cron.New(cron.WithLocation(time.UTC)),
		settingsManager: settingsManager,
		artifactService: artifactService,
		logger:          logger,
	}
}

// Start begins the retention scheduler with the configured schedule.
func (s *RetentionScheduler) Start(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.running {
		return nil
	}

	// Get initial settings
	settings, err := s.settingsManager.GetSettings(ctx)
	if err != nil {
		s.logger.Warn("Failed to get settings, using defaults", zap.Error(err))
		settings = models.DefaultSystemSettings()
	}

	// Schedule cleanup job
	if err := s.scheduleCleanup(settings.Retention); err != nil {
		return fmt.Errorf("schedule cleanup: %w", err)
	}

	s.cron.Start()
	s.running = true

	s.logger.Info("Retention scheduler started",
		zap.Bool("cleanup_enabled", settings.Retention.CleanupEnabled),
		zap.Int("cleanup_hour_utc", settings.Retention.CleanupHourUTC))

	return nil
}

// Stop gracefully shuts down the scheduler.
func (s *RetentionScheduler) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.running {
		return
	}

	ctx := s.cron.Stop()
	<-ctx.Done()

	s.running = false
	s.logger.Info("Retention scheduler stopped")
}

// UpdateSchedule updates the cleanup schedule based on new settings.
func (s *RetentionScheduler) UpdateSchedule(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	settings, err := s.settingsManager.GetSettings(ctx)
	if err != nil {
		return fmt.Errorf("get settings: %w", err)
	}

	// Remove existing job
	if s.entryID != 0 {
		s.cron.Remove(s.entryID)
	}

	// Schedule new job
	if err := s.scheduleCleanup(settings.Retention); err != nil {
		return fmt.Errorf("schedule cleanup: %w", err)
	}

	s.logger.Info("Retention schedule updated",
		zap.Bool("cleanup_enabled", settings.Retention.CleanupEnabled),
		zap.Int("cleanup_hour_utc", settings.Retention.CleanupHourUTC))

	return nil
}

// scheduleCleanup creates a cron job for the cleanup task.
func (s *RetentionScheduler) scheduleCleanup(retention models.RetentionSettings) error {
	if !retention.CleanupEnabled {
		s.logger.Info("Cleanup disabled, not scheduling")
		return nil
	}

	// Create cron expression: run at specified hour daily
	// Format: minute hour * * * (at minute 0 of the specified hour, every day)
	cronExpr := fmt.Sprintf("0 %d * * *", retention.CleanupHourUTC)

	entryID, err := s.cron.AddFunc(cronExpr, func() {
		s.runCleanup()
	})
	if err != nil {
		return fmt.Errorf("add cron job: %w", err)
	}

	s.entryID = entryID
	return nil
}

// runCleanup executes the retention cleanup job.
func (s *RetentionScheduler) runCleanup() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	s.logger.Info("Starting retention cleanup job")
	startTime := time.Now()

	// Get current settings
	settings, err := s.settingsManager.GetSettings(ctx)
	if err != nil {
		s.logger.Error("Failed to get settings for cleanup", zap.Error(err))
		return
	}

	retention := settings.Retention
	var totalDeleted int

	// Cleanup artifacts
	if retention.ArtifactRetentionDays > 0 && s.artifactService != nil {
		age := time.Duration(retention.ArtifactRetentionDays) * 24 * time.Hour
		deleted, err := s.artifactService.DeleteArtifactsOlderThan(ctx, age)
		if err != nil {
			s.logger.Error("Failed to cleanup artifacts", zap.Error(err))
		} else {
			s.logger.Info("Artifact cleanup complete",
				zap.Int("deleted", deleted),
				zap.Int("retention_days", retention.ArtifactRetentionDays))
			totalDeleted += deleted
		}
	}

	// TODO: Cleanup test results using TimescaleDB drop_chunks
	// if retention.TestResultRetentionDays > 0 {
	//     s.cleanupTestResults(ctx, retention.TestResultRetentionDays)
	// }

	// TODO: Cleanup logs
	// if retention.LogRetentionDays > 0 {
	//     s.cleanupLogs(ctx, retention.LogRetentionDays)
	// }

	duration := time.Since(startTime)
	s.logger.Info("Retention cleanup job completed",
		zap.Int("total_deleted", totalDeleted),
		zap.Duration("duration", duration))
}

// RunCleanupNow triggers an immediate cleanup (for manual/API invocation).
func (s *RetentionScheduler) RunCleanupNow() {
	go s.runCleanup()
}

// GetNextRunTime returns the next scheduled cleanup time.
func (s *RetentionScheduler) GetNextRunTime() *time.Time {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.entryID == 0 {
		return nil
	}

	entry := s.cron.Entry(s.entryID)
	if entry.ID == 0 {
		return nil
	}

	next := entry.Next
	return &next
}

// GetCleanupStatus returns the current status of the scheduler.
type CleanupStatus struct {
	Enabled     bool       `json:"enabled"`
	Running     bool       `json:"running"`
	NextRunTime *time.Time `json:"next_run_time,omitempty"`
}

func (s *RetentionScheduler) GetStatus() CleanupStatus {
	s.mu.Lock()
	defer s.mu.Unlock()

	status := CleanupStatus{
		Running: s.running,
	}

	if s.entryID != 0 {
		entry := s.cron.Entry(s.entryID)
		if entry.ID != 0 {
			status.Enabled = true
			next := entry.Next
			status.NextRunTime = &next
		}
	}

	return status
}
