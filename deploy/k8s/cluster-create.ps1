<#
.SYNOPSIS
    Creates the ScaledTest Kind cluster and deploys the application.

.DESCRIPTION
    This script creates a 10-node Kind cluster with pre-configured port mappings
    for persistent access to NodePort services, builds and loads the application
    images, then deploys ScaledTest using Helm.

.EXAMPLE
    .\cluster-create.ps1
    
.EXAMPLE
    .\cluster-create.ps1 -SkipDeploy
    # Only creates the cluster without deploying ScaledTest

.EXAMPLE
    .\cluster-create.ps1 -SkipBuild
    # Creates cluster and deploys, but assumes images are already loaded

.NOTES
    Prerequisites:
    - Docker Desktop running
    - Kind installed (winget install Kubernetes.kind)
    - Helm installed
    - kubectl installed
#>

param(
    [switch]$SkipDeploy,
    [switch]$SkipBuild,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = (Get-Item "$ScriptDir\..\..").FullName
$ClusterName = "scaledtest"

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║          ScaledTest Kind Cluster Setup                       ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Docker is not installed or not in PATH" -ForegroundColor Red
    exit 1
}

$dockerStatus = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Docker is not running. Please start Docker Desktop." -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ Docker is running" -ForegroundColor Green

if (-not (Get-Command kind -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Kind is not installed. Run: winget install Kubernetes.kind" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ Kind is installed ($(kind version))" -ForegroundColor Green

if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: kubectl is not installed" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ kubectl is installed" -ForegroundColor Green

if (-not (Get-Command helm -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Helm is not installed" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ Helm is installed" -ForegroundColor Green

# Check if cluster already exists
$existingClusters = kind get clusters 2>$null
if ($existingClusters -contains $ClusterName) {
    if ($Force) {
        Write-Host ""
        Write-Host "Cluster '$ClusterName' exists. Deleting due to -Force flag..." -ForegroundColor Yellow
        kind delete cluster --name $ClusterName
    } else {
        Write-Host ""
        Write-Host "Cluster '$ClusterName' already exists!" -ForegroundColor Yellow
        Write-Host "Use -Force to delete and recreate, or run cluster-delete.ps1 first." -ForegroundColor Yellow
        exit 0
    }
}

# Create cluster
Write-Host ""
Write-Host "Creating Kind cluster '$ClusterName' with 10 nodes..." -ForegroundColor Yellow
Write-Host "This may take a few minutes..." -ForegroundColor Gray

$configPath = Join-Path $ScriptDir "kind-cluster-config.yaml"
kind create cluster --config $configPath

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to create Kind cluster" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✓ Cluster created successfully!" -ForegroundColor Green

# Verify cluster
Write-Host ""
Write-Host "Verifying cluster..." -ForegroundColor Yellow
kubectl cluster-info --context kind-$ClusterName
kubectl get nodes

# Deploy ScaledTest
if (-not $SkipDeploy) {
    # Build and load images first
    if (-not $SkipBuild) {
        Write-Host ""
        Write-Host "Building and loading images into Kind..." -ForegroundColor Yellow
        & "$ScriptDir\cluster-load-images.ps1"
        if ($LASTEXITCODE -ne 0) {
            Write-Host "WARNING: Image loading had issues, continuing with deployment..." -ForegroundColor Yellow
        }
    }
    
    Write-Host ""
    Write-Host "Deploying ScaledTest..." -ForegroundColor Yellow
    
    $helmChartPath = Join-Path $RepoRoot "deploy\helm\scaledtest"
    $valuesPath = Join-Path $helmChartPath "values-kind.yaml"
    
    helm install scaledtest $helmChartPath -f $valuesPath -n scaledtest --create-namespace --timeout 10m
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to deploy ScaledTest" -ForegroundColor Red
        exit 1
    }
    
    Write-Host ""
    Write-Host "Waiting for pods to be ready..." -ForegroundColor Yellow
    kubectl wait --for=condition=ready pod -l app.kubernetes.io/instance=scaledtest -n scaledtest --timeout=300s 2>$null
    
    Write-Host ""
    Write-Host "✓ ScaledTest deployed successfully!" -ForegroundColor Green
}

# Print access information
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║                    Setup Complete!                           ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "Access your services at:" -ForegroundColor Cyan
Write-Host "  Frontend:      http://localhost:30173" -ForegroundColor White
Write-Host "  Backend HTTP:  http://localhost:30080" -ForegroundColor White
Write-Host "  Backend gRPC:  localhost:30090" -ForegroundColor White
Write-Host "  MinIO API:     http://localhost:30900" -ForegroundColor White
Write-Host "  MinIO Console: http://localhost:30901" -ForegroundColor White
Write-Host ""
Write-Host "Cluster management commands:" -ForegroundColor Cyan
Write-Host "  .\cluster-stop.ps1    # Stop cluster (preserves data)" -ForegroundColor Gray
Write-Host "  .\cluster-start.ps1   # Start stopped cluster" -ForegroundColor Gray
Write-Host "  .\cluster-delete.ps1  # Delete cluster completely" -ForegroundColor Gray
Write-Host "  .\cluster-status.ps1  # Show cluster and app status" -ForegroundColor Gray
Write-Host ""
