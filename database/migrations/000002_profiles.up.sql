-- User profiles table with auto-sync triggers
-- Creates public.profiles with automatic sync from auth.users

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

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

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

-- Trigger: Automatically create profile when auth.users is created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

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

-- Trigger: Keep profile in sync when auth.users email/name changes
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
    AFTER UPDATE OF email, name ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_user_profile();
