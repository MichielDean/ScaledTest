#!/bin/bash
set -e

# Source ScaledTest client library
source /scaledtest-client/client.sh

# Validate environment early
if ! scaledtest_validate_env; then
    echo "ERROR: Required environment variables not set"
    exit 1
fi

# Check test-specific required variables
if [ -z "$JOB_COMPLETION_INDEX" ]; then
  echo "ERROR: JOB_COMPLETION_INDEX not set"
  exit 1
fi

if [ -z "$TEST_ID" ]; then
  echo "ERROR: TEST_ID not set"
  echo ""
  echo "This usually means test discovery failed or returned no tests."
  echo "Troubleshooting steps:"
  echo "  1. Check discovery job logs: kubectl logs job/<discovery-job-name> -n <namespace>"
  echo "  2. Run discovery locally: docker run -e DISCOVERY_MODE=true <test-image>"
  echo "  3. Verify tests exist in the tests/ui directory"
  exit 1
fi

# Fail fast if TEST_ID is "all" - this indicates a configuration error
# ScaledTest is designed to run exactly one test per pod for proper parallelization
if [ "$TEST_ID" = "all" ]; then
  echo "ERROR: TEST_ID='all' is not supported"
  echo ""
  echo "ScaledTest runs one test per pod for proper parallelization."
  echo "If you see this error, test discovery likely failed."
  echo ""
  echo "Troubleshooting steps:"
  echo "  1. Check discovery job logs for errors"
  echo "  2. Ensure your test image outputs CTRF JSON between markers:"
  echo "     === CTRF JSON START ==="
  echo "     <json content>"
  echo "     === CTRF JSON END ==="
  echo "  3. Run discovery locally to debug: docker run -e DISCOVERY_MODE=true <your-image>"
  exit 1
fi

echo "=== Test Execution Environment ==="
echo "Job Index: $JOB_COMPLETION_INDEX"
echo "Test ID: $TEST_ID"
echo "Base URL: ${BASE_URL:-http://localhost:5173}"
echo "API URL: ${API_URL:-not set}"
echo "Test Run ID: ${TEST_RUN_ID:-not set}"

# Connectivity preflight check
echo ""
echo "=== Connectivity Check ==="
EFFECTIVE_BASE_URL="${BASE_URL:-http://localhost:5173}"
echo "Checking connectivity to: $EFFECTIVE_BASE_URL"

# Try to reach the base URL (frontend)
if curl -sf --connect-timeout 5 --max-time 10 "$EFFECTIVE_BASE_URL" > /dev/null 2>&1; then
  echo "✓ Frontend is reachable at $EFFECTIVE_BASE_URL"
else
  echo "⚠ WARNING: Cannot reach frontend at $EFFECTIVE_BASE_URL"
  echo "  DNS lookup:"
  # Extract hostname from URL
  FRONTEND_HOST=$(echo "$EFFECTIVE_BASE_URL" | sed -e 's|^[^/]*//||' -e 's|[:/].*||')
  nslookup "$FRONTEND_HOST" 2>&1 | head -10 || echo "  (nslookup not available)"
  echo ""
  echo "  This may cause tests to fail. Common issues:"
  echo "    - Frontend service not deployed"
  echo "    - Wrong BASE_URL configured in cluster runner settings"
  echo "    - DNS resolution issues in the cluster"
  echo ""
  echo "  Continuing anyway - Playwright will report connection errors..."
fi

# Set output paths
TEST_RESULTS_DIR="${TEST_RESULTS_DIR:-/test-results}"
ARTIFACTS_DIR="${ARTIFACTS_DIR:-/artifacts}"
CTRF_OUTPUT="${TEST_RESULTS_DIR}/ctrf-report.json"

# Create output directories
mkdir -p "$TEST_RESULTS_DIR" "$ARTIFACTS_DIR"

echo ""
echo "=== Running Test ==="

