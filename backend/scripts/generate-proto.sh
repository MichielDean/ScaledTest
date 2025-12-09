#!/bin/bash
# Script to generate code from proto files using Buf

set -e

echo "ScaledTest Proto Code Generation"
echo "================================="

# Check if buf is installed
if ! command -v buf &> /dev/null; then
    echo "ERROR: buf not found!"
    echo "Please install Buf CLI:"
    echo "  - Download from: https://buf.build/docs/installation"
    echo "  - Or use: go install github.com/bufbuild/buf/cmd/buf@latest"
    echo "  - Or use brew: brew install bufbuild/buf/buf"
    exit 1
fi

echo "✓ Buf CLI found: $(buf --version)"

# Navigate to backend directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
cd "$BACKEND_DIR"

echo "Working directory: $BACKEND_DIR"

# Clean previous generated files
echo "Cleaning previous generated files..."
rm -rf gen
rm -rf ../frontend/src/gen

# Create output directories
mkdir -p gen/go
mkdir -p gen/openapi
mkdir -p ../frontend/src/gen

# Update buf dependencies
echo "Updating buf dependencies..."
buf dep update
echo "✓ Dependencies updated"

# Lint proto files
echo "Linting proto files..."
if buf lint; then
    echo "✓ Lint passed"
else
    echo "WARNING: Lint issues found (continuing anyway)"
fi

# Generate code
echo "Generating code from proto files..."
buf generate
echo "✓ Code generation complete!"

echo ""
echo "Generated files:"
echo "  - Go:        backend/gen/go/"
echo "  - OpenAPI:   backend/gen/openapi/"
echo "  - TypeScript: frontend/src/gen/"
echo ""
echo "Next steps:"
echo "  1. Run 'go mod tidy' in backend/"
echo "  2. Run 'npm install' in frontend/ (if new dependencies)"

