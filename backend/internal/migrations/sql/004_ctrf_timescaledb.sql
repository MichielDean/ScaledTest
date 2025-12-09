-- +goose Up
-- +goose NO TRANSACTION
-- TimescaleDB-specific operations: hypertable, continuous aggregates, policies
-- These statements cannot run inside a transaction

-- =============================================================================
-- CONVERT CTRF_TESTS TO HYPERTABLE
-- =============================================================================

SELECT create_hypertable(
    'public.ctrf_tests',
    'timestamp',
    if_not_exists => TRUE,
    migrate_data => TRUE
);

-- =============================================================================
-- CONTINUOUS AGGREGATE FOR DAILY STATISTICS
-- =============================================================================

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
GROUP BY day
WITH NO DATA;

-- =============================================================================
-- REFRESH POLICY FOR CONTINUOUS AGGREGATE
-- =============================================================================

SELECT add_continuous_aggregate_policy('public.ctrf_daily_stats',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

-- =============================================================================
-- RETENTION POLICY: KEEP DETAILED TEST DATA FOR 90 DAYS
-- =============================================================================

SELECT add_retention_policy('public.ctrf_tests', INTERVAL '90 days', if_not_exists => TRUE);
