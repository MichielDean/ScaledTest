-- triage_results: top-level LLM triage record per CI report (one per report)
CREATE TABLE triage_results (
    id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id       UUID          NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    report_id     UUID          NOT NULL REFERENCES test_reports(id) ON DELETE CASCADE,
    status        TEXT          NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'complete', 'failed')),
    summary       TEXT,
    llm_provider  TEXT,
    llm_model     TEXT,
    input_tokens  INT           NOT NULL DEFAULT 0,
    output_tokens INT           NOT NULL DEFAULT 0,
    cost_usd      DOUBLE PRECISION NOT NULL DEFAULT 0,
    error_msg     TEXT,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (report_id)
);

CREATE INDEX idx_triage_results_team_id   ON triage_results (team_id);
CREATE INDEX idx_triage_results_report_id ON triage_results (report_id);
CREATE INDEX idx_triage_results_status    ON triage_results (status);

-- triage_clusters: groups of test failures sharing a common root cause
CREATE TABLE triage_clusters (
    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    triage_id  UUID        NOT NULL REFERENCES triage_results(id) ON DELETE CASCADE,
    team_id    UUID        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    root_cause TEXT        NOT NULL,
    label      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_triage_clusters_triage_id ON triage_clusters (triage_id);
CREATE INDEX idx_triage_clusters_team_id   ON triage_clusters (team_id);

-- triage_failure_classifications: per-failure LLM classification (new/flaky/regression/unknown)
-- test_result_id is a soft reference to test_results (no FK — test_results is a TimescaleDB hypertable)
CREATE TABLE triage_failure_classifications (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    triage_id      UUID        NOT NULL REFERENCES triage_results(id) ON DELETE CASCADE,
    cluster_id     UUID        REFERENCES triage_clusters(id) ON DELETE SET NULL,
    test_result_id UUID        NOT NULL,
    team_id        UUID        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    classification TEXT        NOT NULL
                               CHECK (classification IN ('new', 'flaky', 'regression', 'unknown')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (triage_id, test_result_id)
);

CREATE INDEX idx_triage_failure_cls_triage_id      ON triage_failure_classifications (triage_id);
CREATE INDEX idx_triage_failure_cls_cluster_id     ON triage_failure_classifications (cluster_id);
CREATE INDEX idx_triage_failure_cls_test_result_id ON triage_failure_classifications (test_result_id);
CREATE INDEX idx_triage_failure_cls_classification ON triage_failure_classifications (triage_id, classification);
