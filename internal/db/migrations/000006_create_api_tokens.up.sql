CREATE TABLE api_tokens (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    token_hash  TEXT NOT NULL UNIQUE,  -- SHA-256 of the sct_* token
    prefix      TEXT NOT NULL,         -- First 8 chars for identification
    last_used_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_tokens_team_id ON api_tokens (team_id);
CREATE INDEX idx_api_tokens_token_hash ON api_tokens (token_hash);
