CREATE TABLE webhooks (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    url         TEXT NOT NULL,
    events      TEXT[] NOT NULL,  -- {'report.created', 'execution.completed', 'quality_gate.evaluated'}
    secret      TEXT NOT NULL,    -- HMAC-SHA256 secret for payload signing
    active      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhooks_team_id ON webhooks (team_id);
CREATE INDEX idx_webhooks_active ON webhooks (active) WHERE active = true;
