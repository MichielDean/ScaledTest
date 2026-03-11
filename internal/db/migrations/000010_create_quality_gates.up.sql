CREATE TABLE quality_gates (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    rules       JSONB NOT NULL,  -- Array of rule objects [{type, params}]
    active      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_quality_gates_team_id ON quality_gates (team_id);

CREATE TABLE quality_gate_evaluations (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gate_id     UUID NOT NULL REFERENCES quality_gates(id) ON DELETE CASCADE,
    report_id   UUID NOT NULL REFERENCES test_reports(id) ON DELETE CASCADE,
    passed      BOOLEAN NOT NULL,
    details     JSONB NOT NULL,  -- Per-rule results [{rule, passed, actual, threshold}]
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_qg_evaluations_gate_id ON quality_gate_evaluations (gate_id);
CREATE INDEX idx_qg_evaluations_report_id ON quality_gate_evaluations (report_id);
CREATE INDEX idx_qg_evaluations_created_at ON quality_gate_evaluations (created_at DESC);
