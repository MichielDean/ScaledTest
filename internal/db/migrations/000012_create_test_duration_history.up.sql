-- Historical test duration tracking for intelligent sharding.
-- Stores aggregated duration stats per test name per team.
CREATE TABLE test_duration_history (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    test_name   TEXT NOT NULL,
    suite       TEXT NOT NULL DEFAULT '',
    avg_duration_ms   BIGINT NOT NULL DEFAULT 0,
    p95_duration_ms   BIGINT NOT NULL DEFAULT 0,
    min_duration_ms   BIGINT NOT NULL DEFAULT 0,
    max_duration_ms   BIGINT NOT NULL DEFAULT 0,
    run_count         INT NOT NULL DEFAULT 0,
    last_status       TEXT NOT NULL DEFAULT 'unknown',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (team_id, test_name, suite)
);

CREATE INDEX idx_test_duration_history_team ON test_duration_history (team_id);
CREATE INDEX idx_test_duration_history_lookup ON test_duration_history (team_id, suite);
