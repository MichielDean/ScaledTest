CREATE TABLE test_reports (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id      UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    execution_id UUID REFERENCES test_executions(id) ON DELETE SET NULL,
    tool_name    TEXT,
    tool_version TEXT,
    environment  JSONB,         -- CTRF environment metadata
    summary      JSONB NOT NULL, -- {tests, passed, failed, skipped, pending, other, start, stop}
    raw          JSONB NOT NULL, -- Full CTRF JSON for archival
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_test_reports_team_id ON test_reports (team_id);
CREATE INDEX idx_test_reports_created_at ON test_reports (created_at DESC);

-- Convert to TimescaleDB hypertable for time-series analytics.
-- This enables efficient time-range queries and automatic partitioning.
-- Wrapped in exception handler: hypertable creation may fail if the primary key
-- does not include the partition column; the table still works as a regular table.
DO $$
BEGIN
    PERFORM create_hypertable('test_reports', 'created_at',
        migrate_data => true,
        if_not_exists => true
    );
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Skipping hypertable for test_reports: %', SQLERRM;
END $$;
