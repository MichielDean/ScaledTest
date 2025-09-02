-- Enable TimescaleDB extension
-- This script runs when the database is first initialized

\echo 'Enabling TimescaleDB extension...'

-- Create TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Create additional useful extensions for search and compression
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- For trigram-based text search
CREATE EXTENSION IF NOT EXISTS btree_gin;  -- For better index performance

\echo 'TimescaleDB extension enabled successfully!'

-- Log some information about the setup
SELECT 'TimescaleDB Version: ' || extversion FROM pg_extension WHERE extname = 'timescaledb';
