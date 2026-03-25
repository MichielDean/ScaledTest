# ScaledTest Helm Chart

Helm chart for deploying the ScaledTest end-to-end testing platform (v2 Go backend + React SPA) on Kubernetes.

## Prerequisites

- Kubernetes 1.21+
- Helm 3.8+
- A PostgreSQL database
- Two Kubernetes Secrets (see [Required Secrets](#required-secrets))

## Required Secrets

The chart does not create database or JWT secrets for you. Create them before installing:

```bash
# Database password secret
kubectl create secret generic scaledtest-db \
  --from-literal=password=<your-db-password> \
  -n <namespace>

# JWT signing secret
kubectl create secret generic scaledtest-auth \
  --from-literal=jwt-secret=<your-jwt-secret> \
  -n <namespace>
```

The secret names and keys must match `database.existingSecret` / `database.secretKey` and `auth.existingSecret` / `auth.jwtSecretKey` in your values.

## Installation

### Add and install

```bash
# Install with default values (no ingress, ClusterIP service)
helm install scaledtest ./deployments/helm/scaledtest \
  --namespace scaledtest \
  --create-namespace
```

### Upgrade

```bash
helm upgrade scaledtest ./deployments/helm/scaledtest \
  --namespace scaledtest \
  --values my-values.yaml
```

### Uninstall

```bash
helm uninstall scaledtest --namespace scaledtest
```

## Database Migration

When `migration.enabled: true` (default), a Kubernetes Job runs `scaledtest -migrate-up` as a Helm pre-install/pre-upgrade hook before the main deployment starts. This ensures schema migrations are applied before the server comes up.

## Values Reference

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `replicaCount` | int | `1` | Number of server replicas |
| `image.repository` | string | `scaledtest` | Container image repository |
| `image.tag` | string | `latest` | Container image tag |
| `image.pullPolicy` | string | `IfNotPresent` | Image pull policy |
| `service.type` | string | `ClusterIP` | Kubernetes Service type (`ClusterIP`, `NodePort`, `LoadBalancer`) |
| `service.port` | int | `8080` | Service port |
| `ingress.enabled` | bool | `false` | Enable Ingress resource |
| `ingress.className` | string | `""` | Ingress class name (e.g. `nginx`, `traefik`) |
| `ingress.annotations` | object | `{}` | Ingress annotations |
| `ingress.hosts` | list | `[{host: scaledtest.local, paths: [{path: /, pathType: Prefix}]}]` | Ingress host rules |
| `ingress.tls` | list | `[]` | Ingress TLS configuration |
| `resources.limits.cpu` | string | `500m` | CPU limit |
| `resources.limits.memory` | string | `256Mi` | Memory limit |
| `resources.requests.cpu` | string | `100m` | CPU request |
| `resources.requests.memory` | string | `128Mi` | Memory request |
| `database.host` | string | `postgresql` | PostgreSQL host |
| `database.port` | int | `5432` | PostgreSQL port |
| `database.name` | string | `scaledtest` | Database name |
| `database.user` | string | `scaledtest` | Database user |
| `database.existingSecret` | string | `scaledtest-db` | Name of the Secret holding the DB password |
| `database.secretKey` | string | `password` | Key within the Secret for the DB password |
| `auth.existingSecret` | string | `scaledtest-auth` | Name of the Secret holding the JWT secret |
| `auth.jwtSecretKey` | string | `jwt-secret` | Key within the Secret for the JWT secret |
| `migration.enabled` | bool | `true` | Run database migrations as a pre-install/pre-upgrade hook |
| `rbac.create` | bool | `true` | Create Role and RoleBinding for the service account |
| `serviceAccount.create` | bool | `true` | Create a dedicated ServiceAccount |
| `serviceAccount.name` | string | `""` | Override the ServiceAccount name (auto-generated if empty) |
| `serviceAccount.annotations` | object | `{}` | Annotations to add to the ServiceAccount |
| `namespace` | string | `default` | Namespace passed to the server as `ST_K8S_NAMESPACE` (used for spawning executor Jobs) |

## Example: Minimal Production Override

Save as `my-values.yaml` and pass with `--values my-values.yaml`:

```yaml
image:
  repository: ghcr.io/your-org/scaledtest
  tag: "2.1.0"
  pullPolicy: Always

replicaCount: 2

service:
  type: ClusterIP
  port: 8080

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: scaledtest.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: scaledtest-tls
      hosts:
        - scaledtest.example.com

database:
  host: postgres.db.svc.cluster.local
  port: 5432
  name: scaledtest_prod
  user: scaledtest
  existingSecret: scaledtest-db
  secretKey: password

auth:
  existingSecret: scaledtest-auth
  jwtSecretKey: jwt-secret

resources:
  limits:
    cpu: 1000m
    memory: 512Mi
  requests:
    cpu: 250m
    memory: 256Mi

namespace: scaledtest
```

## Example: NodePort (no Ingress controller)

```yaml
service:
  type: NodePort
  port: 8080

ingress:
  enabled: false
```

## Example: Disable automatic migrations

If you manage migrations outside Helm (e.g. via CI):

```yaml
migration:
  enabled: false
```
