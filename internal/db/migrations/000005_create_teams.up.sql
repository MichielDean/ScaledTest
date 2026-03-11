CREATE TABLE teams (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_teams (
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id    UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    role       TEXT NOT NULL DEFAULT 'maintainer'
               CHECK (role IN ('readonly', 'maintainer', 'owner')),
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (user_id, team_id)
);

CREATE INDEX idx_user_teams_team_id ON user_teams (team_id);
