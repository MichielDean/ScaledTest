// System Configuration Types

// Public configuration returned by /api/v1/config
export interface PublicConfig {
  app_name: string;
  version: string;
  maintenance_mode: boolean;
  features: FeatureFlags;
}

export interface FeatureFlags {
  registration_enabled: boolean;
  oauth_enabled: boolean;
  api_docs_enabled: boolean;
}

// Auth settings (admin only)
export interface AuthSettings {
  jwt_expiration_hours: number;
  refresh_token_enabled: boolean;
  admin_emails: string[];
  allowed_domains: string[];
}

// CORS settings (admin only)
export interface CORSSettings {
  allowed_origins: string[];
  allowed_methods: string[];
  allowed_headers: string[];
  allow_credentials: boolean;
  max_age: number;
}

// HTTP server settings (admin only)
export interface HTTPSettings {
  read_timeout_seconds: number;
  write_timeout_seconds: number;
  idle_timeout_seconds: number;
  max_body_size_bytes: number;
}

// Logging settings (admin only)
export interface LoggingSettings {
  level: "debug" | "info" | "warn" | "error";
  format: "json" | "text";
  include_caller: boolean;
}

// General settings (admin only)
export interface GeneralSettings {
  app_name: string;
  maintenance_mode: boolean;
  features: FeatureFlags;
}

// Complete system settings (admin only)
export interface SystemSettings {
  auth: AuthSettings;
  cors: CORSSettings;
  http: HTTPSettings;
  logging: LoggingSettings;
  general: GeneralSettings;
  version: number;
  updated_at: string;
}

// Partial update requests for settings
export interface UpdateAuthSettingsRequest {
  jwt_expiration_hours?: number;
  refresh_token_enabled?: boolean;
  admin_emails?: string[];
  allowed_domains?: string[];
}

export interface UpdateCORSSettingsRequest {
  allowed_origins?: string[];
  allowed_methods?: string[];
  allowed_headers?: string[];
  allow_credentials?: boolean;
  max_age?: number;
}

export interface UpdateHTTPSettingsRequest {
  read_timeout_seconds?: number;
  write_timeout_seconds?: number;
  idle_timeout_seconds?: number;
  max_body_size_bytes?: number;
}

export interface UpdateLoggingSettingsRequest {
  level?: "debug" | "info" | "warn" | "error";
  format?: "json" | "text";
  include_caller?: boolean;
}

export interface UpdateGeneralSettingsRequest {
  app_name?: string;
  maintenance_mode?: boolean;
  features?: Partial<FeatureFlags>;
}

export interface UpdateSystemSettingsRequest {
  auth?: UpdateAuthSettingsRequest;
  cors?: UpdateCORSSettingsRequest;
  http?: UpdateHTTPSettingsRequest;
  logging?: UpdateLoggingSettingsRequest;
  general?: UpdateGeneralSettingsRequest;
}
