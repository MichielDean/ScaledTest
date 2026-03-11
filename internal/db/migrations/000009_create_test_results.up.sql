-- Normalized per-test rows extracted from CTRF reports.
-- Eliminates expensive jsonb_array_elements queries for analytics.
CREATE TABLE test_results (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id   UUID NOT NULL REFERENCES test_reports(id) ON DELETE CASCADE,
    team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    status      TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'skipped', 'pending', 'other')),
    duration_ms BIGINT NOT NULL DEFAULT 0,
    message     TEXT,
    trace       TEXT,
    file_path   TEXT,
    suite       TEXT,
    tags        TEXT[],
    retry       INT NOT NULL DEFAULT 0,
    flaky       BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_test_results_report_id ON test_results (report_id);
CREATE INDEX idx_test_results_team_id ON test_results (team_id);
CREATE INDEX idx_test_results_name ON test_results (name);
CREATE INDEX idx_test_results_status ON test_results (status);
CREATE INDEX idx_test_results_created_at ON test_results (created_at DESC);

-- Composite index for common analytics queries
CREATE INDEX idx_test_results_team_name_created ON test_results (team_id, name, created_at DESC);

-- Hypertable for time-series queries on individual test results
SELECT create_hypertable('test_results', 'created_at',
    migrate_data => true,
    if_not_exists => true
);
