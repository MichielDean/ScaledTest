# ScaledTest Jest Runner

Base Docker image for running Jest tests in the ScaledTest platform with automatic test discovery and CTRF result streaming.

## Features

- **Test Discovery**: Automatic discovery of all Jest tests with `/list-tests` command
- **Single Test Execution**: Run individual tests with `--test-id` parameter
- **CTRF Streaming**: Real-time test result upload to ScaledTest platform
- **Artifact Management**: Screenshots, videos, and logs automatically collected
- **Kubernetes Ready**: Designed for K8s Indexed Jobs with proper signal handling

## Usage

### Building User Test Image

Users build atop this base image with their test code:

```dockerfile
FROM scaledtest/jest-runner:latest

# Copy test dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy test code
COPY tests/ /app/tests/
COPY jest.config.js /app/

# Copy fixtures and test data
COPY fixtures/ /app/fixtures/
COPY .env.test /app/

# Set test environment
ENV TEST_ENV=staging
```

Build and push:

```bash
docker build -t mycompany/my-app-tests:1.0.0 .
docker push mycompany/my-app-tests:1.0.0
```

### Test Discovery

Discover all tests in the image:

```bash
docker run mycompany/my-app-tests:1.0.0 /app/list-tests
```

Output:

```json
{
  "tests": [
    {
      "id": "tests/auth/login.test.js::Login Flow::should authenticate valid user",
      "name": "should authenticate valid user",
      "suite": "Login Flow",
      "file": "tests/auth/login.test.js",
      "tags": ["auth", "critical"]
    }
  ],
  "framework": "jest",
  "version": "29.7.0",
  "totalCount": 1
}
```

### Running a Single Test

Execute a specific test:

```bash
docker run \
  -e TEST_ID="tests/auth/login.test.js::Login Flow::should authenticate" \
  -e PLATFORM_API_URL="https://api.scaledtest.io" \
  -e JOB_AUTH_TOKEN="eyJhbGc..." \
  -e PROJECT_ID="550e8400-e29b-41d4-a716-446655440000" \
  -v /test-artifacts:/test-artifacts \
  mycompany/my-app-tests:1.0.0
```

### Environment Variables

| Variable               | Required | Description                                          |
| ---------------------- | -------- | ---------------------------------------------------- |
| `TEST_ID`              | Yes      | Test identifier from discovery                       |
| `PLATFORM_API_URL`     | Yes      | ScaledTest API URL                                   |
| `JOB_AUTH_TOKEN`       | Yes      | JWT for uploading results                            |
| `PROJECT_ID`           | Yes      | Project UUID                                         |
| `ARTIFACT_PATH`        | No       | Directory for artifacts (default: `/test-artifacts`) |
| `JOB_COMPLETION_INDEX` | No       | K8s Job index (default: `0`)                         |
| `TEST_TIMEOUT`         | No       | Test timeout in ms (default: `30000`)                |
| `UPLOAD_FREQUENCY`     | No       | Upload batch config (default: `10,30s`)              |

## Directory Structure

```
/app/
├── list-tests              # Test discovery executable
├── run-test                # Test execution executable
├── reporters/              # CTRF stream reporter
│   └── ctrf-stream-reporter.js
├── scripts/                # Helper scripts
│   ├── list-tests.js
│   └── run-test.js
├── tests/                  # User test code (mounted)
├── fixtures/               # Test fixtures (mounted)
└── node_modules/           # Dependencies
```

## Artifacts

Test artifacts are written to `$ARTIFACT_PATH`:

```
/test-artifacts/
└── job-<uuid>/
    └── <index>/
        ├── screenshots/
        │   ├── screenshot-001.png
        │   └── screenshot-002.png
        ├── videos/
        │   └── test-recording.mp4
        ├── logs/
        │   └── console.txt
        └── traces/
            └── trace.zip
```

## CTRF Upload

Results are automatically uploaded during test execution:

- **Batch Upload**: Every 10 tests (configurable via `UPLOAD_FREQUENCY`)
- **Timed Upload**: Every 30 seconds (configurable via `UPLOAD_FREQUENCY`)
- **Final Upload**: When test completes

Example CTRF payload:

```json
{
  "results": {
    "tool": { "name": "jest", "version": "29.7.0" },
    "summary": {
      "tests": 1,
      "passed": 1,
      "failed": 0,
      "skipped": 0,
      "pending": 0,
      "other": 0,
      "start": 1700000000000,
      "stop": 1700000005000
    },
    "tests": [
      {
        "name": "should authenticate valid user",
        "status": "passed",
        "duration": 5000,
        "suite": "Login Flow",
        "message": null,
        "trace": null
      }
    ]
  },
  "metadata": {
    "testId": "tests/auth.test.js::Login Flow::should authenticate",
    "projectId": "550e8400-e29b-41d4-a716-446655440000",
    "jobIndex": 0
  }
}
```

## Building Base Image

For ScaledTest maintainers:

```bash
cd containers/base-images/jest-runner
docker build -t scaledtest/jest-runner:1.0.0 .
docker tag scaledtest/jest-runner:1.0.0 scaledtest/jest-runner:latest
docker push scaledtest/jest-runner:1.0.0
docker push scaledtest/jest-runner:latest
```

## Version Compatibility

- Node.js: >= 18.0.0
- Jest: >= 29.0.0
- npm: >= 9.0.0

## License

MIT
