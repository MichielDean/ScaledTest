<#
.SYNOPSIS
    Builds and loads ScaledTest images into the Kind cluster.

.DESCRIPTION
    This script builds the backend and frontend Docker images and loads them
    directly into the Kind cluster (no registry needed).

.EXAMPLE
    .\cluster-load-images.ps1

.EXAMPLE
    .\cluster-load-images.ps1 -BackendOnly
    # Only build and load backend image

.EXAMPLE
    .\cluster-load-images.ps1 -FrontendOnly
    # Only build and load frontend image
#>

param(
    [switch]$BackendOnly,
    [switch]$FrontendOnly
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = (Get-Item "$ScriptDir\..\..").FullName
$ClusterName = "scaledtest"

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║          Building and Loading Images to Kind                 ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Verify cluster exists
$existingClusters = kind get clusters 2>$null
if ($existingClusters -notcontains $ClusterName) {
    Write-Host "ERROR: Cluster '$ClusterName' does not exist. Run cluster-create.ps1 first." -ForegroundColor Red
    exit 1
}

# Build and load backend
if (-not $FrontendOnly) {
    Write-Host "Building backend image..." -ForegroundColor Yellow
    $backendPath = Join-Path $RepoRoot "backend"
    Push-Location $backendPath
    
    docker build -t scaledtest-backend:dev .
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to build backend image" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    
    Write-Host "Loading backend image into Kind..." -ForegroundColor Yellow
    kind load docker-image scaledtest-backend:dev --name $ClusterName
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to load backend image into Kind" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    
    Pop-Location
    Write-Host "✓ Backend image loaded" -ForegroundColor Green
}

# Build and load frontend
if (-not $BackendOnly) {
    Write-Host ""
    Write-Host "Building frontend image..." -ForegroundColor Yellow
    $frontendPath = Join-Path $RepoRoot "frontend"
    Push-Location $frontendPath
    
    docker build -t scaledtest-frontend:dev .
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to build frontend image" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    
    Write-Host "Loading frontend image into Kind..." -ForegroundColor Yellow
    kind load docker-image scaledtest-frontend:dev --name $ClusterName
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to load frontend image into Kind" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    
    Pop-Location
    Write-Host "✓ Frontend image loaded" -ForegroundColor Green
}

Write-Host ""
Write-Host "✓ Images loaded successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Restarting deployments to pick up new images..." -ForegroundColor Yellow

if (-not $FrontendOnly) {
    kubectl rollout restart deployment/scaledtest-backend -n scaledtest
}
if (-not $BackendOnly) {
    kubectl rollout restart deployment/scaledtest-frontend -n scaledtest
}

Write-Host ""
Write-Host "Waiting for pods to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 5
kubectl get pods -n scaledtest

Write-Host ""
