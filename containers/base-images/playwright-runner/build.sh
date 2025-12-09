#!/bin/bash
# Build script for Playwright test runner

set -e

echo "=== Building Playwright Test Runner ==="

# Default values
IMAGE_NAME="${IMAGE_NAME:-playwright-runner}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
REGISTRY="${REGISTRY:-}"
PUSH="${PUSH:-false}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --tag)
      IMAGE_TAG="$2"
      shift 2
      ;;
    --registry)
      REGISTRY="$2"
      shift 2
      ;;
    --push)
      PUSH="true"
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Build full image name
if [ -n "$REGISTRY" ]; then
  FULL_IMAGE="${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"
else
  FULL_IMAGE="${IMAGE_NAME}:${IMAGE_TAG}"
fi

echo "Building: $FULL_IMAGE"
echo "Push: $PUSH"

# Move to repository root (3 levels up from this script)
cd "$(dirname "$0")/../../.."

# Build image
docker build \
  -f containers/base-images/playwright-runner/Dockerfile \
  -t "$FULL_IMAGE" \
  --build-arg BUILD_DATE="$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  --build-arg VCS_REF="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')" \
  .

echo "✓ Build complete: $FULL_IMAGE"

# Push if requested
if [ "$PUSH" = "true" ]; then
  echo "Pushing to registry..."
  docker push "$FULL_IMAGE"
  echo "✓ Push complete"
fi

# Show image size
echo ""
echo "Image details:"
docker images "$FULL_IMAGE" --format "table {{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"

echo ""
echo "=== Build Complete ==="
echo ""
echo "Test locally with:"
echo "  docker run --rm -e DISCOVERY_MODE=true $FULL_IMAGE"
