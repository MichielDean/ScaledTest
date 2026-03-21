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

## E2E Worker Image

ScaledTest dispatches distributed Playwright test runs as Kubernetes Jobs. Each
Job pod runs the **e2e worker** image, which contains:

- The ScaledTest worker binary (built from `cmd/worker`)
- The `e2e/` test suite baked in at `/workspace`
- Node.js + Playwright + Chromium (via `mcr.microsoft.com/playwright`)

### `ST_WORKER_IMAGE`

`configmap.yaml` sets the image pulled for every worker Job:

```yaml
ST_WORKER_IMAGE: 'ghcr.io/michialdean/scaledtest/e2e-worker:latest'
```

This image is built from `Dockerfile.e2e-worker` and published automatically by
the **Publish E2E Worker Image** GitHub Actions workflow on every push to `main`
that touches `Dockerfile.e2e-worker`, `e2e/**`, `cmd/worker/**`, `go.mod`, or
`go.sum`.

To use a pinned version instead of `latest`, update `ST_WORKER_IMAGE` in
`configmap.yaml` to reference a specific image digest or tag, then
`kubectl apply -k k8s/` to roll out the change. Note: existing pods read
`envFrom: configMapRef` only at startup, so restart the deployment
(`kubectl rollout restart deployment/scaledtest -n scaledtest`) for pods to
pick up the new image value.

### Environment variables injected into each worker pod

| Variable | Source | Purpose |
|---|---|---|
| `ST_API_URL` | Config/secret | ScaledTest API base URL for progress reporting |
| `ST_WORKER_TOKEN` | Secret | API token used by the worker to authenticate |
| `ST_EXECUTION_ID` | Runtime | Execution record the worker reports results into |
| `ST_COMMAND` | Runtime | Playwright command, e.g. `npx playwright test` |
| `E2E_BASE_URL` | Optional | Target app URL (default: `http://localhost:5173`) |

## Production Considerations

- **Database**: Use a managed PostgreSQL with TimescaleDB (e.g., Timescale Cloud, AWS RDS) instead of the in-cluster StatefulSet
- **Secrets**: Use an external secret manager (e.g., AWS Secrets Manager, Vault) via ExternalSecrets operator
- **Ingress**: Add an Ingress resource with TLS termination for your domain
- **Monitoring**: Add Prometheus ServiceMonitor for metrics collection
