#!/bin/bash
set -e

# Entrypoint script for Playwright test runner
# Supports two modes:
# 1. DISCOVERY_MODE=true - Discover all tests and output metadata
# 2. Normal mode - Run specific test based on JOB_COMPLETION_INDEX

echo "=== Playwright Test Runner Entrypoint ==="
echo "Mode: ${DISCOVERY_MODE:-execution}"

if [ "$DISCOVERY_MODE" = "true" ]; then
  echo "Running in discovery mode..."
  /scripts/discover-tests.sh
else
  echo "Running in execution mode..."
  /scripts/run-test.sh
fi
