package services

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/MichielDean/ScaledTest/backend/internal/models"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

// SystemSettingsService handles system configuration operations
type SystemSettingsService struct {
	db     *pgxpool.Pool
	logger *zap.Logger

	// In-memory cache for settings
	cache         *models.SystemSettings
	cacheVersion  int
	cacheMutex    sync.RWMutex
	lastCacheTime time.Time
}

// NewSystemSettingsService creates a new system settings service
func NewSystemSettingsService(db *pgxpool.Pool, logger *zap.Logger) *SystemSettingsService {
	return &SystemSettingsService{
		db:     db,
		logger: logger,
	}
}

// GetSettings retrieves all system settings, using cache if available
func (s *SystemSettingsService) GetSettings(ctx context.Context) (*models.SystemSettings, error) {
	s.cacheMutex.RLock()
	if s.cache != nil && time.Since(s.lastCacheTime) < 60*time.Second {
		cached := s.cache
		s.cacheMutex.RUnlock()
		return cached, nil
	}
	s.cacheMutex.RUnlock()

	return s.refreshCache(ctx)
}

// GetVersion returns the current settings version for cache invalidation
func (s *SystemSettingsService) GetVersion(ctx context.Context) (int, error) {
	var maxVersion int
	err := s.db.QueryRow(ctx, "SELECT COALESCE(MAX(version), 1) FROM public.system_settings").Scan(&maxVersion)
	if err != nil {
		return 0, fmt.Errorf("failed to get settings version: %w", err)
	}
	return maxVersion, nil
}

// GetPublicConfig returns non-sensitive settings for the public /api/v1/config endpoint
func (s *SystemSettingsService) GetPublicConfig(ctx context.Context) (*models.PublicConfig, error) {
	settings, err := s.GetSettings(ctx)
	if err != nil {
		return nil, err
	}

	return &models.PublicConfig{
		AppName:            settings.General.AppName,
		APIVersion:         settings.General.APIVersion,
		ConfigCacheSeconds: settings.General.ConfigCacheSeconds,
		Version:            settings.Version,
	}, nil
}

// refreshCache loads all settings from the database and updates the cache
func (s *SystemSettingsService) refreshCache(ctx context.Context) (*models.SystemSettings, error) {
	s.cacheMutex.Lock()
	defer s.cacheMutex.Unlock()

	query := `
		SELECT setting_key, setting_value, setting_type, version
		FROM public.system_settings
	`

	rows, err := s.db.Query(ctx, query)
	if err != nil {
		s.logger.Warn("Failed to load settings from DB, using defaults", zap.Error(err))
		s.cache = models.DefaultSystemSettings()
		s.lastCacheTime = time.Now()
		return s.cache, nil
	}
	defer rows.Close()

	// Start with defaults
	settings := models.DefaultSystemSettings()
	maxVersion := 1

	for rows.Next() {
		var key, settingType string
		var valueJSON []byte
		var version int

		if err := rows.Scan(&key, &valueJSON, &settingType, &version); err != nil {
			s.logger.Warn("Failed to scan setting row", zap.Error(err))
			continue
		}

		if version > maxVersion {
			maxVersion = version
		}

		// Parse and apply the setting
		if err := s.applySetting(settings, key, valueJSON, settingType); err != nil {
			s.logger.Warn("Failed to apply setting", zap.String("key", key), zap.Error(err))
		}
	}

	settings.Version = maxVersion
	s.cache = settings
	s.cacheVersion = maxVersion
	s.lastCacheTime = time.Now()

	s.logger.Debug("Settings cache refreshed", zap.Int("version", maxVersion))
	return settings, nil
}

