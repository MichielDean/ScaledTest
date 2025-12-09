-- Projects table for K8s platform
-- Projects organize test execution and provide context for test images

-- Projects table
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    git_repository_url TEXT,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID, -- For future multi-tenancy
    settings JSONB DEFAULT '{}'::jsonb,
    -- Environment and setup status
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

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO scaledtest;

COMMENT ON COLUMN public.projects.default_test_environment IS 'Default environment to use when running tests. Users can override per test run.';
COMMENT ON COLUMN public.projects.setup_completed IS 'Whether the project setup wizard has been completed (has cluster, registry, and at least one image)';
COMMENT ON COLUMN public.projects.settings IS 'JSONB settings including artifactRetentionDays (default: 30) for automatic artifact cleanup';

-- Add foreign key constraints to tables created in 03-app-tables.sql
-- These are added here because projects table must exist first
ALTER TABLE public.container_registries 
    DROP CONSTRAINT IF EXISTS container_registries_project_id_fkey,
    ADD CONSTRAINT container_registries_project_id_fkey 
    FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE public.test_images 
    DROP CONSTRAINT IF EXISTS test_images_project_id_fkey,
    ADD CONSTRAINT test_images_project_id_fkey 
    FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE public.test_jobs 
    DROP CONSTRAINT IF EXISTS test_jobs_project_id_fkey,
    ADD CONSTRAINT test_jobs_project_id_fkey 
    FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
