-- Database initialization for TimescaleDB and Auth
-- Schema and tables are now managed by node-pg-migrate migrations

\echo 'Creating scaledtest database for test reports...'

-- Create the scaledtest database if it doesn't exist
SELECT 'CREATE DATABASE scaledtest'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'scaledtest')\gexec

-- Create the auth database if it doesn't exist
\echo 'Creating auth database for authentication...'
SELECT 'CREATE DATABASE auth'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'auth')\gexec

-- Grant permissions to scaledtest user on both databases
GRANT ALL PRIVILEGES ON DATABASE scaledtest TO scaledtest;
GRANT ALL PRIVILEGES ON DATABASE auth TO scaledtest;

-- Connect to scaledtest database and enable extensions
\c scaledtest;

\echo 'Enabling TimescaleDB extension in scaledtest database...'
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Connect to auth database and enable extensions
\c auth;

\echo 'Enabling extensions in auth database...'
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\echo 'Databases created with extensions. Run migrations to create schemas.'
