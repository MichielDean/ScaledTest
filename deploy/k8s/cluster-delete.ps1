<#
.SYNOPSIS
    Deletes the ScaledTest Kind cluster completely.

.DESCRIPTION
    This script completely removes the Kind cluster and all its data.
    Use cluster-stop.ps1 if you want to temporarily stop the cluster
    without losing data.

.EXAMPLE
    .\cluster-delete.ps1

.EXAMPLE
    .\cluster-delete.ps1 -Force
    # Skip confirmation prompt
#>

param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$ClusterName = "scaledtest"

Write-Host ""
Write-Host "Deleting ScaledTest Kind cluster..." -ForegroundColor Yellow

# Check if cluster exists
$existingClusters = kind get clusters 2>$null
if ($existingClusters -notcontains $ClusterName) {
    Write-Host "Cluster '$ClusterName' does not exist." -ForegroundColor Gray
    exit 0
}

# Confirm deletion
if (-not $Force) {
    Write-Host ""
    Write-Host "WARNING: This will permanently delete the cluster and all data!" -ForegroundColor Red
    $confirm = Read-Host "Are you sure you want to continue? (y/N)"
    if ($confirm -ne 'y' -and $confirm -ne 'Y') {
        Write-Host "Cancelled." -ForegroundColor Gray
        exit 0
    }
}

# Delete cluster
kind delete cluster --name $ClusterName

Write-Host ""
Write-Host "✓ Cluster deleted successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "To create a new cluster, run: .\cluster-create.ps1" -ForegroundColor Cyan
Write-Host ""
