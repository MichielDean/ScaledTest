CREATE TABLE invitations (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id      UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    email        TEXT NOT NULL,
    role         TEXT NOT NULL DEFAULT 'readonly'
                 CHECK (role IN ('readonly', 'maintainer', 'owner')),
    token_hash   TEXT NOT NULL UNIQUE,
    invited_by   UUID NOT NULL REFERENCES users(id),
    accepted_at  TIMESTAMPTZ,
    expires_at   TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent duplicate pending invites for same email+team (partial unique index)
CREATE UNIQUE INDEX idx_invitations_pending_unique ON invitations (team_id, email) WHERE accepted_at IS NULL;

CREATE INDEX idx_invitations_token_hash ON invitations (token_hash);
CREATE INDEX idx_invitations_team_id ON invitations (team_id);
CREATE INDEX idx_invitations_email ON invitations (email);
