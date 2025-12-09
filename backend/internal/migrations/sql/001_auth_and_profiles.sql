-- +goose Up
-- Authentication schema and user profiles
-- Creates auth schema with users, sessions, and public profiles

-- =============================================================================
-- AUTH SCHEMA
-- =============================================================================

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

-- Grant permissions on auth tables
GRANT ALL ON ALL TABLES IN SCHEMA auth TO scaledtest;
GRANT ALL ON ALL SEQUENCES IN SCHEMA auth TO scaledtest;

COMMENT ON SCHEMA auth IS 'Authentication schema - managed by Go backend';

-- =============================================================================
-- PROFILES TABLE
-- =============================================================================

-- Create public profiles table to store extended user information
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    name TEXT,
    avatar_url TEXT,
    bio TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- +goose StatementBegin
-- Function to automatically create profile when user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, name, created_at, updated_at)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.name,
        NOW(),
        NOW()
    );
    RETURN NEW;
END;
$$;
-- +goose StatementEnd

-- Trigger: Automatically create profile when auth.users is created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- +goose StatementBegin
-- Function to keep email/name in sync when auth.users is updated
CREATE OR REPLACE FUNCTION public.sync_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.profiles
    SET 
        email = NEW.email,
        name = NEW.name,
        updated_at = NOW()
    WHERE id = NEW.id;
    RETURN NEW;
END;
$$;
-- +goose StatementEnd

-- Trigger: Keep profile in sync when auth.users email/name changes
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
    AFTER UPDATE OF email, name ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_user_profile();
