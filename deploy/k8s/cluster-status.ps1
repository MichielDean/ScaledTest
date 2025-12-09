<#
.SYNOPSIS
    Shows the status of the ScaledTest Kind cluster and application.

.DESCRIPTION
    This script displays the current status of the Kind cluster,
    running pods, services, and tests connectivity to the services.

.EXAMPLE
    .\cluster-status.ps1
#>

$ErrorActionPreference = "Continue"
$ClusterName = "scaledtest"

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║          ScaledTest Cluster Status                           ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check if cluster exists
$existingClusters = kind get clusters 2>$null
if ($existingClusters -notcontains $ClusterName) {
    Write-Host "Cluster '$ClusterName' does not exist." -ForegroundColor Red
    Write-Host "Run cluster-create.ps1 to create it." -ForegroundColor Yellow
    exit 1
}

# Check cluster containers
Write-Host "Cluster Containers:" -ForegroundColor Yellow
$runningContainers = docker ps --filter "label=io.x-k8s.kind.cluster=$ClusterName" --format "table {{.Names}}\t{{.Status}}" 2>$null
$allContainers = docker ps -a --filter "label=io.x-k8s.kind.cluster=$ClusterName" --format "table {{.Names}}\t{{.Status}}" 2>$null

$runningCount = (docker ps -q --filter "label=io.x-k8s.kind.cluster=$ClusterName" 2>$null | Measure-Object -Line).Lines
$totalCount = (docker ps -aq --filter "label=io.x-k8s.kind.cluster=$ClusterName" 2>$null | Measure-Object -Line).Lines

if ($runningCount -eq 0) {
    Write-Host "  Cluster is STOPPED ($totalCount containers exist but not running)" -ForegroundColor Red
    Write-Host "  Run cluster-start.ps1 to start it." -ForegroundColor Yellow
    exit 0
} elseif ($runningCount -lt $totalCount) {
    Write-Host "  Cluster is PARTIALLY RUNNING ($runningCount/$totalCount containers)" -ForegroundColor Yellow
} else {
    Write-Host "  Cluster is RUNNING ($runningCount nodes)" -ForegroundColor Green
}

Write-Host ""

# Check kubernetes connectivity
Write-Host "Kubernetes Cluster:" -ForegroundColor Yellow
$clusterInfo = kubectl cluster-info --context kind-$ClusterName 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ API Server is accessible" -ForegroundColor Green
} else {
    Write-Host "  ✗ API Server is not accessible" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Show nodes
Write-Host "Nodes:" -ForegroundColor Yellow
kubectl get nodes --context kind-$ClusterName 2>$null

Write-Host ""

# Show pods
Write-Host "ScaledTest Pods:" -ForegroundColor Yellow
$pods = kubectl get pods -n scaledtest --context kind-$ClusterName 2>$null
if ($LASTEXITCODE -eq 0 -and $pods) {
    kubectl get pods -n scaledtest --context kind-$ClusterName
} else {
    Write-Host "  No ScaledTest pods found. Deploy with:" -ForegroundColor Gray
    Write-Host "  helm install scaledtest ../helm/scaledtest -f ../helm/scaledtest/values-dev.yaml -n scaledtest --create-namespace" -ForegroundColor Gray
}

Write-Host ""

# Show services
Write-Host "Services:" -ForegroundColor Yellow
kubectl get svc -n scaledtest --context kind-$ClusterName 2>$null

Write-Host ""

# Test connectivity
Write-Host "Service Connectivity:" -ForegroundColor Yellow

$services = @(
    @{Name="Frontend"; Url="http://localhost:30173/"; Expected=200},
    @{Name="Backend"; Url="http://localhost:30080/health"; Expected=200},
    @{Name="MinIO API"; Url="http://localhost:30900/minio/health/live"; Expected=200},
    @{Name="MinIO Console"; Url="http://localhost:30901/"; Expected=@(200,303,307)}
)

foreach ($svc in $services) {
    Write-Host "  $($svc.Name): " -NoNewline
    try {
        $response = Invoke-WebRequest -Uri $svc.Url -TimeoutSec 3 -UseBasicParsing -MaximumRedirection 0 -ErrorAction Stop
        Write-Host "✓ OK ($($response.StatusCode))" -ForegroundColor Green
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($svc.Expected -contains $statusCode) {
            Write-Host "✓ OK ($statusCode)" -ForegroundColor Green
        } elseif ($statusCode) {
            Write-Host "? HTTP $statusCode" -ForegroundColor Yellow
        } else {
            Write-Host "✗ Not accessible" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "Access URLs:" -ForegroundColor Cyan
Write-Host "  Frontend:      http://localhost:30173" -ForegroundColor White
Write-Host "  Backend HTTP:  http://localhost:30080" -ForegroundColor White
Write-Host "  Backend gRPC:  localhost:30090" -ForegroundColor White
Write-Host "  MinIO API:     http://localhost:30900" -ForegroundColor White
Write-Host "  MinIO Console: http://localhost:30901" -ForegroundColor White
Write-Host ""
