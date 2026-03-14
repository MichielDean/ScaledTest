# Kubernetes Deployment

Deploy ScaledTest to a Kubernetes cluster.

## Prerequisites

- Kubernetes cluster (1.27+)
- `kubectl` configured with cluster access
- Container image built and pushed to a registry

## Quick Start

1. **Edit secrets** — update placeholder values in `secret.yaml` and `timescaledb.yaml`:

   ```bash
   # Generate a random JWT secret
   openssl rand -base64 48

   # Generate a database password
   openssl rand -base64 32
   ```

2. **Update the image** in `deployment.yaml`:

   ```yaml
   image: your-registry/scaledtest:v1.0.0
   ```

3. **Update the base URL** in `configmap.yaml`:

   ```yaml
   ST_BASE_URL: 'https://your-domain.com'
   ```

4. **Deploy**:

   ```bash
   kubectl apply -k k8s/
   ```

5. **Verify**:
   ```bash
   kubectl -n scaledtest get pods
   kubectl -n scaledtest logs deploy/scaledtest
   ```

## Architecture

```
                    ┌─────────────┐
                    │   Ingress   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   Service   │
                    │  (ClusterIP)│
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼─────┐ ┌───▼───┐ ┌─────▼─────┐
        │  Pod (app) │ │  ...  │ │  Pod (app) │  ← HPA: 2-10 replicas
        └─────┬─────┘ └───────┘ └─────┬─────┘
              │                        │
              └────────────┬───────────┘
                           │
                    ┌──────▼──────┐
                    │ TimescaleDB │  ← StatefulSet with PVC
                    └─────────────┘
```

## Components

| File                  | Resource    | Purpose                               |
| --------------------- | ----------- | ------------------------------------- |
| `namespace.yaml`      | Namespace   | Isolates ScaledTest resources         |
| `configmap.yaml`      | ConfigMap   | Non-secret environment variables      |
| `secret.yaml`         | Secret      | JWT secret, DB URL, OAuth creds       |
| `serviceaccount.yaml` | SA + RBAC   | Allows app to manage worker Jobs      |
| `deployment.yaml`     | Deployment  | App server (runs migrations on start) |
| `service.yaml`        | Service     | Internal ClusterIP for the app        |
| `hpa.yaml`            | HPA         | Auto-scales 2-10 pods on CPU/memory   |
| `timescaledb.yaml`    | StatefulSet | Database with persistent storage      |
| `kustomization.yaml`  | Kustomize   | Orchestrates all resources            |

## Production Considerations

- **Database**: Use a managed PostgreSQL with TimescaleDB (e.g., Timescale Cloud, AWS RDS) instead of the in-cluster StatefulSet
- **Secrets**: Use an external secret manager (e.g., AWS Secrets Manager, Vault) via ExternalSecrets operator
- **Ingress**: Add an Ingress resource with TLS termination for your domain
- **Monitoring**: Add Prometheus ServiceMonitor for metrics collection
