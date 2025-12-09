package models

// SystemSetting represents a single configuration setting stored in the database
type SystemSetting struct {
	ID           string `json:"id"`
	SettingKey   string `json:"setting_key"`
	SettingValue any    `json:"setting_value"` // Parsed from JSONB
	SettingType  string `json:"setting_type"`  // string, number, boolean, json, array
	Category     string `json:"category"`      // general, auth, cors, logging, http
	Description  string `json:"description,omitempty"`
	IsSensitive  bool   `json:"is_sensitive"`
	Version      int    `json:"version"`
}

// SystemSettings groups all settings by category for easier access
type SystemSettings struct {
	Auth      AuthSettings      `json:"auth"`
	CORS      CORSSettings      `json:"cors"`
	HTTP      HTTPSettings      `json:"http"`
	Logging   LoggingSettings   `json:"logging"`
	General   GeneralSettings   `json:"general"`
	Retention RetentionSettings `json:"retention"`
	Version   int               `json:"version"` // Max version across all settings for cache invalidation
}

// AuthSettings contains authentication-related configuration
type AuthSettings struct {
	TokenExpiryHours    int      `json:"token_expiry_hours"`
	JobTokenExpiryHours int      `json:"job_token_expiry_hours"`
	AdminEmails         []string `json:"admin_emails"`
	FirstUserIsAdmin    bool     `json:"first_user_is_admin"`
}

// CORSSettings contains CORS configuration
type CORSSettings struct {
	AllowedOrigins string `json:"allowed_origins"`
	AllowedMethods string `json:"allowed_methods"`
	AllowedHeaders string `json:"allowed_headers"`
	MaxAgeSeconds  int    `json:"max_age_seconds"`
}

// HTTPSettings contains HTTP server configuration
type HTTPSettings struct {
	ReadTimeoutSeconds  int `json:"read_timeout_seconds"`
	WriteTimeoutSeconds int `json:"write_timeout_seconds"`
	IdleTimeoutSeconds  int `json:"idle_timeout_seconds"`
}

// LoggingSettings contains logging configuration
type LoggingSettings struct {
	Level  string `json:"level"`
	Format string `json:"format"`
}

// GeneralSettings contains general application settings
type GeneralSettings struct {
	AppName            string `json:"app_name"`
	APIVersion         string `json:"api_version"`
	ConfigCacheSeconds int    `json:"config_cache_seconds"`
}

// RetentionSettings contains data retention configuration
type RetentionSettings struct {
	ArtifactRetentionDays   int  `json:"artifact_retention_days"`   // Days to keep artifacts (0 = forever)
	TestResultRetentionDays int  `json:"test_result_retention_days"` // Days to keep test results (0 = forever)
	LogRetentionDays        int  `json:"log_retention_days"`        // Days to keep logs (0 = forever)
	CleanupEnabled          bool `json:"cleanup_enabled"`           // Whether automatic cleanup is enabled
	CleanupHourUTC          int  `json:"cleanup_hour_utc"`          // Hour of day (0-23 UTC) to run cleanup
}

// PublicConfig is the subset of settings exposed via /api/v1/config (non-sensitive)
type PublicConfig struct {
	AppName            string `json:"app_name"`
	APIVersion         string `json:"api_version"`
	ConfigCacheSeconds int    `json:"config_cache_seconds"`
	Version            int    `json:"version"`
}

// DefaultSystemSettings returns settings with sensible defaults
// These are used when database values are not available (bootstrap)
func DefaultSystemSettings() *SystemSettings {
	return &SystemSettings{
		Auth: AuthSettings{
			TokenExpiryHours:    168, // 7 days
			JobTokenExpiryHours: 24,
			AdminEmails:         []string{},
			FirstUserIsAdmin:    true,
		},
		CORS: CORSSettings{
			AllowedOrigins: "*",
			AllowedMethods: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
			AllowedHeaders: "Origin,Content-Type,Accept,Authorization",
			MaxAgeSeconds:  300,
		},
		HTTP: HTTPSettings{
			ReadTimeoutSeconds:  30,
			WriteTimeoutSeconds: 30,
			IdleTimeoutSeconds:  120,
		},
		Logging: LoggingSettings{
			Level:  "info",
			Format: "json",
		},
		General: GeneralSettings{
			AppName:            "ScaledTest",
			APIVersion:         "v1",
			ConfigCacheSeconds: 60,
		},
		Retention: RetentionSettings{
			ArtifactRetentionDays:   30,
			TestResultRetentionDays: 90,
			LogRetentionDays:        30,
			CleanupEnabled:          true,
			CleanupHourUTC:          3, // 3 AM UTC
		},
		Version: 1,
	}
}

// UpdateSettingsRequest is used for PATCH /api/v1/system/settings
type UpdateSettingsRequest struct {
	Auth      *AuthSettingsUpdate      `json:"auth,omitempty"`
	CORS      *CORSSettingsUpdate      `json:"cors,omitempty"`
	HTTP      *HTTPSettingsUpdate      `json:"http,omitempty"`
	Logging   *LoggingSettingsUpdate   `json:"logging,omitempty"`
	General   *GeneralSettingsUpdate   `json:"general,omitempty"`
	Retention *RetentionSettingsUpdate `json:"retention,omitempty"`
}

// Partial update structs - all fields are pointers to distinguish "not provided" from "set to zero/empty"
type AuthSettingsUpdate struct {
	TokenExpiryHours    *int      `json:"token_expiry_hours,omitempty"`
	JobTokenExpiryHours *int      `json:"job_token_expiry_hours,omitempty"`
	AdminEmails         *[]string `json:"admin_emails,omitempty"`
	FirstUserIsAdmin    *bool     `json:"first_user_is_admin,omitempty"`
}

type CORSSettingsUpdate struct {
	AllowedOrigins *string `json:"allowed_origins,omitempty"`
	AllowedMethods *string `json:"allowed_methods,omitempty"`
	AllowedHeaders *string `json:"allowed_headers,omitempty"`
	MaxAgeSeconds  *int    `json:"max_age_seconds,omitempty"`
}

type HTTPSettingsUpdate struct {
	ReadTimeoutSeconds  *int `json:"read_timeout_seconds,omitempty"`
	WriteTimeoutSeconds *int `json:"write_timeout_seconds,omitempty"`
	IdleTimeoutSeconds  *int `json:"idle_timeout_seconds,omitempty"`
}

type LoggingSettingsUpdate struct {
	Level  *string `json:"level,omitempty"`
	Format *string `json:"format,omitempty"`
}

type GeneralSettingsUpdate struct {
	AppName            *string `json:"app_name,omitempty"`
	ConfigCacheSeconds *int    `json:"config_cache_seconds,omitempty"`
}

type RetentionSettingsUpdate struct {
	ArtifactRetentionDays   *int  `json:"artifact_retention_days,omitempty"`
	TestResultRetentionDays *int  `json:"test_result_retention_days,omitempty"`
	LogRetentionDays        *int  `json:"log_retention_days,omitempty"`
	CleanupEnabled          *bool `json:"cleanup_enabled,omitempty"`
	CleanupHourUTC          *int  `json:"cleanup_hour_utc,omitempty"`
}
