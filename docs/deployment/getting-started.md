# Getting Started: Self-Hosting ScaledTest

This guide takes you from zero to a running ScaledTest instance — picking a
deployment method, setting required configuration, registering your first user,
and pointing a CI pipeline at the result.

---

## 1. Choose a Deployment Method

| Method | Best for |
|---|---|
| **Docker Compose** | Local development, small teams, single-server installs |
| **Kubernetes (kustomize)** | Production, multi-replica, auto-scaling |

If you're not sure, start with Docker Compose. You can migrate to Kubernetes
later — the same environment variables apply.

---

## 2. Environment Variables

All variables use the `ST_` prefix. Required variables must be set before
starting the server.

### Required

| Variable | Description |
|---|---|
| `ST_DATABASE_URL` | PostgreSQL connection string, e.g. `postgres://user:pass@host:5432/scaledtest?sslmode=disable` |
| `ST_JWT_SECRET` | Random string ≥ 32 characters used to sign JWT tokens. Generate with `openssl rand -base64 48` |

### Recommended

| Variable | Default | Description |
|---|---|---|
| `ST_BASE_URL` | `http://localhost:8080` | Public URL of the instance — used in invitation emails and GitHub commit status links |
| `ST_PORT` | `8080` | Port the HTTP server binds to |

### Optional — OAuth Login

| Variable | Description |
|---|---|
| `ST_OAUTH_GITHUB_CLIENT_ID` | GitHub OAuth app client ID |
| `ST_OAUTH_GITHUB_CLIENT_SECRET` | GitHub OAuth app client secret |
| `ST_OAUTH_GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `ST_OAUTH_GOOGLE_CLIENT_SECRET` | Google OAuth client secret |

OAuth is optional. Email/password login works without it.

### Optional — Email (invitations and notifications)

| Variable | Default | Description |
|---|---|---|
| `ST_SMTP_HOST` | _(none)_ | SMTP server hostname. Leave unset to disable outbound email (no-op mode) |
| `ST_SMTP_PORT` | `587` | SMTP port |
| `ST_SMTP_USER` | _(none)_ | SMTP username |
| `ST_SMTP_PASS` | _(none)_ | SMTP password |
| `ST_SMTP_FROM` | _(none)_ | From address for outbound email |

### Optional — GitHub Commit Status

| Variable | Description |
|---|---|
| `ST_GITHUB_TOKEN` | Personal access token with `repo:status` scope. When set, uploading a report with `github_owner`, `github_repo`, and `github_sha` query parameters will post a commit status back to GitHub |

### Optional — Kubernetes Worker Dispatch

| Variable | Default | Description |
|---|---|---|
| `ST_WORKER_IMAGE` | `scaledtest/worker:latest` | Container image used for distributed test worker Jobs |
| `ST_WORKER_TOKEN` | _(none)_ | API token injected into worker pods for authenticated reporting |
| `ST_K8S_NAMESPACE` | `default` | Kubernetes namespace where worker Jobs are created |
| `ST_K8S_IN_CLUSTER` | `false` | Set `true` when running inside a Kubernetes cluster |
| `ST_K8S_KUBECONFIG` | _(none)_ | Path to kubeconfig file when running outside a cluster |

---

## 3. Deploy

### Option A — Docker Compose (recommended for local / small installs)

**Prerequisites:** Docker and Docker Compose.

```bash
# Clone the repository
git clone https://github.com/your-org/scaledtest.git
cd scaledtest

# Generate a JWT secret
export ST_JWT_SECRET=$(openssl rand -base64 48)

