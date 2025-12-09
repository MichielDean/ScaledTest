<#
.SYNOPSIS
    Stops the ScaledTest Kind cluster without deleting it.

.DESCRIPTION
    This script stops all Docker containers that make up the Kind cluster.
    The cluster state is preserved and can be restarted with cluster-start.ps1.

.EXAMPLE
    .\cluster-stop.ps1

.NOTES
    This is useful for freeing up resources when not actively developing.
#>

$ErrorActionPreference = "Stop"
$ClusterName = "scaledtest"

Write-Host ""
Write-Host "Stopping ScaledTest Kind cluster..." -ForegroundColor Yellow

# Get all containers for this cluster
$containers = docker ps -q --filter "label=io.x-k8s.kind.cluster=$ClusterName" 2>$null

if (-not $containers) {
    Write-Host "No running containers found for cluster '$ClusterName'" -ForegroundColor Gray
    Write-Host "The cluster may already be stopped or doesn't exist." -ForegroundColor Gray
    exit 0
}

# Stop all cluster containers
docker stop $containers

Write-Host ""
Write-Host "✓ Cluster stopped successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "To restart the cluster, run: .\cluster-start.ps1" -ForegroundColor Cyan
Write-Host ""
