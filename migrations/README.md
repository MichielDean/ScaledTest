# Migrations Directory Structure

This directory contains all database migrations organized by target database:

## Structure

```
migrations/
├── auth/                    # Better Auth authentication database
│   └── 1756745448607_better-auth-schema.cjs
└── scaledtest/              # Test results and analytics database (TimescaleDB)
    ├── 1756600741568_initial-database-setup.cjs
    └── 1756603754039_add-comprehensive-performance-indexes.cjs
```

## Database Targets

### `auth/` directory

- **Target Database**: `auth`
- **Purpose**: Better Auth user authentication, sessions, accounts
- **Tables**: `user`, `session`, `account`, `verification`
- **Environment Variable**: `DATABASE_URL`

### `scaledtest/` directory

- **Target Database**: `scaledtest`
- **Purpose**: Test results storage and analytics with TimescaleDB
- **Tables**: `test_reports` (hypertable), plus performance indexes
- **Environment Variable**: `TIMESCALE_DATABASE_URL` (overridden to `DATABASE_URL` during migration)

## Running Migrations

All migration configuration is handled via npm scripts with CLI arguments. No separate configuration files are needed.

See the main [MIGRATIONS.md](../MIGRATIONS.md) file for detailed instructions on running migrations.

## Creating New Migrations

When creating new migrations, place them in the appropriate subdirectory:

- Auth-related migrations → `migrations/auth/`
- Test results/analytics migrations → `migrations/scaledtest/`

Use descriptive filenames that indicate both the timestamp and purpose of the migration.
