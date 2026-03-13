# GitHub Actions Integration

Upload CTRF test reports to ScaledTest from your GitHub Actions workflows.

## Prerequisites

1. A running ScaledTest instance
2. An API token (see [Getting an API Token](#getting-an-api-token))
3. A test runner that outputs CTRF-formatted reports (e.g., `jest-ctrf-json-reporter`)

## Getting an API Token

API tokens authenticate CI pipelines against the ScaledTest API. Tokens use the format `sct_<64 hex characters>` and are shown **exactly once** at creation — store them immediately.

1. Log in to your ScaledTest instance
2. Navigate to your team settings
3. Go to **API Tokens**
4. Click **Create Token** (requires `maintainer` or `owner` role)
5. Copy the token — it cannot be retrieved later

### Storing the Token as a GitHub Secret

1. Go to your GitHub repository **Settings > Secrets and variables > Actions**
2. Click **New repository secret**
3. Name: `SCALEDTEST_API_TOKEN`
4. Value: paste your `sct_...` token
5. Click **Add secret**

Also add your ScaledTest instance URL:

- Name: `SCALEDTEST_URL`
- Value: `https://your-scaledtest-instance.example.com`

## Uploading Reports with `@scaledtest/sdk`

The recommended approach uses the ScaledTest SDK in a Node.js script.

### 1. Install the SDK

```bash
npm install --save-dev @scaledtest/sdk
```

### 2. Create an upload script

Create `scripts/upload-ctrf.ts` (or `.js`):

```typescript
import { ScaledTestClient } from "@scaledtest/sdk";
import { readFileSync } from "fs";

const reportPath = process.argv[2] || "ctrf-report.json";
const report = JSON.parse(readFileSync(reportPath, "utf-8"));

const client = new ScaledTestClient({
  baseUrl: process.env.SCALEDTEST_URL!,
  token: process.env.SCALEDTEST_API_TOKEN!,
});

async function main() {
  const result = await client.uploadReport({ report });
  console.log(`Report uploaded: ${result.id}`);
  if (result.summary) {
    console.log(
      `Tests: ${result.summary.tests} | Passed: ${result.summary.passed} | Failed: ${result.summary.failed}`
    );
  }

  // Fail the build if any tests failed
  if (result.summary && result.summary.failed > 0) {
    console.error(`${result.summary.failed} test(s) failed`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Failed to upload report:", err.message);
  process.exit(1);
});
```

### 3. Add the workflow step

```yaml
- name: Upload CTRF report to ScaledTest
  if: always()
  env:
    SCALEDTEST_URL: ${{ secrets.SCALEDTEST_URL }}
    SCALEDTEST_API_TOKEN: ${{ secrets.SCALEDTEST_API_TOKEN }}
  run: npx tsx scripts/upload-ctrf.ts ctrf-report.json
```

## Uploading Reports with `curl`

If you prefer not to install the SDK, use `curl` to POST the report directly:

```yaml
- name: Upload CTRF report to ScaledTest
  if: always()
  env:
    SCALEDTEST_URL: ${{ secrets.SCALEDTEST_URL }}
    SCALEDTEST_API_TOKEN: ${{ secrets.SCALEDTEST_API_TOKEN }}
  run: |
    if [ -f ctrf-report.json ]; then
      response=$(curl -s -w "\n%{http_code}" -X POST \
        "$SCALEDTEST_URL/api/v1/reports" \
        -H "Authorization: Bearer $SCALEDTEST_API_TOKEN" \
        -H "Content-Type: application/json" \
        -d @ctrf-report.json)

      http_code=$(echo "$response" | tail -1)
      body=$(echo "$response" | sed '$d')

      echo "$body" | jq .

      if [ "$http_code" -ne 201 ]; then
        echo "Upload failed with status $http_code"
        exit 1
      fi
    else
      echo "No CTRF report found at ctrf-report.json"
    fi
```

## Failing the Build on Test Failures

The upload response includes a `summary` object with pass/fail counts. Use this to enforce quality gates:

### With the SDK

The upload script above already exits with code 1 when `summary.failed > 0`. Customize the threshold as needed:

```typescript
// Fail if pass rate drops below 95%
const passRate = result.summary.passed / result.summary.tests;
if (passRate < 0.95) {
  console.error(`Pass rate ${(passRate * 100).toFixed(1)}% is below 95% threshold`);
  process.exit(1);
}
```

### With `curl`

```yaml
- name: Upload and check quality gate
  if: always()
  env:
    SCALEDTEST_URL: ${{ secrets.SCALEDTEST_URL }}
    SCALEDTEST_API_TOKEN: ${{ secrets.SCALEDTEST_API_TOKEN }}
  run: |
    if [ ! -f ctrf-report.json ]; then
      echo "No CTRF report found"
      exit 1
    fi

    body=$(curl -s -X POST \
      "$SCALEDTEST_URL/api/v1/reports" \
      -H "Authorization: Bearer $SCALEDTEST_API_TOKEN" \
      -H "Content-Type: application/json" \
      -d @ctrf-report.json)

    echo "$body" | jq .

    failed=$(echo "$body" | jq -r '.summary.failed // 0')
    if [ "$failed" -gt 0 ]; then
      echo "Quality gate failed: $failed test(s) failed"
      exit 1
    fi
```

## Complete Working Example

A full workflow that runs Jest tests, uploads the CTRF report, and enforces a quality gate:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test-and-report:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test
        # Tests generate ctrf-report.json via jest-ctrf-json-reporter

      - name: Upload CTRF report to ScaledTest
        if: always()
        env:
          SCALEDTEST_URL: ${{ secrets.SCALEDTEST_URL }}
          SCALEDTEST_API_TOKEN: ${{ secrets.SCALEDTEST_API_TOKEN }}
        run: |
          if [ ! -f ctrf-report.json ]; then
            echo "No CTRF report found — skipping upload"
            exit 0
          fi

          response=$(curl -s -w "\n%{http_code}" -X POST \
            "$SCALEDTEST_URL/api/v1/reports" \
            -H "Authorization: Bearer $SCALEDTEST_API_TOKEN" \
            -H "Content-Type: application/json" \
            -d @ctrf-report.json)

          http_code=$(echo "$response" | tail -1)
          body=$(echo "$response" | sed '$d')

          echo "ScaledTest response:"
          echo "$body" | jq .

          if [ "$http_code" -ne 201 ]; then
            echo "::error::CTRF report upload failed (HTTP $http_code)"
            exit 1
          fi

          # Extract summary for GitHub Actions step summary
          tests=$(echo "$body" | jq -r '.summary.tests // "N/A"')
          passed=$(echo "$body" | jq -r '.summary.passed // "N/A"')
          failed=$(echo "$body" | jq -r '.summary.failed // "N/A"')
          skipped=$(echo "$body" | jq -r '.summary.skipped // "N/A"')

          echo "### Test Results" >> "$GITHUB_STEP_SUMMARY"
          echo "| Metric | Count |" >> "$GITHUB_STEP_SUMMARY"
          echo "|--------|-------|" >> "$GITHUB_STEP_SUMMARY"
          echo "| Tests  | $tests |" >> "$GITHUB_STEP_SUMMARY"
          echo "| Passed | $passed |" >> "$GITHUB_STEP_SUMMARY"
          echo "| Failed | $failed |" >> "$GITHUB_STEP_SUMMARY"
          echo "| Skipped | $skipped |" >> "$GITHUB_STEP_SUMMARY"

          # Quality gate: fail if any tests failed
          if [ "$failed" != "0" ] && [ "$failed" != "N/A" ]; then
            echo "::error::Quality gate failed: $failed test(s) failed"
            exit 1
          fi

      - name: Upload test artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: ctrf-report
          path: ctrf-report.json
          if-no-files-found: ignore
```

## API Reference

### `POST /api/v1/reports`

Uploads a CTRF test report.

**Headers:**
- `Authorization: Bearer sct_<token>`
- `Content-Type: application/json`

**Body:** A valid CTRF report object (see [CTRF specification](https://ctrf.io))

**Response (201):**
```json
{
  "success": true,
  "id": "report-uuid",
  "message": "CTRF report stored successfully",
  "summary": {
    "tests": 150,
    "passed": 145,
    "failed": 3,
    "skipped": 2,
    "pending": 0,
    "other": 0
  }
}
```

**Error responses:**
- `400` — Invalid CTRF report (validation errors in `details`)
- `401` — Missing or invalid API token
- `503` — Database unavailable