# Parse test ID to get file and test name
# Format: tests_ui_login_test_ts_Login_should_display_login_form
# Need to reconstruct the grep pattern
TEST_FILE=$(echo "$TEST_ID" | sed 's/_test_ts.*//' | sed 's/_/\//g').test.ts
TEST_PATTERN=$(echo "$TEST_ID" | sed 's/.*_test_ts_//' | sed 's/_/ /g')

echo "Running test: $TEST_PATTERN"
echo "From file: $TEST_FILE"

# Run the specific test using grep to match the test name
# The --grep flag matches the test title
npx playwright test \
  --config=playwright.k8s.config.ts \
  --grep="$TEST_PATTERN" \
  "$TEST_FILE" \
  || TEST_EXIT_CODE=$?

# Check if test failed
if [ ! -z "$TEST_EXIT_CODE" ] && [ "$TEST_EXIT_CODE" -ne 0 ]; then
  echo "Test failed with exit code: $TEST_EXIT_CODE"
fi

# Copy CTRF report from plugin's output location to expected location
if [ -f "/app/ctrf/ctrf-report.json" ]; then
  cp "/app/ctrf/ctrf-report.json" "$CTRF_OUTPUT"
  
  # Inject test run ID and job completion index for aggregation
  if [ ! -z "$TEST_RUN_ID" ]; then
    echo "Injecting TEST_RUN_ID: $TEST_RUN_ID and JOB_COMPLETION_INDEX: $JOB_COMPLETION_INDEX"
    jq --arg runId "$TEST_RUN_ID" --arg jobIndex "$JOB_COMPLETION_INDEX" \
      '.extra = {"testRunId": $runId, "jobCompletionIndex": $jobIndex}' \
      "$CTRF_OUTPUT" > "${CTRF_OUTPUT}.tmp" && mv "${CTRF_OUTPUT}.tmp" "$CTRF_OUTPUT"
  fi
fi

# Verify CTRF output exists
if [ ! -f "$CTRF_OUTPUT" ]; then
  echo "ERROR: CTRF output not found at $CTRF_OUTPUT"
  echo "Creating minimal CTRF report for failed execution"
  
  cat > "$CTRF_OUTPUT" << EOF
{
  "results": {
    "tool": {
      "name": "playwright",
      "version": "1.56.1"
    },
    "summary": {
      "tests": 1,
      "passed": 0,
      "failed": 1,
      "pending": 0,
      "skipped": 0,
      "other": 0,
      "start": $(date +%s)000,
      "stop": $(date +%s)000
    },
    "tests": [
      {
        "name": "$TEST_ID",
        "status": "failed",
        "duration": 0,
        "message": "Test execution failed - CTRF output not generated"
      }
    ]
  }
}
EOF
fi

echo "CTRF report generated at: $CTRF_OUTPUT"
cat "$CTRF_OUTPUT" | jq .

# Collect artifacts (screenshots, videos, traces)
echo "Collecting artifacts..."

# Copy all artifacts from Playwright output directory
if [ -d "$TEST_RESULTS_DIR" ]; then
  find "$TEST_RESULTS_DIR" -type f \( -name "*.png" -o -name "*.jpg" -o -name "*.webm" -o -name "*.zip" \) \
    -exec cp {} "$ARTIFACTS_DIR/" \; 2>/dev/null || true
fi

# List collected artifacts
ARTIFACT_COUNT=$(find "$ARTIFACTS_DIR" -type f | wc -l)
echo "Collected $ARTIFACT_COUNT artifacts"

if [ "$ARTIFACT_COUNT" -gt 0 ]; then
  echo "Artifacts:"
  ls -lh "$ARTIFACTS_DIR"
fi

# Upload results using ScaledTest client library
echo "Uploading results to ScaledTest backend..."
if scaledtest_upload_results "$CTRF_OUTPUT"; then
    echo "✅ Results uploaded successfully"
else
    echo "❌ Failed to upload results"
    exit 1
fi

# Upload artifacts (placeholder - not yet implemented in backend)
scaledtest_upload_artifacts "$ARTIFACTS_DIR"

echo "Test execution complete"

# Always exit 0 after successful upload - test pass/fail is captured in CTRF report
# This prevents K8s from marking the job as failed due to test failures
exit 0
