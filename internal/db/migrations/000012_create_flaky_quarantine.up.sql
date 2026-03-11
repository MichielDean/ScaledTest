-- Flaky test quarantine: tracks tests identified as flaky that should be
-- quarantined (auto-skipped) in future executions.
CREATE TABLE IF NOT EXISTS flaky_test_quarantine (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    test_name   TEXT NOT NULL,
    suite       TEXT,
    file_path   TEXT,
    reason      TEXT NOT NULL DEFAULT 'auto-detected',
    auto_detected BOOLEAN NOT NULL DEFAULT true,
    active      BOOLEAN NOT NULL DEFAULT true,
    flip_count  INT NOT NULL DEFAULT 0,
    flip_rate   DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_runs  INT NOT NULL DEFAULT 0,
    last_failure_message TEXT,
    quarantined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: one quarantine entry per test per team
CREATE UNIQUE INDEX idx_flaky_quarantine_team_test
    ON flaky_test_quarantine (team_id, test_name) WHERE active = true;

CREATE INDEX idx_flaky_quarantine_team
    ON flaky_test_quarantine (team_id);

CREATE INDEX idx_flaky_quarantine_active
    ON flaky_test_quarantine (team_id, active) WHERE active = true;
