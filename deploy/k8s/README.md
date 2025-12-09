# ScaledTest Kubernetes Deployment

This directory contains configuration and scripts for deploying ScaledTest to Kubernetes.

## Local Development with Kind

For local development, we use [Kind](https://kind.sigs.k8s.io/) (Kubernetes in Docker) which provides persistent port access without manual port-forwarding.

### Prerequisites

- Docker Desktop running (Kubernetes in Docker Desktop should be **disabled**)
- Kind installed: `winget install Kubernetes.kind`
- Helm installed
- kubectl installed

### Quick Start

```powershell
# Create cluster, build images, and deploy ScaledTest
cd deploy/k8s
.\cluster-create.ps1
```

### Access URLs (after deployment)

| Service | URL |
|---------|-----|
| Frontend | http://localhost:30173 |
| Backend HTTP | http://localhost:30080 |
| Backend gRPC | localhost:30090 |
| MinIO API | http://localhost:30900 |
| MinIO Console | http://localhost:30901 |

### Cluster Management Scripts

| Script | Description |
|--------|-------------|
| `cluster-create.ps1` | Create cluster, build images, deploy ScaledTest |
| `cluster-delete.ps1` | Delete cluster completely |
| `cluster-start.ps1` | Start a stopped cluster |
| `cluster-stop.ps1` | Stop cluster (preserves data) |
| `cluster-status.ps1` | Show cluster and app status |
| `cluster-load-images.ps1` | Rebuild and load images |

### Script Options

```powershell
# Create cluster without deploying
.\cluster-create.ps1 -SkipDeploy

# Create cluster without building images (use existing)
.\cluster-create.ps1 -SkipBuild

# Force recreate existing cluster
.\cluster-create.ps1 -Force

# Delete without confirmation
.\cluster-delete.ps1 -Force

# Rebuild only backend
.\cluster-load-images.ps1 -BackendOnly

# Rebuild only frontend
.\cluster-load-images.ps1 -FrontendOnly
```

### How It Works

1. **Kind Cluster**: Creates a 10-node Kubernetes cluster using Docker containers
2. **Port Mappings**: The cluster is configured with `extraPortMappings` that map NodePorts directly to localhost
3. **Image Loading**: Images are built locally and loaded directly into Kind (no registry needed)
4. **Helm Deployment**: Uses `values-kind.yaml` which references locally loaded images

### Stopping vs Deleting

- **Stop** (`cluster-stop.ps1`): Stops Docker containers but preserves cluster state. Quick to restart.
- **Delete** (`cluster-delete.ps1`): Completely removes the cluster and all data. Requires full recreate.

---

## Production Deployment

> Use the **Helm chart** for deployment:
> ```bash
> helm install scaledtest ./deploy/helm/scaledtest -n scaledtest --create-namespace
> ```
> See [../helm/scaledtest/README.md](../helm/scaledtest/README.md) for installation instructions.

## Directory Structure

- `jobs/` - Job templates for test execution (created dynamically via API)
- `rbac/` - ServiceAccount, Role, RoleBinding for Job management
- `storage/` - Example storage configurations (reference only)

## Note on Artifact Storage

The Helm chart uses **MinIO** for artifact storage instead of PVCs. Test runners upload artifacts via the backend API, eliminating the need for ReadWriteMany storage classes.

2. **Namespace**: Create or use existing namespace

   ```bash
   kubectl create namespace scaledtest
   ```

3. **Image Pull Secrets**: For private container registries (created via API)

## Quick Start

Apply manifests in order:

```bash
# 1. Create storage
kubectl apply -f storage/

# 2. Create RBAC
kubectl apply -f rbac/

# 3. Jobs are created dynamically via the ScaledTest API
```

## Configuration

### Storage

Edit `storage/artifacts-pvc.yaml` to adjust:

- Storage size (default: 100Gi)
- Storage class name
- Access mode

### RBAC

The `scaledtest-job-runner` ServiceAccount has permissions to:

- Create and manage Jobs
- Read Pod logs
- Create image pull secrets

## Monitoring

Monitor test execution:

```bash
# List all test Jobs
kubectl get jobs -n scaledtest -l app=scaledtest

# Watch Job status
kubectl get jobs -n scaledtest -w

# View pod logs
kubectl logs -n scaledtest -l job-name=<job-name>

# Check artifacts
kubectl exec -n scaledtest <artifact-viewer-pod> -- ls -la /artifacts
```

## Cleanup

Remove completed Jobs:

```bash
# Delete completed Jobs older than 1 hour
kubectl delete jobs -n scaledtest --field-selector status.successful=1

# Delete all test Jobs
kubectl delete jobs -n scaledtest -l app=scaledtest
```

## Troubleshooting

### PVC Not Binding

Check storage class supports ReadWriteMany:

```bash
kubectl describe storageclass <storage-class-name>
```

Verify PVC status:

```bash
kubectl describe pvc scaledtest-artifacts -n scaledtest
```

### Job Pods Stuck Pending

Check image pull secrets:

```bash
kubectl get secrets -n scaledtest -l secret-type=image-pull
```

Check pod events:

```bash
kubectl describe pod -n scaledtest <pod-name>
```

### Permission Errors

Verify ServiceAccount has correct RBAC:

```bash
kubectl auth can-i create jobs --as=system:serviceaccount:scaledtest:scaledtest-job-runner -n scaledtest
```
