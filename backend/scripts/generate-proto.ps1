# PowerShell script to generate code from proto files using Buf

Write-Host "ScaledTest Proto Code Generation" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan

# Check if buf is installed
if (!(Get-Command buf -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: buf not found!" -ForegroundColor Red
    Write-Host "Please install Buf CLI:" -ForegroundColor Yellow
    Write-Host "  - Download from: https://buf.build/docs/installation" -ForegroundColor Yellow
    Write-Host "  - Or use: go install github.com/bufbuild/buf/cmd/buf@latest" -ForegroundColor Yellow
    Write-Host "  - Or use scoop: scoop install buf" -ForegroundColor Yellow
    exit 1
}

Write-Host "✓ Buf CLI found: $(buf --version)" -ForegroundColor Green

# Navigate to backend directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Split-Path -Parent $scriptDir
Set-Location $backendDir

Write-Host "Working directory: $backendDir" -ForegroundColor Gray

# Clean previous generated files
Write-Host "Cleaning previous generated files..." -ForegroundColor Cyan
if (Test-Path "gen") {
    Remove-Item -Recurse -Force "gen"
}
$frontendGenDir = Join-Path (Split-Path -Parent $backendDir) "frontend\src\gen"
if (Test-Path $frontendGenDir) {
    Remove-Item -Recurse -Force $frontendGenDir
}

# Create output directories
New-Item -ItemType Directory -Force -Path "gen\go" | Out-Null
New-Item -ItemType Directory -Force -Path "gen\openapi" | Out-Null
New-Item -ItemType Directory -Force -Path $frontendGenDir | Out-Null

# Update buf dependencies
Write-Host "Updating buf dependencies..." -ForegroundColor Cyan
buf dep update
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to update buf dependencies" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Dependencies updated" -ForegroundColor Green

# Lint proto files
Write-Host "Linting proto files..." -ForegroundColor Cyan
buf lint
if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNING: Lint issues found (continuing anyway)" -ForegroundColor Yellow
}
else {
    Write-Host "✓ Lint passed" -ForegroundColor Green
}

# Generate code
Write-Host "Generating code from proto files..." -ForegroundColor Cyan
buf generate
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Code generation failed" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Code generation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Generated files:" -ForegroundColor Cyan
Write-Host "  - Go:        backend/gen/go/" -ForegroundColor White
Write-Host "  - OpenAPI:   backend/gen/openapi/" -ForegroundColor White
Write-Host "  - TypeScript: frontend/src/gen/" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Run 'go mod tidy' in backend/" -ForegroundColor White
Write-Host "  2. Run 'npm install' in frontend/ (if new dependencies)" -ForegroundColor White

