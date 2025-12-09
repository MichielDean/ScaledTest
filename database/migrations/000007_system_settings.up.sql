-- System Settings Table
-- Stores runtime-configurable settings that can be updated via API
-- Bootstrap settings (DB connection, JWT secret) remain env-var only

CREATE TABLE IF NOT EXISTS public.system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value JSONB NOT NULL,
    setting_type VARCHAR(50) NOT NULL DEFAULT 'string', -- string, number, boolean, json, array
    category VARCHAR(50) NOT NULL DEFAULT 'general', -- general, auth, cors, logging, http
    description TEXT,
    is_sensitive BOOLEAN DEFAULT FALSE, -- If true, value is masked in public config endpoint
    version INTEGER DEFAULT 1, -- Incremented on each update for cache invalidation
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create index for category-based queries
CREATE INDEX IF NOT EXISTS idx_system_settings_category ON public.system_settings(category);

-- Create trigger to auto-update updated_at and version
CREATE OR REPLACE FUNCTION update_system_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    NEW.version = OLD.version + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_system_settings ON public.system_settings;
CREATE TRIGGER trigger_update_system_settings
    BEFORE UPDATE ON public.system_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_system_settings_timestamp();

-- Insert default settings

-- Auth settings
INSERT INTO public.system_settings (setting_key, setting_value, setting_type, category, description, is_sensitive)
VALUES 
    ('auth.token_expiry_hours', '168'::jsonb, 'number', 'auth', 'JWT token expiration time in hours (default: 168 = 7 days)', false),
    ('auth.job_token_expiry_hours', '24'::jsonb, 'number', 'auth', 'Test job token expiration time in hours', false),
    ('auth.admin_emails', '[]'::jsonb, 'array', 'auth', 'List of email addresses that should be granted admin role on registration', true),
    ('auth.first_user_is_admin', 'true'::jsonb, 'boolean', 'auth', 'Whether the first registered user automatically becomes admin', false)
ON CONFLICT (setting_key) DO NOTHING;

-- CORS settings
INSERT INTO public.system_settings (setting_key, setting_value, setting_type, category, description, is_sensitive)
VALUES 
    ('cors.allowed_origins', '"*"'::jsonb, 'string', 'cors', 'Comma-separated list of allowed CORS origins, or * for all', false),
    ('cors.allowed_methods', '"GET,POST,PUT,PATCH,DELETE,OPTIONS"'::jsonb, 'string', 'cors', 'Comma-separated list of allowed HTTP methods', false),
    ('cors.allowed_headers', '"Origin,Content-Type,Accept,Authorization"'::jsonb, 'string', 'cors', 'Comma-separated list of allowed headers', false),
    ('cors.max_age_seconds', '300'::jsonb, 'number', 'cors', 'How long browsers should cache CORS preflight responses', false)
ON CONFLICT (setting_key) DO NOTHING;

-- HTTP settings
INSERT INTO public.system_settings (setting_key, setting_value, setting_type, category, description, is_sensitive)
VALUES 
    ('http.read_timeout_seconds', '30'::jsonb, 'number', 'http', 'HTTP read timeout in seconds', false),
    ('http.write_timeout_seconds', '30'::jsonb, 'number', 'http', 'HTTP write timeout in seconds', false),
    ('http.idle_timeout_seconds', '120'::jsonb, 'number', 'http', 'HTTP idle timeout in seconds', false)
ON CONFLICT (setting_key) DO NOTHING;

-- Logging settings
INSERT INTO public.system_settings (setting_key, setting_value, setting_type, category, description, is_sensitive)
VALUES 
    ('logging.level', '"info"'::jsonb, 'string', 'logging', 'Log level: debug, info, warn, error', false),
    ('logging.format', '"json"'::jsonb, 'string', 'logging', 'Log format: json or text', false)
ON CONFLICT (setting_key) DO NOTHING;

-- General/Feature settings
INSERT INTO public.system_settings (setting_key, setting_value, setting_type, category, description, is_sensitive)
VALUES 
    ('general.app_name', '"ScaledTest"'::jsonb, 'string', 'general', 'Application name displayed in UI', false),
    ('general.api_version', '"v1"'::jsonb, 'string', 'general', 'Current API version', false),
    ('general.config_cache_seconds', '60'::jsonb, 'number', 'general', 'How long clients should cache config before checking for updates', false)
ON CONFLICT (setting_key) DO NOTHING;

-- Add comments
COMMENT ON TABLE public.system_settings IS 'Runtime-configurable system settings. Bootstrap settings (DB, JWT_SECRET) remain in environment variables.';
COMMENT ON COLUMN public.system_settings.is_sensitive IS 'Sensitive settings are excluded from the public /api/v1/config endpoint';
COMMENT ON COLUMN public.system_settings.version IS 'Incremented on each update; clients use this for cache invalidation';
