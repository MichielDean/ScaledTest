# ScaledTest Helm Chart

A Helm chart for deploying ScaledTest - a Kubernetes-native test execution platform.

## Prerequisites

- **Kubernetes 1.27+** or **OpenShift 4.14+**
- **Helm 3.12+**

## Quick Start

```bash
# Install (development)
helm install scaledtest . -f values-dev.yaml -n scaledtest --create-namespace

# Install (OpenShift)
helm install scaledtest . -f values-openshift.yaml -n scaledtest --create-namespace
```

## Installation

### Development

```bash
helm install scaledtest . \
  -f values-dev.yaml \
  -n scaledtest --create-namespace
```

Access services via NodePort:
| Service | URL |
|---------|-----|
| Frontend | http://localhost:30173 |
| Backend API | http://localhost:30080 |
| gRPC | localhost:30090 |

### Production (Kubernetes)

```bash
helm install scaledtest . \
  -n scaledtest --create-namespace \
  --set ingress.enabled=true \
  --set ingress.host=scaledtest.example.com \
  --set ingress.tls.enabled=true
```

### OpenShift

```bash
helm install scaledtest . \
  -f values-openshift.yaml \
  -n scaledtest --create-namespace \
  --set route.host=scaledtest.apps.your-cluster.com
```

The `values-openshift.yaml` file configures:
- OpenShift Route instead of Ingress
- Arbitrary UID support (restricted-v2 SCC compatible)
- Proper security contexts for all components

## Architecture

```
                    ┌──────────────────┐
                    │ Ingress / Route  │
                    └────────┬─────────┘
                             │
             ┌───────────────┼───────────────┐
             │               │               │
             ▼               ▼               │
      ┌─────────────┐ ┌─────────────┐        │
      │  Frontend   │ │   Backend   │◄───────┘
      │   (nginx)   │ │    (Go)     │  /api, /health
      └─────────────┘ └──────┬──────┘
                             │
                ┌────────────┼────────────┐
                │            │            │
                ▼            ▼            ▼
         ┌───────────┐ ┌──────────┐ ┌──────────┐
         │PostgreSQL │ │  MinIO   │ │  K8s API │
         │(TimescaleDB)│ │(Artifacts)│ │ (Jobs)   │
         └───────────┘ └──────────┘ └──────────┘
```

## Components

| Component | Description |
|-----------|-------------|
| **Backend** | Go API server (REST + gRPC) with embedded migrations |
| **Frontend** | React SPA served by nginx |
| **PostgreSQL** | TimescaleDB for test results and metadata |
| **MinIO** | S3-compatible storage for test artifacts |

## Configuration

### Key Values

```yaml
# Backend configuration
backend:
  image:
    repository: ghcr.io/your-org/scaledtest-backend
    tag: "1.0.0"
  resources:
    limits:
      cpu: 1000m
      memory: 512Mi

# Frontend configuration
frontend:
  image:
    repository: ghcr.io/your-org/scaledtest-frontend
    tag: "1.0.0"

# Database (bundled TimescaleDB)
database:
  enabled: true
  image:
    repository: timescale/timescaledb-ha
    tag: pg17
  auth:
    username: scaledtest
    database: scaledtest
  persistence:
    size: 10Gi

# MinIO for artifact storage
minio:
  enabled: true
  image:
    repository: minio/minio
    tag: latest
  defaultBucket: artifacts
  persistence:
    size: 100Gi

# Ingress (Kubernetes)
ingress:
  enabled: false
  host: scaledtest.example.com
  tls:
    enabled: false

# Route (OpenShift)
route:
  enabled: false
  termination: edge
```

### Minimal Production Configuration

Create a `production-values.yaml`:

```yaml
database:
  persistence:
    size: 50Gi
  resources:
    limits:
      cpu: 2000m
      memory: 2Gi

minio:
  persistence:
    size: 500Gi

backend:
  resources:
    requests:
      cpu: 500m
      memory: 256Mi
    limits:
      cpu: 2000m
      memory: 1Gi

replicaCount: 3

ingress:
  enabled: true
  host: scaledtest.example.com
  tls:
    enabled: true
    secretName: scaledtest-tls
```

## Database Migrations

Migrations are embedded in the backend binary and run automatically on startup using [goose](https://github.com/pressly/goose). No external migration job is required.

### Checking Migration Status

```bash
# View backend logs for migration output
kubectl logs -l app.kubernetes.io/component=backend -n scaledtest | grep -i migration

# Connect to database
kubectl exec -it scaledtest-postgresql-0 -n scaledtest -- psql -U scaledtest -d scaledtest

# Check goose migration version
SELECT * FROM goose_db_version ORDER BY id DESC LIMIT 5;
```

## Artifact Storage

Test artifacts are stored in MinIO (S3-compatible object storage). Test runners upload artifacts via the backend API:

```
POST /api/v1/artifacts
```

This eliminates the need for ReadWriteMany PVCs and works across all Kubernetes distributions.

### Retention Policies

Artifact retention is configurable via the UI in System Settings:
- **Artifact Retention**: Days to keep test artifacts (default: 30)
- **Test Result Retention**: Days to keep test results (default: 90)
- **Log Retention**: Days to keep test logs (default: 30)

The backend runs an in-process scheduler to clean up expired data.

## Upgrading

```bash
helm upgrade scaledtest . -n scaledtest -f your-values.yaml
```

## Uninstalling

```bash
helm uninstall scaledtest -n scaledtest
```

**Note**: PVCs are not deleted by default. To fully clean up:

```bash
kubectl delete pvc -l app.kubernetes.io/instance=scaledtest -n scaledtest
```

## Troubleshooting

### Pods not starting

```bash
# Check pod status
kubectl get pods -n scaledtest

# Check events
kubectl get events -n scaledtest --sort-by='.lastTimestamp'

# Check logs
kubectl logs deployment/scaledtest-backend -n scaledtest
```

### PostgreSQL issues

```bash
# Check database is ready
kubectl exec -it scaledtest-postgresql-0 -n scaledtest -- pg_isready -U scaledtest

# View logs
kubectl logs scaledtest-postgresql-0 -n scaledtest
```

### MinIO issues

```bash
# Check MinIO pod
kubectl get pods -l app.kubernetes.io/name=minio -n scaledtest

# View MinIO logs
kubectl logs -l app.kubernetes.io/name=minio -n scaledtest
```

### Database credentials

```bash
# Get password
kubectl get secret scaledtest-postgresql -n scaledtest \
  -o jsonpath='{.data.password}' | base64 -d

# Connect to database
kubectl exec -it scaledtest-postgresql-0 -n scaledtest -- \
  psql -U scaledtest -d scaledtest
```

### OpenShift Route not working

```bash
# Check route status
kubectl get route -n scaledtest

# Describe route
kubectl describe route scaledtest -n scaledtest

# Check router logs (requires cluster-admin)
kubectl logs -l ingresscontroller.operator.openshift.io/deployment-ingresscontroller=default \
  -n openshift-ingress
```

## Development with Tilt

For local development with hot-reload:

```bash
# From repository root
tilt up

# Open dashboard at http://localhost:10350
```

Tilt provides automatic rebuilding on code changes.
