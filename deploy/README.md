# Deployment

This directory contains deployment configurations for ScaledTest.

## Quick Start

### Prerequisites

- **Kubernetes 1.27+** or **OpenShift 4.14+**
- **Helm 3.12+**
- **kubectl** configured for your cluster

### Install (Development)

```bash
# Update Helm dependencies
cd deploy/helm/scaledtest
helm dependency update

# Install with dev values (NodePort services)
helm install scaledtest . \
  -f values-dev.yaml \
  -n scaledtest --create-namespace
```

### Install (Production - Kubernetes)

```bash
cd deploy/helm/scaledtest
helm dependency update

helm install scaledtest . \
  -n scaledtest --create-namespace \
  --set ingress.enabled=true \
  --set ingress.host=scaledtest.example.com
```

### Install (OpenShift)

```bash
cd deploy/helm/scaledtest
helm dependency update

helm install scaledtest . \
  -f values-openshift.yaml \
  -n scaledtest --create-namespace
```

## Directory Structure

```
deploy/
├── helm/               # Helm chart (primary deployment method)
│   └── scaledtest/
│       ├── Chart.yaml
│       ├── values.yaml           # Default values
│       ├── values-dev.yaml       # Development overrides
│       └── values-openshift.yaml # OpenShift-specific values
└── k8s/                # Raw Kubernetes manifests (reference only)
    ├── jobs/           # Test job templates
    ├── rbac/           # Service accounts and roles
    └── storage/        # Storage examples
```

## Architecture

ScaledTest deploys the following components:

| Component | Description |
|-----------|-------------|
| **Backend** | Go API server (REST + gRPC) |
| **Frontend** | React SPA served by nginx |
| **PostgreSQL** | TimescaleDB for test results and metadata |
| **MinIO** | S3-compatible storage for test artifacts |

All components are deployed as Kubernetes deployments with configurable replicas.

## Accessing Services

### Development (NodePort)

| Service | URL |
|---------|-----|
| Frontend | http://localhost:30173 |
| Backend API | http://localhost:30080 |
| gRPC | localhost:30090 |

### Production

Services are exposed via Ingress (Kubernetes) or Route (OpenShift).

## Useful Commands

```bash
# View pod status
kubectl get pods -n scaledtest

# View logs
kubectl logs -f deployment/scaledtest-backend -n scaledtest

# Port forward backend
kubectl port-forward svc/scaledtest-backend 8080:8080 -n scaledtest

# Connect to PostgreSQL
kubectl exec -it scaledtest-postgresql-0 -n scaledtest -- psql -U scaledtest

# Upgrade existing installation
helm upgrade scaledtest ./deploy/helm/scaledtest -n scaledtest

# Uninstall
helm uninstall scaledtest -n scaledtest
```

## More Information

See [helm/scaledtest/README.md](helm/scaledtest/README.md) for detailed chart configuration.

