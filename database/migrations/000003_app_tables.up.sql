-- Core application tables
-- Creates container_registries, test_images, test_jobs, test_artifacts

-- Container registries table - stores registry connection details
CREATE TABLE IF NOT EXISTS public.container_registries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    registry_url TEXT NOT NULL,
    registry_type TEXT NOT NULL, -- dockerhub, github, gcr, acr, nexus, artifactory, generic
    username TEXT,
    encrypted_credentials BYTEA,
    auth_type TEXT NOT NULL DEFAULT 'basic', -- basic, token, oauth
    project_id UUID, -- Added: FK to projects (created in 05-projects.sql, constraint added there)
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

-- Test images table - tracks container images with discovered tests
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
    project_id UUID, -- Added: FK to projects (constraint added in 05-projects.sql)
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(created_by, image_path, image_tag)
);

CREATE INDEX IF NOT EXISTS idx_test_images_created_by ON public.test_images(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_images_discovery_status ON public.test_images(discovery_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_images_framework ON public.test_images(framework) WHERE framework IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_test_images_project_id ON public.test_images(project_id) WHERE project_id IS NOT NULL;

-- Test jobs table - tracks Kubernetes Job execution
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
    project_id UUID, -- Added: FK to projects (constraint added in 05-projects.sql)
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

-- Test artifacts table - tracks files generated during test execution
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

-- Grant permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO scaledtest;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO scaledtest;

COMMENT ON TABLE public.container_registries IS 'Container registry connections with encrypted credentials';
COMMENT ON TABLE public.test_images IS 'Tracks Docker images containing tests, with discovered test metadata';
COMMENT ON TABLE public.test_jobs IS 'Kubernetes Job execution tracking - one job per test selected';
COMMENT ON TABLE public.test_artifacts IS 'Files generated during test execution (screenshots, videos, logs, traces)';
