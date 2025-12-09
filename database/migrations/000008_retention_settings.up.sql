-- Retention Settings Migration
-- Adds data retention configuration to system_settings

-- Retention settings
INSERT INTO public.system_settings (setting_key, setting_value, setting_type, category, description, is_sensitive)
VALUES 
    ('retention.artifact_retention_days', '30'::jsonb, 'number', 'retention', 'Days to keep test artifacts (screenshots, videos, traces). 0 = keep forever.', false),
    ('retention.test_result_retention_days', '90'::jsonb, 'number', 'retention', 'Days to keep test results in database. 0 = keep forever.', false),
    ('retention.log_retention_days', '30'::jsonb, 'number', 'retention', 'Days to keep test execution logs. 0 = keep forever.', false),
    ('retention.cleanup_enabled', 'true'::jsonb, 'boolean', 'retention', 'Enable automatic cleanup of old data based on retention settings.', false),
    ('retention.cleanup_hour_utc', '3'::jsonb, 'number', 'retention', 'Hour of day (0-23 UTC) to run automatic cleanup job.', false)
ON CONFLICT (setting_key) DO NOTHING;

-- Add index for retention category
CREATE INDEX IF NOT EXISTS idx_system_settings_retention ON public.system_settings(category) WHERE category = 'retention';

COMMENT ON COLUMN public.system_settings.setting_value IS 'JSONB value - retention settings control automatic data cleanup';
