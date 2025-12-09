# ScaledTest Client Library

Reusable client library for uploading test results from runner containers to ScaledTest backend.

## Features

- ✅ Environment variable validation
- ✅ CTRF result upload with retries
- ✅ Artifact upload (placeholder)
- ✅ Error handling and logging
- ✅ Language-agnostic (bash)

## Usage

### In Runner Scripts

```bash
#!/bin/bash
set -e

# Source ScaledTest client library
source /scaledtest-client/client.sh

# Validate environment early
scaledtest_validate_env || exit 1

# Run your tests...
npx playwright test --config=playwright.config.ts

# Upload results using client library
scaledtest_upload_results "/test-results/ctrf-report.json" || exit 1

# Upload artifacts (optional)
scaledtest_upload_artifacts "/artifacts"
```

### Required Environment Variables

- `API_URL` - ScaledTest backend API URL (e.g., `http://localhost:8080`)
- `API_TOKEN` - JWT authentication token
- `TEST_RUN_ID` - Unique test run identifier (UUID)

### In Dockerfile

```dockerfile
FROM node:20-alpine

# Copy ScaledTest client library
COPY containers/shared/scaledtest-client /scaledtest-client/
RUN chmod +x /scaledtest-client/client.sh

# ... rest of your runner setup
```

## Functions

### `scaledtest_validate_env()`

Validates that all required environment variables are set.

**Returns:** 0 on success, 1 on failure

### `scaledtest_upload_results(ctrf_file_path)`

Uploads a CTRF JSON report to ScaledTest backend.

**Parameters:**
- `ctrf_file_path` - Absolute path to CTRF JSON file

**Returns:** 0 on success, 1 on failure

### `scaledtest_upload_artifacts(artifact_dir)`

Uploads artifacts (screenshots, videos, traces) to ScaledTest backend.

**Parameters:**
- `artifact_dir` - Directory containing artifact files

**Returns:** 0 on success, 1 on failure

## Version

Current version: 1.0.0
