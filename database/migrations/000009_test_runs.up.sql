-- Test runs and test cases tables for legacy/simple test result uploads
-- Used by the UploadTestResults gRPC endpoint

-- Main test runs table
CREATE TABLE IF NOT EXISTS public.test_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    branch TEXT,
    commit_sha TEXT,
    total_tests INTEGER NOT NULL DEFAULT 0,
    passed_tests INTEGER NOT NULL DEFAULT 0,
    failed_tests INTEGER NOT NULL DEFAULT 0,
    skipped_tests INTEGER NOT NULL DEFAULT 0,
    pending_tests INTEGER NOT NULL DEFAULT 0,
    total_duration_ms BIGINT NOT NULL DEFAULT 0,
    environment JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_test_runs_uploaded_by ON public.test_runs(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_test_runs_created_at ON public.test_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_runs_branch ON public.test_runs(branch);

COMMENT ON TABLE public.test_runs IS 'Test run records from UploadTestResults API';
COMMENT ON COLUMN public.test_runs.uploaded_by IS 'User who uploaded the test run';
COMMENT ON COLUMN public.test_runs.environment IS 'JSON object with environment variables';

-- Individual test cases table
CREATE TABLE IF NOT EXISTS public.test_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_run_id UUID NOT NULL REFERENCES public.test_runs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    suite TEXT,
    status TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'skipped', 'pending', 'error')),
    duration_ms BIGINT NOT NULL DEFAULT 0,
    error_message TEXT,
    stack_trace TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_test_cases_test_run_id ON public.test_cases(test_run_id);
CREATE INDEX IF NOT EXISTS idx_test_cases_status ON public.test_cases(status);
CREATE INDEX IF NOT EXISTS idx_test_cases_name ON public.test_cases(name);

COMMENT ON TABLE public.test_cases IS 'Individual test case results';
COMMENT ON COLUMN public.test_cases.test_run_id IS 'FK to parent test_run';

-- Grant permissions to scaledtest user
GRANT SELECT, INSERT, UPDATE, DELETE ON public.test_runs TO scaledtest;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.test_cases TO scaledtest;
