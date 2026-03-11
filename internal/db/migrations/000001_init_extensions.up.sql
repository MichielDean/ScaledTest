-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- TimescaleDB is expected to be pre-installed on the database server.
-- If available, enable it. If not, hypertable creation will be skipped.
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
