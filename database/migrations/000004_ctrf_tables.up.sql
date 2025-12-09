-- CTRF (Common Test Report Format) Schema
-- Based on https://ctrf.io specification
-- Includes test_run_id for K8s Job aggregation

-- Main CTRF reports table
CREATE TABLE IF NOT EXISTS public.ctrf_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_format VARCHAR(10) NOT NULL CHECK (report_format = 'CTRF'),
    spec_version VARCHAR(20) NOT NULL,
    report_id UUID,
    timestamp TIMESTAMPTZ NOT NULL,
    generated_by TEXT,
    extra JSONB,
    -- K8s Job integration fields
    test_run_id UUID,
    job_completion_index INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ctrf_reports_timestamp ON public.ctrf_reports(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ctrf_reports_report_id ON public.ctrf_reports(report_id);
CREATE INDEX IF NOT EXISTS idx_ctrf_reports_test_run_id ON public.ctrf_reports(test_run_id) WHERE test_run_id IS NOT NULL;

COMMENT ON COLUMN public.ctrf_reports.test_run_id IS 'Unique identifier for a test run (K8s Job), shared across all completions';
COMMENT ON COLUMN public.ctrf_reports.job_completion_index IS 'K8s Job completion index for this specific test execution';

-- CTRF tool information
CREATE TABLE IF NOT EXISTS public.ctrf_tools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES public.ctrf_reports(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    version TEXT,
    extra JSONB,
    UNIQUE(report_id) -- One tool per report
);

-- CTRF summary statistics
CREATE TABLE IF NOT EXISTS public.ctrf_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES public.ctrf_reports(id) ON DELETE CASCADE,
    tests INTEGER NOT NULL,
    passed INTEGER NOT NULL,
    failed INTEGER NOT NULL,
    skipped INTEGER NOT NULL,
    pending INTEGER NOT NULL,
    other INTEGER NOT NULL,
    flaky INTEGER,
    suites INTEGER,
    start BIGINT NOT NULL,
    stop BIGINT NOT NULL,
    duration INTEGER,
    extra JSONB,
    UNIQUE(report_id) -- One summary per report
);

-- CTRF environment information
CREATE TABLE IF NOT EXISTS public.ctrf_environments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES public.ctrf_reports(id) ON DELETE CASCADE,
    report_name TEXT,
    app_name TEXT,
    app_version TEXT,
    build_id TEXT,
    build_name TEXT,
    build_number INTEGER,
    build_url TEXT,
    repository_name TEXT,
    repository_url TEXT,
    commit TEXT,
    branch_name TEXT,
    os_platform TEXT,
    os_release TEXT,
    os_version TEXT,
    test_environment TEXT,
    extra JSONB,
    UNIQUE(report_id) -- One environment per report
);

CREATE INDEX IF NOT EXISTS idx_ctrf_environments_branch ON public.ctrf_environments(branch_name);
CREATE INDEX IF NOT EXISTS idx_ctrf_environments_commit ON public.ctrf_environments(commit);

-- CTRF individual test results (hypertable for time-series queries)
CREATE TABLE IF NOT EXISTS public.ctrf_tests (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES public.ctrf_reports(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL, -- Denormalized from report for hypertable partitioning
    test_id UUID, -- Optional test identifier from CTRF
    name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'skipped', 'pending', 'other')),
    duration INTEGER NOT NULL,
    start_time BIGINT,
    stop_time BIGINT,
    suite TEXT[],
    message TEXT,
    trace TEXT,
    snippet TEXT,
    ai TEXT,
    line INTEGER,
    raw_status TEXT,
    tags TEXT[],
    type TEXT,
    file_path TEXT,
    retries INTEGER,
    flaky BOOLEAN,
    browser TEXT,
    device TEXT,
    screenshot TEXT,
    extra JSONB,
    PRIMARY KEY (id, timestamp) -- Composite key including partition column
);

-- Convert ctrf_tests to hypertable for efficient time-series queries
SELECT create_hypertable(
    'public.ctrf_tests',
    'timestamp',
    if_not_exists => TRUE,
    migrate_data => TRUE
);

CREATE INDEX IF NOT EXISTS idx_ctrf_tests_report_id ON public.ctrf_tests(report_id);
CREATE INDEX IF NOT EXISTS idx_ctrf_tests_status ON public.ctrf_tests(status);
CREATE INDEX IF NOT EXISTS idx_ctrf_tests_timestamp ON public.ctrf_tests(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ctrf_tests_name ON public.ctrf_tests(name);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ctrf_reports TO scaledtest;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ctrf_tools TO scaledtest;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ctrf_summaries TO scaledtest;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ctrf_environments TO scaledtest;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ctrf_tests TO scaledtest;

-- Continuous aggregates for daily test statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS public.ctrf_daily_stats
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', timestamp) AS day,
    COUNT(DISTINCT report_id) AS total_runs,
    SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) AS total_passed,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS total_failed,
    SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS total_skipped,
    SUM(CASE WHEN flaky = true THEN 1 ELSE 0 END) AS total_flaky,
    AVG(duration) AS avg_duration,
    MAX(duration) AS max_duration,
    MIN(duration) AS min_duration
FROM public.ctrf_tests
GROUP BY day;

-- Refresh policy for continuous aggregate
SELECT add_continuous_aggregate_policy('public.ctrf_daily_stats',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

-- Retention policy: Keep detailed test data for 90 days
SELECT add_retention_policy('public.ctrf_tests', INTERVAL '90 days', if_not_exists => TRUE);