// applySetting parses a single setting and applies it to the settings struct
func (s *SystemSettingsService) applySetting(settings *models.SystemSettings, key string, valueJSON []byte, settingType string) error {
	switch key {
	// Auth settings
	case "auth.token_expiry_hours":
		var v int
		if err := json.Unmarshal(valueJSON, &v); err != nil {
			return err
		}
		settings.Auth.TokenExpiryHours = v

	case "auth.job_token_expiry_hours":
		var v int
		if err := json.Unmarshal(valueJSON, &v); err != nil {
			return err
		}
		settings.Auth.JobTokenExpiryHours = v

	case "auth.admin_emails":
		var v []string
		if err := json.Unmarshal(valueJSON, &v); err != nil {
			return err
		}
		settings.Auth.AdminEmails = v

	case "auth.first_user_is_admin":
		var v bool
		if err := json.Unmarshal(valueJSON, &v); err != nil {
			return err
		}
		settings.Auth.FirstUserIsAdmin = v

	// CORS settings
	case "cors.allowed_origins":
		var v string
		if err := json.Unmarshal(valueJSON, &v); err != nil {
			return err
		}
		settings.CORS.AllowedOrigins = v

	case "cors.allowed_methods":
		var v string
		if err := json.Unmarshal(valueJSON, &v); err != nil {
			return err
		}
		settings.CORS.AllowedMethods = v

	case "cors.allowed_headers":
		var v string
		if err := json.Unmarshal(valueJSON, &v); err != nil {
			return err
		}
		settings.CORS.AllowedHeaders = v

	case "cors.max_age_seconds":
		var v int
		if err := json.Unmarshal(valueJSON, &v); err != nil {
			return err
		}
		settings.CORS.MaxAgeSeconds = v

	// HTTP settings
	case "http.read_timeout_seconds":
		var v int
		if err := json.Unmarshal(valueJSON, &v); err != nil {
			return err
		}
		settings.HTTP.ReadTimeoutSeconds = v

	case "http.write_timeout_seconds":
		var v int
		if err := json.Unmarshal(valueJSON, &v); err != nil {
			return err
		}
		settings.HTTP.WriteTimeoutSeconds = v

	case "http.idle_timeout_seconds":
		var v int
		if err := json.Unmarshal(valueJSON, &v); err != nil {
			return err
		}
		settings.HTTP.IdleTimeoutSeconds = v

	// Logging settings
	case "logging.level":
		var v string
		if err := json.Unmarshal(valueJSON, &v); err != nil {
			return err
		}
		settings.Logging.Level = v

	case "logging.format":
		var v string
		if err := json.Unmarshal(valueJSON, &v); err != nil {
			return err
		}
		settings.Logging.Format = v

	// General settings
	case "general.app_name":
		var v string
		if err := json.Unmarshal(valueJSON, &v); err != nil {
			return err
		}
		settings.General.AppName = v

	case "general.api_version":
		var v string
		if err := json.Unmarshal(valueJSON, &v); err != nil {
			return err
		}
		settings.General.APIVersion = v

	case "general.config_cache_seconds":
		var v int
		if err := json.Unmarshal(valueJSON, &v); err != nil {
			return err
		}
		settings.General.ConfigCacheSeconds = v
	}

	return nil
}

