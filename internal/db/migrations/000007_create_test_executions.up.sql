CREATE TABLE test_executions (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id      UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    command      TEXT NOT NULL,
    config       JSONB,           -- Worker configuration (image overrides, env vars, resources)
    report_id    UUID,            -- Set when worker submits results
    k8s_job_name TEXT,
    k8s_pod_name TEXT,
    error_msg    TEXT,
    started_at   TIMESTAMPTZ,
    finished_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_test_executions_team_id ON test_executions (team_id);
CREATE INDEX idx_test_executions_status ON test_executions (status);
CREATE INDEX idx_test_executions_created_at ON test_executions (created_at DESC);