# Start the stack (TimescaleDB + app server)
docker compose up -d
```

The app runs at **http://localhost:3000** and the database is persisted in a
named Docker volume.

The `app` container runs `scaledtest -migrate-up` automatically on start, so no
separate migration step is required.

To stop:
```bash
docker compose down
```

To stop and remove all data (including the database volume):
```bash
docker compose down -v
```

### Option B — Kubernetes (production)

**Prerequisites:** A Kubernetes cluster (1.27+), `kubectl` configured, and a
container image built and pushed to a registry.

1. **Generate secrets:**

   ```bash
   openssl rand -base64 48   # JWT secret
   openssl rand -base64 32   # Database password
   ```

2. **Edit `k8s/secret.yaml`** — replace all placeholder values with the
   generated secrets and your database credentials.

3. **Edit `k8s/deployment.yaml`** — set the container image:

   ```yaml
   image: your-registry/scaledtest:v1.0.0
   ```

4. **Edit `k8s/configmap.yaml`** — set the public URL:

   ```yaml
   ST_BASE_URL: 'https://your-domain.com'
   ```

5. **Apply:**

   ```bash
   kubectl apply -k k8s/
   ```

6. **Watch rollout:**

   ```bash
   kubectl -n scaledtest rollout status deployment/scaledtest
   ```

The Deployment runs `scaledtest -migrate-up` as an init step, so migrations are
applied automatically on each rollout.

For production use, replace the in-cluster TimescaleDB StatefulSet with a
managed PostgreSQL service (Timescale Cloud, AWS RDS, etc.) and configure
secrets via an external secret manager. See [`k8s/README.md`](../../k8s/README.md)
for full details.

---

## 4. First-Run Steps

### Register the first user

Open a browser and navigate to your instance URL (e.g. `http://localhost:3000`).
The registration page is available at `/register`. The first registered user
is automatically assigned the `owner` role, giving full access to admin
endpoints. All subsequent users are assigned the `maintainer` role.

Using the API directly:

```bash
curl -s -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"changeme","display_name":"Admin"}'
```

### Log in and get a JWT

```bash
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"changeme"}' | jq .
# → { "access_token": "eyJ...", "expires_at": "...", "user": {...} }
```

### Create a team

Teams scope all reports, executions, tokens, and webhooks.

```bash
ACCESS_TOKEN="eyJ..."   # from the login response

curl -s -X POST http://localhost:3000/api/v1/teams \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-team"}' | jq .
# → { "id": "team-uuid", "name": "my-team", ... }
```

Note your `team-uuid` — you'll need it for tokens and report uploads.

### Generate an API token

API tokens (format `sct_...`) are used by CI pipelines and the SDK. They are
shown **once** at creation — copy it immediately.

```bash
TEAM_ID="team-uuid"

curl -s -X POST "http://localhost:3000/api/v1/teams/$TEAM_ID/tokens" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"ci-pipeline"}' | jq .
# → { "token": "sct_...", "id": "token-uuid", ... }
```

---

## 5. Verify the Instance

### Health check

```bash
curl -s http://localhost:3000/health
# → { "status": "ok" }
```

### Upload a minimal CTRF report

```bash
API_TOKEN="sct_..."   # from the token creation step

curl -s -X POST "http://localhost:3000/api/v1/reports" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "results": {
      "tool": { "name": "smoke-test" },
      "summary": { "tests": 1, "passed": 1, "failed": 0, "skipped": 0, "pending": 0, "other": 0 },
      "tests": [{ "name": "smoke", "status": "passed", "duration": 10 }]
    }
  }' | jq .
# → { "id": "report-uuid", "message": "report accepted", "summary": { ... } }
```

A `201` response with a report UUID confirms the API and database are working.

Open the ScaledTest UI and navigate to your team's Reports page — the upload
should appear there.

---

## 6. Point a CI Pipeline at It

Set three secrets in your CI system:

| Secret | Value |
|---|---|
| `SCALEDTEST_URL` | Your instance URL, e.g. `https://scaledtest.example.com` |
| `SCALEDTEST_API_TOKEN` | The `sct_...` token generated above |
| `SCALEDTEST_TEAM_ID` | Your team UUID |

### GitHub Actions — minimal example

```yaml
- name: Upload CTRF report to ScaledTest
  if: always()
  env:
    SCALEDTEST_URL: ${{ secrets.SCALEDTEST_URL }}
    SCALEDTEST_API_TOKEN: ${{ secrets.SCALEDTEST_API_TOKEN }}
  run: |
    curl -sf -X POST "$SCALEDTEST_URL/api/v1/reports" \
      -H "Authorization: Bearer $SCALEDTEST_API_TOKEN" \
      -H "Content-Type: application/json" \
      -d @ctrf-report.json | jq .
```

For a complete workflow with quality-gate enforcement, see the
[GitHub Actions integration guide](../ci-integration/github-actions.md).

For GitLab CI, see the [GitLab CI integration guide](../ci-integration/gitlab-ci.md).
