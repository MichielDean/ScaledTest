---
applyTo: "deploy/helm/**/*.{yaml,tpl}"
---

# Helm Chart Development Standards

Guidelines for the ScaledTest Helm chart in `deploy/helm/scaledtest/`.

---

## Values File Hierarchy

Values files are layered from most general to most specific:

1. **values.yaml** - Production defaults, all features configurable
2. **values-dev.yaml** - Local Kind cluster development (NodePort + Ingress)
3. **values-kind.yaml** - Kind cluster without local registry (images loaded directly)
4. **values-openshift.yaml** - OpenShift-specific (Routes instead of Ingress)

When adding new configuration:
- Add to `values.yaml` with sensible production defaults
- Override in environment-specific files only when necessary
- Document the option with a comment in `values.yaml`

---

## Configuration Derivation Pattern

Prefer deriving values from other configuration when possible, with explicit override options.

### CORS Configuration Example

The `scaledtest.corsOrigin` helper in `_helpers.tpl` demonstrates this pattern:

```yaml
# Priority order:
# 1. Explicit value in backend.env.CORS_ALLOWED_ORIGINS
# 2. Derived from ingress.host when ingress.enabled=true
# 3. NodePort localhost defaults
```

This allows:
- Zero-config for common cases (ingress derives CORS automatically)
- Explicit override for edge cases (LoadBalancer, custom domains)

### Adding New Derived Values

1. Create a helper template in `_helpers.tpl`
2. Check for explicit value first: `{{- if .Values.explicit.value }}`
3. Derive from related config second: `{{- else if .Values.related.enabled }}`
4. Provide sensible fallback last: `{{- else }}default{{- end }}`

---

## Ingress Configuration

### Empty Host Pattern

For local development, use an empty `host` field to catch all requests:

```yaml
ingress:
  enabled: true
  host: ""  # Catches localhost, 127.0.0.1, any IP
```

This eliminates the need for:
- DNS configuration
- `/etc/hosts` file edits
- External DNS services like nip.io

### Connect-RPC/gRPC-Web Routing

Connect protocol uses paths like `/api.v1.ServiceName/Method`. Configure nginx-ingress:

```yaml
annotations:
  nginx.ingress.kubernetes.io/use-regex: "true"

# In ingress.yaml template:
paths:
  - path: /api\..*
    pathType: ImplementationSpecific
    backend: ...backend
```

### Timeout Settings for Streaming

gRPC-Web/Connect streaming requires extended timeouts:

```yaml
annotations:
  nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
  nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
```

---

## Environment Variables

### Build-time vs Runtime

**Build-time** (Vite, webpack):
- Variables like `VITE_*` are replaced at build time
- Cannot be changed after Docker image is built
- Do NOT set these in Kubernetes deployment env

**Runtime** (nginx envsubst, backend env):
- Variables like `BACKEND_HOST` are substituted at container start
- Can be configured in Kubernetes deployment env
- Use these for cluster-specific configuration

### Frontend Configuration

The frontend uses nginx with `envsubst` for runtime configuration:

```dockerfile
# nginx:alpine processes /etc/nginx/templates/*.template files
COPY nginx.conf /etc/nginx/templates/default.conf.template
ENV BACKEND_HOST=backend
```

In the deployment:
```yaml
env:
  - name: BACKEND_HOST
    value: "{{ include "scaledtest.fullname" . }}-backend"
```

Do NOT set `VITE_API_URL` - it has no effect at runtime.

---

## Dev/Prod Parity

Maintain consistency between development and production configurations:

1. **Same ingress patterns** - Both use nginx-ingress with same annotations
2. **Same service structure** - Backend, frontend, database, MinIO
3. **NodePort as fallback** - Keep NodePort services in dev for debugging

Differences should be limited to:
- Resource limits (lower in dev)
- Replica counts (1 in dev)
- Image pull policy (Always in dev, IfNotPresent in prod)
- Static passwords (dev only, for reproducibility)

---

## Kind Cluster Requirements

For local development with Kind:

1. **Port mappings** in `kind-cluster-config.yaml`:
   - Port 80/443 for ingress controller
   - NodePort ranges (30080, 30173, etc.) as fallback

2. **Ingress controller**: nginx-ingress for Kind
   ```bash
   kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.12.0/deploy/static/provider/kind/deploy.yaml
   ```

3. **Node label** for ingress scheduling:
   ```yaml
   kubeadmConfigPatches:
     - |
       kind: InitConfiguration
       nodeRegistration:
         kubeletExtraArgs:
           node-labels: "ingress-ready=true"
   ```

---

## Testing Helm Templates

Before deploying, validate templates:

```bash
# Render templates without installing
helm template scaledtest ./deploy/helm/scaledtest -f ./deploy/helm/scaledtest/values-dev.yaml

# Validate against cluster
helm install scaledtest ./deploy/helm/scaledtest --dry-run --debug -f ./deploy/helm/scaledtest/values-dev.yaml
```

Check that:
- CORS_ALLOWED_ORIGINS is correctly derived
- Ingress paths include Connect-RPC regex
- Environment variables use correct secret references
