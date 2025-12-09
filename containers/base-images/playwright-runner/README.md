# Playwright Test Runner for K8s Platform

Container image for running Playwright tests in Kubernetes using the Indexed Jobs pattern.

## Features

- ✅ **Test Discovery**: Automatically discovers all Playwright tests
- ✅ **CTRF Output**: Standardized test report format
- ✅ **Artifact Collection**: Screenshots, videos, traces
- ✅ **Indexed Execution**: One test per pod using `JOB_COMPLETION_INDEX`
- ✅ **Parallel Execution**: Configurable parallelism
- ✅ **Result Upload**: Automatic upload to backend API

## Image Size Optimization

This image uses several techniques to minimize size and build time:

| Optimization | Savings | Details |
|-------------|---------|---------|
| **Chromium Only** | ~1.5 GB | Only installs Chromium (tests use `chromium` project only) |
| **Multi-Stage Build** | ~200 MB | Separates build-time deps from runtime |
| **Ubuntu Base** | ~300 MB | Uses ubuntu:24.04 vs full playwright image |
| **Cache Cleanup** | ~100 MB | Removes npm cache after install |

**Final image size**: ~1.2 GB (vs ~3+ GB with full playwright image)

### Build Time Improvements

- **Layer caching**: `package.json` copied before source for better cache hits
- **Parallel installs**: Node deps and browser install in same stage
- **Minimal runtime deps**: Only Chromium browser libraries

## Quick Start

### Build Image

```bash
# From repository root
docker build -t playwright-runner:latest -f containers/base-images/playwright-runner/Dockerfile .

# Or with specific tag
docker build -t ghcr.io/your-org/scaledtest/playwright-runner:v1.0.0 \
  -f containers/base-images/playwright-runner/Dockerfile .
```

### Test Discovery Mode

```bash
docker run --rm \
  -e DISCOVERY_MODE=true \
  playwright-runner:latest
```

Output: `discovered-tests.json` in CTRF format

### Test Execution Mode

```bash
docker run --rm \
  -e JOB_COMPLETION_INDEX=0 \
  -e TEST_ID="tests_ui_login_test_ts_Login_should_display_login_form" \
  -e BASE_URL="http://localhost:5173" \
  -v $(pwd)/results:/test-results \
  -v $(pwd)/artifacts:/artifacts \
  playwright-runner:latest
```

Output:

- CTRF report: `/test-results/ctrf-report.json`
- Artifacts: `/artifacts/*.png`, `*.webm`, `*.zip`

## Environment Variables

### Discovery Mode

| Variable           | Required | Default         | Description                 |
| ------------------ | -------- | --------------- | --------------------------- |
| `DISCOVERY_MODE`   | Yes      | `false`         | Set to `true` for discovery |
| `TEST_RESULTS_DIR` | No       | `/test-results` | Output directory            |

### Execution Mode

| Variable               | Required | Default                          | Description                    |
| ---------------------- | -------- | -------------------------------- | ------------------------------ |
| `JOB_COMPLETION_INDEX` | Yes      | -                                | Pod index (0-based)            |
| `TEST_ID`              | Yes      | -                                | Test identifier from discovery |
| `BASE_URL`             | No       | `http://localhost:5173`          | Application URL                |
| `TEST_RESULTS_DIR`     | No       | `/test-results`                  | Output directory               |
| `ARTIFACTS_DIR`        | No       | `/artifacts`                     | Artifact directory             |
| `CTRF_OUTPUT`          | No       | `/test-results/ctrf-report.json` | CTRF file path                 |
| `BACKEND_API_URL`      | No       | -                                | API URL for result upload      |
| `API_TOKEN`            | No       | -                                | JWT token for API              |
| `APP_VERSION`          | No       | `1.0.0`                          | App version in CTRF            |
| `BUILD_NAME`           | No       | `local`                          | Build identifier               |
| `BUILD_NUMBER`         | No       | `0`                              | Build number                   |

## Scripts

### `entrypoint.sh`

Main entry point. Checks `DISCOVERY_MODE` and delegates to appropriate script.

### `discover-tests.sh`

Discovers all Playwright tests using `playwright test --list` and outputs JSON:

```json
{
  "framework": "playwright",
  "frameworkVersion": "1.56.1",
  "discoveredAt": "2025-11-22T10:00:00.000Z",
  "totalTests": 42,
  "tests": [
    {
      "id": "tests_ui_login_test_ts_Login_should_display_login_form",
      "name": "should display login form",
      "suite": "Login",
      "file": "tests/ui/login.test.ts",
      "project": "chromium"
    }
  ]
}
```

### `run-test.sh`

Executes a single test identified by `TEST_ID`:

1. Parses test ID to extract file and test name
2. Runs test with `--grep` flag
3. Generates CTRF report via reporter
4. Collects artifacts (screenshots, videos, traces)
5. Optionally uploads results to backend API

## Configuration

### Playwright Config

`playwright.k8s.config.ts` includes:

- **CTRF Reporter**: Configured with metadata
- **Trace/Screenshot/Video**: Always enabled for debugging
- **Single Worker**: One test per container
- **No Retries**: Tests run once (retry handled by K8s)