// UpdateSettings updates settings from a partial update request
func (s *SystemSettingsService) UpdateSettings(ctx context.Context, req *models.UpdateSettingsRequest) (*models.SystemSettings, error) {
	// Apply auth settings updates
	if req.Auth != nil {
		if req.Auth.TokenExpiryHours != nil {
			if err := s.updateSetting(ctx, "auth.token_expiry_hours", *req.Auth.TokenExpiryHours); err != nil {
				return nil, err
			}
		}
		if req.Auth.JobTokenExpiryHours != nil {
			if err := s.updateSetting(ctx, "auth.job_token_expiry_hours", *req.Auth.JobTokenExpiryHours); err != nil {
				return nil, err
			}
		}
		if req.Auth.AdminEmails != nil {
			if err := s.updateSetting(ctx, "auth.admin_emails", *req.Auth.AdminEmails); err != nil {
				return nil, err
			}
		}
		if req.Auth.FirstUserIsAdmin != nil {
			if err := s.updateSetting(ctx, "auth.first_user_is_admin", *req.Auth.FirstUserIsAdmin); err != nil {
				return nil, err
			}
		}
	}

	// Apply CORS settings updates
	if req.CORS != nil {
		if req.CORS.AllowedOrigins != nil {
			if err := s.updateSetting(ctx, "cors.allowed_origins", *req.CORS.AllowedOrigins); err != nil {
				return nil, err
			}
		}
		if req.CORS.AllowedMethods != nil {
			if err := s.updateSetting(ctx, "cors.allowed_methods", *req.CORS.AllowedMethods); err != nil {
				return nil, err
			}
		}
		if req.CORS.AllowedHeaders != nil {
			if err := s.updateSetting(ctx, "cors.allowed_headers", *req.CORS.AllowedHeaders); err != nil {
				return nil, err
			}
		}
		if req.CORS.MaxAgeSeconds != nil {
			if err := s.updateSetting(ctx, "cors.max_age_seconds", *req.CORS.MaxAgeSeconds); err != nil {
				return nil, err
			}
		}
	}

	// Apply HTTP settings updates
	if req.HTTP != nil {
		if req.HTTP.ReadTimeoutSeconds != nil {
			if err := s.updateSetting(ctx, "http.read_timeout_seconds", *req.HTTP.ReadTimeoutSeconds); err != nil {
				return nil, err
			}
		}
		if req.HTTP.WriteTimeoutSeconds != nil {
			if err := s.updateSetting(ctx, "http.write_timeout_seconds", *req.HTTP.WriteTimeoutSeconds); err != nil {
				return nil, err
			}
		}
		if req.HTTP.IdleTimeoutSeconds != nil {
			if err := s.updateSetting(ctx, "http.idle_timeout_seconds", *req.HTTP.IdleTimeoutSeconds); err != nil {
				return nil, err
			}
		}
	}

	// Apply Logging settings updates
	if req.Logging != nil {
		if req.Logging.Level != nil {
			if err := s.updateSetting(ctx, "logging.level", *req.Logging.Level); err != nil {
				return nil, err
			}
		}
		if req.Logging.Format != nil {
			if err := s.updateSetting(ctx, "logging.format", *req.Logging.Format); err != nil {
				return nil, err
			}
		}
	}

	// Apply General settings updates
	if req.General != nil {
		if req.General.AppName != nil {
			if err := s.updateSetting(ctx, "general.app_name", *req.General.AppName); err != nil {
				return nil, err
			}
		}
		if req.General.ConfigCacheSeconds != nil {
			if err := s.updateSetting(ctx, "general.config_cache_seconds", *req.General.ConfigCacheSeconds); err != nil {
				return nil, err
			}
		}
	}

	// Invalidate cache and return fresh settings
	s.cacheMutex.Lock()
	s.cache = nil
	s.cacheMutex.Unlock()

	return s.GetSettings(ctx)
}

// updateSetting updates a single setting in the database
func (s *SystemSettingsService) updateSetting(ctx context.Context, key string, value any) error {
	valueJSON, err := json.Marshal(value)
	if err != nil {
		return fmt.Errorf("failed to marshal setting value: %w", err)
	}

	query := `
		UPDATE public.system_settings 
		SET setting_value = $1
		WHERE setting_key = $2
	`

	result, err := s.db.Exec(ctx, query, valueJSON, key)
	if err != nil {
		return fmt.Errorf("failed to update setting %s: %w", key, err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("setting not found: %s", key)
	}

	s.logger.Info("Setting updated", zap.String("key", key))
	return nil
}

// GetAuthSettings is a convenience method to get just auth settings
func (s *SystemSettingsService) GetAuthSettings(ctx context.Context) (*models.AuthSettings, error) {
	settings, err := s.GetSettings(ctx)
	if err != nil {
		return nil, err
	}
	return &settings.Auth, nil
}

// IsFirstUser checks if this would be the first user in the system
func (s *SystemSettingsService) IsFirstUser(ctx context.Context) (bool, error) {
	var count int
	err := s.db.QueryRow(ctx, "SELECT COUNT(*) FROM auth.users").Scan(&count)
	if err != nil {
		return false, fmt.Errorf("failed to count users: %w", err)
	}
	return count == 0, nil
}

// IsAdminEmail checks if an email is in the admin emails list
func (s *SystemSettingsService) IsAdminEmail(ctx context.Context, email string) (bool, error) {
	settings, err := s.GetSettings(ctx)
	if err != nil {
		return false, err
	}

	for _, adminEmail := range settings.Auth.AdminEmails {
		if adminEmail == email {
			return true, nil
		}
	}
	return false, nil
}
