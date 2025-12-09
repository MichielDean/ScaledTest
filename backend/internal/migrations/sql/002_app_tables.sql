-- +goose Up
-- Application tables: projects, registries, images, jobs, artifacts, clusters, settings

-- =============================================================================
-- PROJECTS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    git_repository_url TEXT,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID, -- For future multi-tenancy
    settings JSONB DEFAULT '{}'::jsonb,
    default_test_environment VARCHAR(20) DEFAULT 'dev',
    setup_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(created_by, name),
    CONSTRAINT projects_default_test_environment_check 
        CHECK (default_test_environment IN ('dev', 'staging', 'prod', 'custom'))
);

CREATE INDEX IF NOT EXISTS idx_projects_created_by ON public.projects(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON public.projects(organization_id) WHERE organization_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO scaledtest;

COMMENT ON COLUMN public.projects.default_test_environment IS 'Default environment to use when running tests. Users can override per test run.';
COMMENT ON COLUMN public.projects.setup_completed IS 'Whether the project setup wizard has been completed (has cluster, registry, and at least one image)';

-- =============================================================================
-- CONTAINER REGISTRIES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.container_registries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    registry_url TEXT NOT NULL,
    registry_type TEXT NOT NULL, -- dockerhub, github, gcr, acr, nexus, artifactory, generic
    username TEXT,
    encrypted_credentials BYTEA,
    auth_type TEXT NOT NULL DEFAULT 'basic', -- basic, token, oauth
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    last_tested_at TIMESTAMPTZ,
    test_status TEXT, -- success, failed, pending
    test_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(created_by, registry_url)
);

CREATE INDEX IF NOT EXISTS idx_registries_created_by ON public.container_registries(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_registries_test_status ON public.container_registries(test_status) WHERE test_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_registries_project_id ON public.container_registries(project_id) WHERE project_id IS NOT NULL;

COMMENT ON TABLE public.container_registries IS 'Container registry connections with encrypted credentials';

-- =============================================================================
-- TEST IMAGES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.test_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    registry_id UUID NOT NULL REFERENCES public.container_registries(id) ON DELETE CASCADE,
    image_path TEXT NOT NULL,
    image_tag TEXT NOT NULL,
    image_digest TEXT,
    discovered_tests JSONB,
    discovery_status TEXT NOT NULL DEFAULT 'pending', -- pending, discovering, discovered, failed
    discovery_error TEXT,
    framework TEXT,
    framework_version TEXT,
    total_test_count INTEGER DEFAULT 0,
    last_discovered_at TIMESTAMPTZ,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(created_by, image_path, image_tag)
);

