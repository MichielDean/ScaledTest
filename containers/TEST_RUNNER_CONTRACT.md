# ScaledTest Test Runner Contract

This document defines the interface between ScaledTest and test runner containers. Any test runner container that implements this contract can be used with ScaledTest.

## Overview

ScaledTest is platform-agnostic. It doesn't care:
- **Where your Application Under Test (AUT) runs** - local dev server, staging, production, K8s, serverless, VM
- **What test framework you use** - Playwright, Jest, pytest, JUnit, etc.
- **How you structure your tests** - as long as you report results in CTRF format

The platform's job is:
1. Schedule test execution via Kubernetes
2. Provide test runners with configuration
3. Collect and aggregate results
4. Store artifacts (screenshots, videos, traces)

---

## Environment Variables

ScaledTest injects these environment variables into every test pod:

### Required by Platform

| Variable | Description | Example |
|----------|-------------|---------|
| `BASE_URL` | URL where the Application Under Test is accessible | `http://host.docker.internal:5173` |
| `TEST_ID` | The specific test ID to execute in this pod | `ui/login/should-login.spec.ts` |
| `API_URL` | ScaledTest Platform API for result/artifact upload | `http://host.docker.internal:8080` |
| `API_TOKEN` | JWT token for authenticating with Platform API | `eyJhbGc...` |
| `TEST_RUN_ID` | UUID identifying this test run (for grouping results) | `a1b2c3d4-...` |
| `TEST_JOB_ID` | UUID identifying this specific test job | `e5f6g7h8-...` |

### Kubernetes-Specific

| Variable | Description | Example |
|----------|-------------|---------|
| `JOB_COMPLETION_INDEX` | K8s indexed job completion index (0-based) | `0`, `1`, `2` |

### Legacy (Deprecated)

| Variable | Replaced By | Notes |
|----------|-------------|-------|
| `PLATFORM_API_URL` | `API_URL` | Kept for backward compatibility |
| `JOB_AUTH_TOKEN` | `API_TOKEN` | Kept for backward compatibility |
| `ARTIFACT_PATH` | API upload | Artifacts now uploaded via API |

---

## Test Runner Responsibilities

### 1. Read Configuration

```bash
# Use BASE_URL to reach the AUT
export PLAYWRIGHT_BASE_URL=$BASE_URL

# Use TEST_ID to know which test to run
npx playwright test --grep "$TEST_ID"
```

### 2. Execute Tests

Run the specific test identified by `TEST_ID`. The runner is responsible for:
- Connecting to the AUT at `BASE_URL`
- Running the test
- Capturing any artifacts (screenshots, videos, traces)

### 3. Report Results in CTRF Format

After test execution, upload results to the platform:

```bash
# Generate CTRF report
npx ctrf-json-reporter --output /tmp/ctrf-report.json

# Upload to platform
curl -X POST "$API_URL/api/v1/test-results" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d @/tmp/ctrf-report.json
```

### 4. Upload Artifacts via API

Upload test artifacts (screenshots, videos, traces) to the platform API:

```bash
# Upload a screenshot
curl -X POST "$API_URL/api/v1/artifacts" \
  -H "Authorization: Bearer $API_TOKEN" \
  -F "file=@./test-results/screenshot.png" \
  -F "test_run_id=$TEST_RUN_ID" \
  -F "test_job_id=$TEST_JOB_ID" \
  -F "artifact_type=screenshot"

# Upload a video
curl -X POST "$API_URL/api/v1/artifacts" \
  -H "Authorization: Bearer $API_TOKEN" \
  -F "file=@./test-results/video.webm" \
  -F "test_run_id=$TEST_RUN_ID" \
  -F "test_job_id=$TEST_JOB_ID" \
  -F "artifact_type=video"

# Upload a trace
curl -X POST "$API_URL/api/v1/artifacts" \
  -H "Authorization: Bearer $API_TOKEN" \
  -F "file=@./test-results/trace.zip" \
  -F "test_run_id=$TEST_RUN_ID" \
  -F "test_job_id=$TEST_JOB_ID" \
  -F "artifact_type=trace"
```

**Artifact Types:**
- `screenshot` - Test failure screenshots
- `video` - Test execution recordings
- `trace` - Playwright/browser traces
- `log` - Test execution logs
- `report` - Generated reports (HTML, etc.)
- `other` - Any other file type

