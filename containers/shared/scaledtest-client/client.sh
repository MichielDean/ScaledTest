#!/bin/bash
# ScaledTest Client Library for Test Runners
# Reusable upload logic for CTRF results
# Version: 1.0.0

set -e

SCALEDTEST_VERSION="1.0.0"

# Validate required environment variables
scaledtest_validate_env() {
    local missing=()
    
    [ -z "$API_URL" ] && missing+=("API_URL")
    [ -z "$API_TOKEN" ] && missing+=("API_TOKEN")
    [ -z "$TEST_RUN_ID" ] && missing+=("TEST_RUN_ID")
    
    if [ ${#missing[@]} -gt 0 ]; then
        echo "ERROR: Missing required environment variables: ${missing[*]}" >&2
        echo "ScaledTest Client requires: API_URL, API_TOKEN, TEST_RUN_ID" >&2
        return 1
    fi
    
    return 0
}

# Upload CTRF report to ScaledTest
# Usage: scaledtest_upload_results <path-to-ctrf-json>
scaledtest_upload_results() {
    local ctrf_file="$1"
    
    if [ -z "$ctrf_file" ]; then
        echo "ERROR: CTRF file path required" >&2
        return 1
    fi
    
    if [ ! -f "$ctrf_file" ]; then
        echo "ERROR: CTRF file not found: $ctrf_file" >&2
        return 1
    fi
    
    # Validate environment
    scaledtest_validate_env || return 1
    
    echo "📤 Uploading results to ScaledTest..."
    echo "   API: $API_URL"
    echo "   Run ID: $TEST_RUN_ID"
    
    local response_file=$(mktemp)
    local http_code=$(curl -w "%{http_code}" -o "$response_file" \
        -X POST "$API_URL/api/v1/test-results/upsert?test_run_id=$TEST_RUN_ID" \
        -H "Authorization: Bearer $API_TOKEN" \
        -H "Content-Type: application/json" \
        -H "User-Agent: ScaledTest-Client/$SCALEDTEST_VERSION" \
        -d @"$ctrf_file" \
        --silent \
        --max-time 30)
    
    if [ "$http_code" -eq 200 ] || [ "$http_code" -eq 201 ]; then
        echo "✅ Results uploaded successfully (HTTP $http_code)"
        cat "$response_file" | jq . 2>/dev/null || cat "$response_file"
        rm -f "$response_file"
        return 0
    else
        echo "❌ Upload failed (HTTP $http_code)" >&2
        cat "$response_file" >&2
        rm -f "$response_file"
        return 1
    fi
}

# Upload artifact files to ScaledTest
# Usage: scaledtest_upload_artifacts <artifact-dir>
scaledtest_upload_artifacts() {
    local artifact_dir="$1"
    
    if [ -z "$artifact_dir" ] || [ ! -d "$artifact_dir" ]; then
        echo "No artifacts to upload"
        return 0
    fi
    
    local artifact_count=$(find "$artifact_dir" -type f | wc -l)
    
    if [ "$artifact_count" -eq 0 ]; then
        echo "No artifacts found in $artifact_dir"
        return 0
    fi
    
    echo "📦 Uploading $artifact_count artifacts..."
    
    # TODO: Implement artifact upload when backend endpoint exists
    # POST /api/v1/test-runs/{test_run_id}/artifacts
    
    echo "⚠️  Artifact upload not yet implemented (backend endpoint pending)"
    return 0
}

# Export functions for use in other scripts
export -f scaledtest_validate_env
export -f scaledtest_upload_results
export -f scaledtest_upload_artifacts
