#!/bin/bash
set -e

echo "=== Playwright Test Discovery ==="
echo "Discovering tests in: tests/ui/"

# Create output directory
mkdir -p /test-results

# Use Playwright's list-tests feature to discover all tests
npx playwright test --list --config=playwright.k8s.config.ts > /tmp/test-list.txt 2>&1 || true

# Parse test list and create CTRF-style discovery format
cat > /test-results/discovered-tests.json << 'EOF'
{
  "framework": "playwright",
  "frameworkVersion": "1.56.1",
  "language": "typescript",
  "discoveredAt": "TIMESTAMP",
  "totalTests": 0,
  "tests": []
}
EOF

# Parse Playwright's test list output
# Format: "  [chromium] › tests/ui/login.test.ts:15:5 › Login › should display login form"
TESTS=$(grep -E "^\s+\[" /tmp/test-list.txt | sed 's/^[[:space:]]*//' || echo "")

if [ -z "$TESTS" ]; then
  echo "No tests found or error parsing test list"
  cat /tmp/test-list.txt
  exit 0
fi

# Convert to JSON array
TESTS_JSON="[]"
TEST_COUNT=0

while IFS= read -r line; do
  if [ -z "$line" ]; then
    continue
  fi
  
  # Extract test info using regex
  # Format: [chromium] › path/to/test.ts:line:col › Suite › Test Name
  PROJECT=$(echo "$line" | sed -n 's/^\[\([^]]*\)\].*/\1/p')
  FILE_RELATIVE=$(echo "$line" | sed -n 's/.*› \([^›]*\.ts\):[0-9]*.*/\1/p')
  # Prepend testDir since Playwright outputs paths relative to testDir
  FILE="tests/ui/$FILE_RELATIVE"
  REST=$(echo "$line" | sed -n 's/.*\.ts:[0-9]*:[0-9]* › \(.*\)/\1/p')
  
  # Split suite and test name (last › separator)
  if echo "$REST" | grep -q "›"; then
    SUITE=$(echo "$REST" | sed 's/ › [^›]*$//')
    TEST_NAME=$(echo "$REST" | sed 's/.*› //')
  else
    SUITE=""
    TEST_NAME="$REST"
  fi
  
  # Generate unique test ID
  TEST_ID=$(echo "${FILE}_${TEST_NAME}" | sed 's/[^a-zA-Z0-9_-]/_/g')
  
  # Add to JSON array
  TEST_COUNT=$((TEST_COUNT + 1))
  
  TEST_JSON=$(cat <<JSON
{
  "id": "${TEST_ID}",
  "name": "${TEST_NAME}",
  "suite": "${SUITE}",
  "file": "${FILE}",
  "project": "${PROJECT}",
  "tags": []
}
JSON
)
  
  if [ "$TEST_COUNT" -eq 1 ]; then
    TESTS_JSON="[$TEST_JSON"
  else
    TESTS_JSON="$TESTS_JSON,$TEST_JSON"
  fi
  
done <<< "$TESTS"

TESTS_JSON="$TESTS_JSON]"

# Update the discovery JSON with actual data
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
jq --arg timestamp "$TIMESTAMP" \
   --argjson count "$TEST_COUNT" \
   --argjson tests "$TESTS_JSON" \
   '.discoveredAt = $timestamp | .totalTests = $count | .tests = $tests' \
   /test-results/discovered-tests.json > /test-results/discovered-tests.tmp.json

mv /test-results/discovered-tests.tmp.json /test-results/discovered-tests.json

echo "Discovery complete: Found $TEST_COUNT tests"
cat /test-results/discovered-tests.json | jq -r '.tests[] | "\(.id) - \(.name)"' | head -20

# Output the complete JSON for the backend to parse
echo "=== CTRF JSON START ==="
cat /test-results/discovered-tests.json
echo "=== CTRF JSON END ==="

if [ "$TEST_COUNT" -gt 20 ]; then
  echo "... and $((TEST_COUNT - 20)) more tests"
fi

exit 0