CREATE INDEX IF NOT EXISTS idx_test_images_created_by ON public.test_images(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_images_discovery_status ON public.test_images(discovery_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_images_framework ON public.test_images(framework) WHERE framework IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_test_images_project_id ON public.test_images(project_id) WHERE project_id IS NOT NULL;

COMMENT ON TABLE public.test_images IS 'Tracks Docker images containing tests, with discovered test metadata';

-- =============================================================================
-- TEST JOBS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.test_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    test_image_id UUID NOT NULL REFERENCES public.test_images(id) ON DELETE CASCADE,
    ctrf_report_id UUID, -- Links to CTRF reports table
    test_run_id UUID,
    k8s_job_name TEXT NOT NULL,
    k8s_namespace TEXT NOT NULL DEFAULT 'scaledtest-jobs',
    test_id TEXT NOT NULL,
    job_index INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, running, succeeded, failed, cancelled
    exit_code INTEGER,
    pod_name TEXT,
    pod_logs_path TEXT,
    artifact_volume_path TEXT,
    config JSONB DEFAULT '{}',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_ms BIGINT,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_test_jobs_created_by ON public.test_jobs(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_jobs_test_run_id ON public.test_jobs(test_run_id) WHERE test_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_test_jobs_status ON public.test_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_jobs_k8s_job_name ON public.test_jobs(k8s_job_name);
CREATE INDEX IF NOT EXISTS idx_test_jobs_ctrf_report_id ON public.test_jobs(ctrf_report_id) WHERE ctrf_report_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_test_jobs_image_id ON public.test_jobs(test_image_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_jobs_project_id ON public.test_jobs(project_id) WHERE project_id IS NOT NULL;

COMMENT ON TABLE public.test_jobs IS 'Kubernetes Job execution tracking - one job per test selected';

-- =============================================================================
-- TEST ARTIFACTS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.test_artifacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    test_job_id UUID NOT NULL REFERENCES public.test_jobs(id) ON DELETE CASCADE,
    ctrf_report_id UUID,
    ctrf_test_id UUID,
    artifact_type TEXT NOT NULL, -- screenshot, video, log, trace, report, other
    file_path TEXT NOT NULL,
    absolute_path TEXT NOT NULL,
    content_type TEXT,
    size_bytes BIGINT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_test_artifacts_job_id ON public.test_artifacts(test_job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_artifacts_ctrf_report_id ON public.test_artifacts(ctrf_report_id) WHERE ctrf_report_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_test_artifacts_ctrf_test_id ON public.test_artifacts(ctrf_test_id) WHERE ctrf_test_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_test_artifacts_type ON public.test_artifacts(artifact_type);
CREATE INDEX IF NOT EXISTS idx_test_artifacts_created_at ON public.test_artifacts(created_at DESC);

COMMENT ON TABLE public.test_artifacts IS 'Files generated during test execution (screenshots, videos, logs, traces)';

-- =============================================================================
-- K8S CLUSTERS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.k8s_clusters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    
    -- Connection details
    api_server_url TEXT NOT NULL,
    namespace TEXT NOT NULL DEFAULT 'default',
    
    -- Authentication (one of these methods)
    auth_type TEXT NOT NULL DEFAULT 'token', -- 'token', 'certificate', 'kubeconfig'
    
    -- Token-based auth (service account token)
    bearer_token TEXT,
    
    -- Certificate-based auth
    client_certificate TEXT,
    client_key TEXT,
    
    -- CA certificate for verifying API server
    ca_certificate TEXT,
    skip_tls_verify BOOLEAN DEFAULT FALSE,
    
    -- Full kubeconfig (alternative to individual fields)
    kubeconfig TEXT,
    
    -- Runner configuration
    runner_config JSONB DEFAULT '{
        "platformApiUrl": "",
        "serviceAccountName": "default",
        "artifactsPvcName": "",
        "defaultTimeout": 3600,
        "defaultParallelism": 5,
        "defaultResources": {
            "cpuRequest": "100m",
            "cpuLimit": "1000m",
            "memoryRequest": "256Mi",
            "memoryLimit": "1Gi"
        },
        "nodeSelector": {},
        "tolerations": [],
        "imagePullPolicy": "IfNotPresent"
    }'::jsonb,
    
    -- Environment
    environment VARCHAR(20) DEFAULT 'dev',
    
    -- SUT (System Under Test) configuration for same-cluster testing
    sut_config JSONB DEFAULT NULL,
    
    -- Status and metadata
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    last_connected_at TIMESTAMPTZ,
    connection_status TEXT DEFAULT 'unknown', -- 'connected', 'failed', 'unknown'
    connection_error TEXT,
    
    -- Ownership
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(project_id, name),
    CONSTRAINT k8s_clusters_environment_check 
        CHECK (environment IN ('dev', 'staging', 'prod', 'custom'))
);

CREATE INDEX IF NOT EXISTS idx_k8s_clusters_project_id ON public.k8s_clusters(project_id);
CREATE INDEX IF NOT EXISTS idx_k8s_clusters_created_by ON public.k8s_clusters(created_by);
CREATE INDEX IF NOT EXISTS idx_k8s_clusters_environment ON public.k8s_clusters(project_id, environment);

-- Ensure only one default cluster per project per environment
CREATE UNIQUE INDEX IF NOT EXISTS idx_k8s_clusters_single_default_per_env 
    ON public.k8s_clusters(project_id, environment) 
    WHERE is_default = TRUE;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.k8s_clusters TO scaledtest;

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION public.update_k8s_clusters_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trigger_k8s_clusters_updated_at ON public.k8s_clusters;
CREATE TRIGGER trigger_k8s_clusters_updated_at
    BEFORE UPDATE ON public.k8s_clusters
    FOR EACH ROW
    EXECUTE FUNCTION public.update_k8s_clusters_updated_at();

COMMENT ON COLUMN public.k8s_clusters.runner_config IS 'Configuration for test runner jobs';
COMMENT ON COLUMN public.k8s_clusters.environment IS 'Deployment environment this cluster represents: dev, staging, prod, or custom';
COMMENT ON COLUMN public.k8s_clusters.sut_config IS 'System Under Test configuration for same-cluster testing';

-- =============================================================================
-- SYSTEM SETTINGS TABLE
-- =============================================================================

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

CREATE INDEX IF NOT EXISTS idx_system_settings_category ON public.system_settings(category);

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION update_system_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    NEW.version = OLD.version + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

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

COMMENT ON TABLE public.system_settings IS 'Runtime-configurable system settings. Bootstrap settings (DB, JWT_SECRET) remain in environment variables.';
COMMENT ON COLUMN public.system_settings.is_sensitive IS 'Sensitive settings are excluded from the public /api/v1/config endpoint';
COMMENT ON COLUMN public.system_settings.version IS 'Incremented on each update; clients use this for cache invalidation';

-- Grant permissions on all public tables
GRANT ALL ON ALL TABLES IN SCHEMA public TO scaledtest;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO scaledtest;
