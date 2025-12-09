<#
.SYNOPSIS
    Starts a previously stopped ScaledTest Kind cluster.

.DESCRIPTION
    This script starts all Docker containers that make up the Kind cluster
    that was previously stopped with cluster-stop.ps1.

.EXAMPLE
    .\cluster-start.ps1

.NOTES
    The cluster must have been created previously with cluster-create.ps1.
    If the cluster doesn't exist, use cluster-create.ps1 instead.
#>

$ErrorActionPreference = "Stop"
$ClusterName = "scaledtest"

Write-Host ""
Write-Host "Starting ScaledTest Kind cluster..." -ForegroundColor Yellow

# Get all containers for this cluster (including stopped)
$containers = docker ps -aq --filter "label=io.x-k8s.kind.cluster=$ClusterName" 2>$null

if (-not $containers) {
    Write-Host "No containers found for cluster '$ClusterName'" -ForegroundColor Red
    Write-Host "The cluster may not exist. Run cluster-create.ps1 to create it." -ForegroundColor Yellow
    exit 1
}

# Start all cluster containers
docker start $containers

Write-Host ""
Write-Host "Waiting for cluster to be ready..." -ForegroundColor Yellow

# Wait for the API server to be ready
$maxAttempts = 30
$attempt = 0
do {
    $attempt++
    Start-Sleep -Seconds 2
    $ready = kubectl cluster-info --context kind-$ClusterName 2>$null
} while ($LASTEXITCODE -ne 0 -and $attempt -lt $maxAttempts)

if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNING: Cluster may not be fully ready yet. Give it a moment." -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "✓ Cluster started successfully!" -ForegroundColor Green
}

# Check pod status
Write-Host ""
Write-Host "Checking pod status..." -ForegroundColor Yellow
Start-Sleep -Seconds 5
kubectl get pods -n scaledtest 2>$null

Write-Host ""
Write-Host "Access your services at:" -ForegroundColor Cyan
Write-Host "  Frontend:      http://localhost:30173" -ForegroundColor White
Write-Host "  Backend HTTP:  http://localhost:30080" -ForegroundColor White
Write-Host "  Backend gRPC:  localhost:30090" -ForegroundColor White
Write-Host "  MinIO API:     http://localhost:30900" -ForegroundColor White
Write-Host "  MinIO Console: http://localhost:30901" -ForegroundColor White
Write-Host ""
