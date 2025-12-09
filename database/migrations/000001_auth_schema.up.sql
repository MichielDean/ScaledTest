-- Authentication schema for Go backend
-- Creates auth schema with users and sessions tables

CREATE SCHEMA IF NOT EXISTS auth;

-- Grant permissions to scaledtest user
GRANT USAGE ON SCHEMA auth TO scaledtest;
GRANT ALL ON SCHEMA auth TO scaledtest;

-- Users table for authentication
CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    encrypted_password TEXT NOT NULL,
    name TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON auth.users(email);

-- Sessions table for JWT token management
CREATE TABLE IF NOT EXISTS auth.sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON auth.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON auth.sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON auth.sessions(expires_at);

-- Grant permissions on tables
GRANT ALL ON ALL TABLES IN SCHEMA auth TO scaledtest;
GRANT ALL ON ALL SEQUENCES IN SCHEMA auth TO scaledtest;

COMMENT ON SCHEMA auth IS 'Authentication schema - managed by Go backend';
