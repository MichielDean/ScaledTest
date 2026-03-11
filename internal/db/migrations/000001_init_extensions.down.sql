-- Extensions are shared; only drop if nothing else uses them.
-- In practice, these are rarely dropped.
DROP EXTENSION IF EXISTS timescaledb CASCADE;
DROP EXTENSION IF EXISTS pgcrypto;
DROP EXTENSION IF EXISTS "uuid-ossp";
