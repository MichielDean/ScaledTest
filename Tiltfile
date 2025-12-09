# -*- mode: Python -*-
# Tiltfile for ScaledTest local development
# 
# Prerequisites:
#   1. Docker Desktop with Kubernetes enabled
#   2. Helm v3 installed with OCI support
#   3. Tilt installed: https://docs.tilt.dev/install.html
#   4. Helm dependencies downloaded:
#      cd deploy/helm/scaledtest && helm dependency update
#
# Usage:
#   tilt up          # Start development environment
#   tilt down        # Stop and clean up
#   tilt up --stream # Start with log streaming

# Configuration
config.define_bool("no-volumes", False)
cfg = config.parse()

# =============================================================================
# Helm Chart Deployment
# =============================================================================

# Deploy using Helm with development values
k8s_yaml(helm(
    'deploy/helm/scaledtest',
    name='scaledtest',
    namespace='default',
    values=['deploy/helm/scaledtest/values-dev.yaml'],
))

# =============================================================================
# Backend Build Configuration
# =============================================================================

# Build backend image with live update support
docker_build(
    'scaledtest-backend',
    context='backend',
    dockerfile='backend/Dockerfile',
    target='development',
    live_update=[
        # Sync Go source files
        sync('backend/', '/app/'),
        # Restart air when go.mod changes (to download new deps)
        run('go mod download', trigger=['go.mod', 'go.sum']),
    ],
    # Only rebuild if these files change significantly
    only=[
        'cmd/',
        'internal/',
        'pkg/',
        'api/',
        'go.mod',
        'go.sum',
        '.air.toml',
    ],
)

# =============================================================================
# Frontend Build Configuration
# =============================================================================

# Build frontend image with live update support
docker_build(
    'scaledtest-frontend',
    context='frontend',
    dockerfile='frontend/Dockerfile',
    target='development',
    live_update=[
        # Sync source files (Vite HMR handles the rest)
        sync('frontend/src/', '/app/src/'),
        sync('frontend/public/', '/app/public/'),
        sync('frontend/index.html', '/app/index.html'),
        # Reinstall deps if package.json changes
        run('npm install', trigger=['package.json', 'package-lock.json']),
    ],
    only=[
        'src/',
        'public/',
        'index.html',
        'package.json',
        'package-lock.json',
        'vite.config.ts',
        'tailwind.config.js',
        'postcss.config.js',
        'tsconfig.json',
    ],
)

# =============================================================================
# Resource Configuration
# =============================================================================

# Backend resource configuration
k8s_resource(
    'scaledtest-backend',
    port_forwards=[
        port_forward(8080, 8080, name='HTTP API'),
        port_forward(9090, 9090, name='gRPC'),
    ],
    labels=['backend'],
    resource_deps=['scaledtest-postgresql'],
)

# Frontend resource configuration  
k8s_resource(
    'scaledtest-frontend',
    port_forwards=[
        port_forward(5173, 80, name='Frontend'),
    ],
    labels=['frontend'],
    resource_deps=['scaledtest-backend'],
)

# Database resource (managed by Bitnami PostgreSQL subchart)
k8s_resource(
    'scaledtest-postgresql',
    labels=['database'],
    port_forwards=[
        port_forward(5432, 5432, name='PostgreSQL'),
    ],
)

# Migrations Job (runs as Helm hook, but track for visibility)
k8s_resource(
    'scaledtest-migrations',
    labels=['database'],
    resource_deps=['scaledtest-postgresql'],
)

# =============================================================================
# Local Development Helpers
# =============================================================================

# Button to get database password (Bitnami PostgreSQL)
local_resource(
    'db-password',
    cmd='kubectl get secret scaledtest-postgresql -o jsonpath="{.data.password}" | base64 -d && echo',
    labels=['helpers'],
    auto_init=False,
)

# Button to connect to database via psql (Bitnami PostgreSQL)
local_resource(
    'db-connect',
    cmd='kubectl exec -it scaledtest-postgresql-0 -- env PGPASSWORD=$(kubectl get secret scaledtest-postgresql -o jsonpath="{.data.password}" | base64 -d) psql -U scaledtest -d scaledtest',
    labels=['helpers'],
    auto_init=False,
)

# Button to view backend logs
local_resource(
    'backend-logs',
    cmd='kubectl logs -f -l app.kubernetes.io/component=backend --tail=100',
    labels=['helpers'],
    auto_init=False,
)

# Button to check migration status
local_resource(
    'migration-status',
    cmd='kubectl get jobs -l app.kubernetes.io/component=migrations && echo "---" && kubectl logs -l app.kubernetes.io/component=migrations --tail=50',
    labels=['helpers'],
    auto_init=False,
)

# =============================================================================
# Test Helpers
# =============================================================================

# Run backend tests
local_resource(
    'test-backend',
    cmd='cd backend && go test ./...',
    labels=['tests'],
    auto_init=False,
)

# Run frontend tests (Playwright)
local_resource(
    'test-frontend',
    cmd='cd frontend && npm test',
    labels=['tests'],
    auto_init=False,
    resource_deps=['scaledtest-frontend', 'scaledtest-backend'],
)

# =============================================================================
# Display useful information on startup
# =============================================================================

print("""
╔══════════════════════════════════════════════════════════════════════════════╗
║                        ScaledTest Development Environment                      ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                                ║
║  Frontend:    http://localhost:5173                                            ║
║  Backend:     http://localhost:8080                                            ║
║  gRPC:        localhost:9090                                                   ║
║  PostgreSQL:  localhost:5432 (TimescaleDB)                                     ║
║                                                                                ║
║  Get DB password:     tilt trigger db-password                                 ║
║  Connect to DB:       tilt trigger db-connect                                  ║
║  Migration status:    tilt trigger migration-status                            ║
║                                                                                ║
║  Database uses Bitnami PostgreSQL subchart with TimescaleDB image.             ║
║  Migrations run automatically via Helm hook on install/upgrade.                ║
║                                                                                ║
╚══════════════════════════════════════════════════════════════════════════════╝
""")
