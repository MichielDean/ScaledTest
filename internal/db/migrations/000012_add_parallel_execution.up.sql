-- Add parallelism support to test_executions
ALTER TABLE test_executions
    ADD COLUMN parallelism     INT NOT NULL DEFAULT 1,
    ADD COLUMN split_strategy  TEXT CHECK (split_strategy IN ('round-robin', 'by-file', 'by-duration')),
    ADD COLUMN test_files      TEXT[];

-- Worker executions track individual workers within a parallel execution
CREATE TABLE worker_executions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    execution_id    UUID NOT NULL REFERENCES test_executions(id) ON DELETE CASCADE,
    worker_index    INT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    command         TEXT NOT NULL,
    test_files      TEXT[],
    report_id       UUID,
    k8s_job_name    TEXT,
    k8s_pod_name    TEXT,
    error_msg       TEXT,
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (execution_id, worker_index)
);

CREATE INDEX idx_worker_executions_execution_id ON worker_executions (execution_id);
CREATE INDEX idx_worker_executions_status ON worker_executions (status);