---

## Network Requirements

The test runner container must be able to reach:

1. **Application Under Test** - via `BASE_URL`
2. **ScaledTest Platform API** - via `API_URL`
3. **Any test dependencies** - databases, APIs, etc.

### Common Networking Scenarios

#### Docker Desktop Kubernetes (Local Development)

```yaml
# In cluster configuration (runner_config)
platformApiUrl: http://host.docker.internal:8080
defaultBaseUrl: http://host.docker.internal:5173
```

The magic hostname `host.docker.internal` routes to the Docker host.

#### Cloud Kubernetes with External AUT

```yaml
# AUT runs in AWS, tests run in GKE
platformApiUrl: http://scaledtest-api.scaledtest.svc.cluster.local:8080
defaultBaseUrl: https://staging.mycompany.com
```

#### AUT and Tests in Same Cluster

```yaml
# AUT deployed as K8s service in same cluster
platformApiUrl: http://scaledtest-api.scaledtest.svc.cluster.local:8080
defaultBaseUrl: http://myapp-frontend.myapp-namespace.svc.cluster.local
```

---

## CTRF Report Format

ScaledTest uses [CTRF (Common Test Report Format)](https://ctrf.io) for test results.

### Minimal Required Fields

```json
{
  "results": {
    "tool": {
      "name": "playwright"
    },
    "summary": {
      "tests": 1,
      "passed": 1,
      "failed": 0,
      "pending": 0,
      "skipped": 0,
      "other": 0,
      "start": 1700000000000,
      "stop": 1700000001000
    },
    "tests": [
      {
        "name": "should login successfully",
        "status": "passed",
        "duration": 1000
      }
    ]
  }
}
```

### Recommended Additional Fields

```json
{
  "results": {
    "tests": [
      {
        "name": "should login successfully",
        "status": "passed",
        "duration": 1000,
        "filePath": "tests/login.spec.ts",
        "suite": "Authentication",
        "browser": "chromium",
        "trace": "/artifacts/trace.zip",
        "screenshot": "/artifacts/screenshot.png"
      }
    ]
  }
}
```

---

## Reference Implementation

See `containers/base-images/playwright-runner/` for a complete implementation:

- `scripts/entrypoint.sh` - Handles environment variables
- `scripts/run-test.sh` - Executes tests and uploads results
- `playwright.k8s.config.ts` - Uses `BASE_URL` for configuration

---

## Configuration Hierarchy

`BASE_URL` is resolved in this order (highest priority first):

1. **Trigger request `base_url`** - Per-run override via API
2. **Environment map in trigger** - `environment: { BASE_URL: "..." }`
3. **Cluster `defaultBaseUrl`** - Configured in runner_config
4. **Test runner fallback** - Typically `http://localhost` (not recommended)

This allows:
- Platform admins to set sensible defaults
- Users to override per-test-run when needed
- Emergency overrides via the trigger API

---

## Example: Custom Test Runner

Here's a minimal test runner container:

```dockerfile
FROM node:20-alpine

# Install test framework
RUN npm install -g playwright @playwright/test ctrf-reporter

# Copy test runner scripts
COPY scripts/ /scripts/
RUN chmod +x /scripts/*.sh

ENTRYPOINT ["/scripts/entrypoint.sh"]
```

```bash
#!/bin/bash
# scripts/entrypoint.sh

# Read platform configuration
echo "Running test: $TEST_ID"
echo "AUT URL: $BASE_URL"
echo "Platform API: $API_URL"

# Run the specific test
npx playwright test --grep "$TEST_ID" --config=playwright.config.ts

# Upload results
if [ -f "ctrf-report.json" ]; then
  curl -X POST "$API_URL/api/v1/test-results" \
    -H "Authorization: Bearer $API_TOKEN" \
    -H "Content-Type: application/json" \
    -d @ctrf-report.json
fi
```

---

## Troubleshooting

### Tests can't reach AUT

1. Verify `BASE_URL` is set correctly in cluster configuration
2. Ensure network connectivity from K8s pods to AUT
3. For local dev, use `host.docker.internal` instead of `localhost`

### Results not appearing

1. Check API_TOKEN is valid and not expired
2. Verify CTRF report format is correct
3. Check pod logs for upload errors

### Wrong test executed

1. Verify `TEST_ID` is being used in test selection
2. Check test discovery matches the IDs in your test image
