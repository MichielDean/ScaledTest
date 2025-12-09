# Database Schema

This directory contains documentation for the PostgreSQL database schema for ScaledTest.

> **Migration files are located in**: `deploy/helm/scaledtest/migrations/`

## Migration File Location

Migration files are stored in the Helm chart directory for automatic Kubernetes deployment:

```
deploy/helm/scaledtest/migrations/
├── 000001_auth_schema.up.sql
├── 000002_profiles.up.sql
├── 000003_app_tables.up.sql
├── 000004_ctrf_tables.up.sql
├── 000005_projects.up.sql
├── 000006_k8s_clusters.up.sql
└── 000007_system_settings.up.sql
```

## Migration Format

Migrations use [golang-migrate](https://github.com/golang-migrate/migrate) format:

- **Naming**: `NNNNNN_description.up.sql` (6-digit sequence number, underscore-separated description)
- **Forward-only**: No `.down.sql` files - migrations are not reversible in production
- **Idempotent**: Use `IF NOT EXISTS` / `IF EXISTS` clauses where possible
- **Auto-discovery**: Helm's `.Files.Glob` automatically loads all `*.up.sql` files

### Sequence Ranges

- `000001-000099`: Authentication and user management
- `000100-000199`: Profile and settings tables
- `000200-000299`: Application domain tables
- `000300-000399`: Integration tables (K8s, registries, etc.)
- `000400-000499`: Reporting and analytics tables

## How Migrations Work

### Architecture

1. **Extensions (initdb)**: TimescaleDB, uuid-ossp, pgcrypto are created during PostgreSQL initialization via Bitnami's `initdb.scriptsConfigMap`

2. **Schema migrations (Helm hook)**: A Kubernetes Job runs `golang-migrate` as a `post-install,pre-upgrade` hook:
   - Init container waits for PostgreSQL to be ready (`pg_isready`)
   - Main container runs `migrate -path=/migrations -database=$DATABASE_URL up`
   - Job completes before application pods start

### Running Migrations

#### Local Development (Kubernetes/Helm)

Migrations run automatically when deploying with Helm:

```bash
# From repository root - using Tilt (recommended)
npm run dev

# Or using Helm directly
helm dependency update deploy/helm/scaledtest
helm upgrade --install scaledtest deploy/helm/scaledtest
```

#### Manual Execution

```bash
# Connect to PostgreSQL via kubectl
kubectl exec -it $(kubectl get pods -l app.kubernetes.io/name=postgresql -o jsonpath='{.items[0].metadata.name}') -- psql -U scaledtest -d scaledtest

# Or port-forward and use local psql
kubectl port-forward svc/scaledtest-postgresql 5432:5432 &
psql -h localhost -U scaledtest -d scaledtest

# Run migrations manually with golang-migrate CLI
migrate -path deploy/helm/scaledtest/migrations \
  -database "postgres://scaledtest:password@localhost:5432/scaledtest?sslmode=disable" up
```

### Production

For production deployments, migrations run automatically via Helm hooks:

```bash
helm upgrade --install scaledtest deploy/helm/scaledtest \
  -f production-values.yaml
```

## Database Technology

- **PostgreSQL 16** with **TimescaleDB 2.17.2** extension
- TimescaleDB is used for time-series test result data (hypertables, continuous aggregates)
- UUID primary keys for all tables
- Forward-only migrations (no rollback support in production)

## Schema Overview

### Authentication (`auth` schema)
- `auth.users` - User accounts with bcrypt password hashes
- `auth.sessions` - JWT session management

### Profiles (`public` schema)
- `profiles` - Extended user profile information
- Links to `auth.users` via foreign key with auto-sync triggers

### Application Tables
- `projects` - Test projects
- `test_images` - Container images for test runners
- `test_jobs` - Test execution records
- `container_registries` - Docker registry configurations
- `test_artifacts` - Files generated during test execution

### CTRF Results (TimescaleDB hypertable)
- `ctrf_reports` - Test run summary reports
- `ctrf_tests` - Individual test results (hypertable partitioned by timestamp)
- `ctrf_summaries` - Aggregated test statistics
- `ctrf_environments` - Test run environment metadata
- `ctrf_daily_stats` - Continuous aggregate for daily statistics

### Infrastructure
- `k8s_clusters` - Kubernetes cluster configurations
- `system_settings` - Application settings (admin emails, etc.)

## Adding New Migrations

1. Create a new file in `deploy/helm/scaledtest/migrations/` with the next available sequence number:
   ```
   NNNNNN_description.up.sql
   ```

2. Use descriptive names with underscores: `000008_add_test_tags.up.sql`

3. Write idempotent SQL where possible:
   ```sql
   CREATE TABLE IF NOT EXISTS test_tags (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       name TEXT NOT NULL UNIQUE,
       created_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

4. Test locally before committing:
   ```bash
   migrate -path deploy/helm/scaledtest/migrations \
     -database "postgres://scaledtest:password@localhost:5432/scaledtest?sslmode=disable" up
   ```

5. The ConfigMap will automatically include the new file (via Helm's `.Files.Glob`)

## Troubleshooting

### Migration Job Failed

Check the migration job logs:
```bash
kubectl logs job/scaledtest-migrations-<revision>
```

### Database Connection Issues

Verify PostgreSQL is running:
```bash
kubectl get pods -l app.kubernetes.io/name=postgresql
kubectl logs <postgresql-pod>
```

### Extension Not Found

Extensions are created during PostgreSQL initialization. If missing, check:
```bash
kubectl get configmap scaledtest-postgres-initdb -o yaml
kubectl logs <postgresql-pod> | grep -i extension
```