Example:

```typescript
reporter: [
  [
    "@ctrf/playwright-json-reporter",
    {
      outputFile: process.env.CTRF_OUTPUT,
      minimal: false,
      testType: "e2e",
      appName: "ScaledTest",
    },
  ],
];
```

## CTRF Output Format

```json
{
  "results": {
    "tool": {
      "name": "playwright",
      "version": "1.56.1"
    },
    "summary": {
      "tests": 1,
      "passed": 1,
      "failed": 0,
      "pending": 0,
      "skipped": 0,
      "other": 0,
      "start": 1700000000000,
      "stop": 1700001234567
    },
    "tests": [
      {
        "name": "should display login form",
        "status": "passed",
        "duration": 1234,
        "suite": "Login",
        "file": "tests/ui/login.test.ts"
      }
    ]
  }
}
```

## Kubernetes Integration

### Discovery Job

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: discover-playwright-tests
spec:
  template:
    spec:
      containers:
        - name: discover
          image: playwright-runner:latest
          env:
            - name: DISCOVERY_MODE
              value: "true"
          volumeMounts:
            - name: results
              mountPath: /test-results
      volumes:
        - name: results
          persistentVolumeClaim:
            claimName: test-artifacts
      restartPolicy: Never
```

### Execution Job (Indexed)

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: playwright-tests
spec:
  completions: 42 # Number of tests
  parallelism: 5 # Run 5 at a time
  completionMode: Indexed
  template:
    spec:
      containers:
        - name: test
          image: playwright-runner:latest
          env:
            - name: JOB_COMPLETION_INDEX
              valueFrom:
                fieldRef:
                  fieldPath: metadata.annotations['batch.kubernetes.io/job-completion-index']
            - name: TEST_ID
              value: "$(TEST_$(JOB_COMPLETION_INDEX))"
            - name: BASE_URL
              value: "http://frontend-service:5173"
          volumeMounts:
            - name: artifacts
              mountPath: /artifacts
      volumes:
        - name: artifacts
          persistentVolumeClaim:
            claimName: test-artifacts
      restartPolicy: Never
```

## Artifact Types

Collected artifacts:

| Type       | Extension      | Description           |
| ---------- | -------------- | --------------------- |
| Screenshot | `.png`, `.jpg` | Failure screenshots   |
| Video      | `.webm`        | Test execution video  |
| Trace      | `.zip`         | Playwright trace file |
| Log        | `.txt`         | Console output        |

## Troubleshooting

### Discovery Returns No Tests

**Check**:

1. Frontend code copied correctly: `COPY frontend/ ./`
2. Test files exist: `ls -la tests/ui/`
3. Run locally: `npx playwright test --list`

### Test Execution Fails

**Check**:

1. `JOB_COMPLETION_INDEX` set correctly
2. `TEST_ID` matches discovery output
3. `BASE_URL` is accessible from pod
4. Browser can start (check resource limits)

### CTRF Output Not Generated

**Check**:

1. Reporter installed: `npm list @ctrf/playwright-json-reporter`
2. Config used: `--config=playwright.k8s.config.ts`
3. Test actually ran: Check logs
4. Output path writable: Check permissions

### Artifacts Missing

**Check**:

1. Volume mounted: `volumeMounts` in Job spec
2. Directory exists: `mkdir -p $ARTIFACTS_DIR`
3. Files generated: Look in `$TEST_RESULTS_DIR`
4. Copy script ran: Check logs for "Collecting artifacts"

## Local Testing

Test the container locally before deploying:

```bash
# Build
docker build -t playwright-runner:test .

# Discovery
docker run --rm \
  -e DISCOVERY_MODE=true \
  playwright-runner:test

# Run first test
docker run --rm \
  -e JOB_COMPLETION_INDEX=0 \
  -e TEST_ID="tests_ui_login_test_ts_Login_should_display_login_form" \
  -e BASE_URL="http://host.docker.internal:5173" \
  -v $(pwd)/test-output:/test-results \
  -v $(pwd)/test-artifacts:/artifacts \
  playwright-runner:test

# Check results
cat test-output/ctrf-report.json | jq .
ls -lh test-artifacts/
```

## CI/CD Integration

See `.github/workflows/k8s-playwright-tests.yml` for complete example.

Key steps:

1. Build and push image
2. Call platform API to register image
3. Wait for discovery
4. Trigger test execution
5. Monitor job status
6. Download results

## Performance

Typical resource usage per test:

- **CPU**: 200-500m during execution
- **Memory**: 500Mi-1Gi for browser
- **Duration**: 5-30 seconds per test
- **Artifacts**: 1-10 MB per test

## Version History

- **v1.0.0** (2025-11-22): Initial release
  - Playwright 1.56.1
  - CTRF reporter support
  - Indexed Jobs pattern
  - Artifact collection

## Related Documentation

- [Dogfooding Guide](../../docs/DOGFOODING_PLAYWRIGHT.md)
- [K8s Platform Complete](../../docs/K8S_PLATFORM_COMPLETE.md)
- [Base Container Spec](../../docs/BASE_CONTAINER_SPEC.md)

## Support

Issues or questions? See main repository documentation.
