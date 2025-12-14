#!/bin/bash
# ScaledTest - Test Runner Script
# ================================
# This script runs ScaledTest's tests by deploying to Kubernetes and using
# the platform itself to execute frontend tests (dogfooding).
#
# Flow:
#   1. Build and push Docker images to local registry
#   2. Deploy ScaledTest to Kind cluster via Helm
#   3. Run Go backend tests locally
#   4. Use CLI to trigger frontend Playwright tests in K8s
#
# Prerequisites:
#   - Docker Desktop running
#   - kind CLI installed
#   - helm CLI installed
#   - kubectl CLI installed
#
# NodePort services are exposed directly via Kind extraPortMappings:
#   - Backend HTTP:  http://localhost:30080
#   - Backend gRPC:  localhost:30090
#   - Frontend:      http://localhost:30173
#   - MinIO API:     http://localhost:30900
#   - MinIO Console: http://localhost:30901

set -e

# WSL PATH setup - Windows tools are accessible via /mnt/c/
if [[ "$OSTYPE" == "linux-gnu" && -d "/mnt/c/Users" ]]; then
    # Extract Windows username from current working directory
    # PWD is like /mnt/c/Users/username/...
    CURRENT_PATH="$PWD"
    if [[ "$CURRENT_PATH" == /mnt/c/Users/* ]]; then
        # Remove prefix "/mnt/c/Users/"
        REMAINDER="${CURRENT_PATH#/mnt/c/Users/}"
        # Get first path component (username)
        WIN_USER="${REMAINDER%%/*}"
        WINGET_PATH="/mnt/c/Users/$WIN_USER/AppData/Local/Microsoft/WinGet/Links"
        if [[ -d "$WINGET_PATH" ]]; then
            export PATH="$PATH:$WINGET_PATH"
        fi
    fi
fi

# Git Bash PATH setup
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    WIN_USER=$(basename "$HOME")
    WINGET_PATHS=(
        "/c/Users/$WIN_USER/AppData/Local/Microsoft/WinGet/Links"
        "/c/ProgramData/chocolatey/bin"
    )
    for p in "${WINGET_PATHS[@]}"; do
        if [[ -d "$p" ]]; then
            export PATH="$PATH:$p"
        fi
    done
fi

# Cross-platform command wrappers for Windows .exe compatibility
# These ensure the script works in WSL, Git Bash, and native Linux
# WSL needs special handling: prefer .exe versions to connect to Windows clusters
find_cmd() {
    local cmd="$1"
    # In WSL working with Windows clusters, prefer .exe versions
    if [[ "$OSTYPE" == "linux-gnu" && -d "/mnt/c/Users" ]]; then
        if command -v "${cmd}.exe" &>/dev/null; then
            echo "${cmd}.exe"
            return
        fi
    fi
    # Default: prefer non-.exe, fall back to .exe
    if command -v "$cmd" &>/dev/null; then
        echo "$cmd"
    elif command -v "${cmd}.exe" &>/dev/null; then
        echo "${cmd}.exe"
    else
        echo "$cmd" # Fall back to original (will fail with useful error)
    fi
}

# Set up command aliases
KIND_CMD=$(find_cmd kind)
HELM_CMD=$(find_cmd helm)
KUBECTL_CMD=$(find_cmd kubectl)

# Configuration
NAMESPACE="${NAMESPACE:-scaledtest}"
RELEASE_NAME="${RELEASE_NAME:-scaledtest}"
LOCAL_REGISTRY="${LOCAL_REGISTRY:-localhost:5001}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@scaledtest.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin123!}"
PROJECT_NAME="${PROJECT_NAME:-ScaledTest}"

# API URLs (NodePort - no port-forward needed)
# Backend uses Connect-RPC which serves HTTP and gRPC on the same port
export SCALEDTEST_API_URL="${SCALEDTEST_API_URL:-http://localhost:30080}"
export SCALEDTEST_GRPC_URL="${SCALEDTEST_GRPC_URL:-localhost:30080}"

# Exit codes
BACKEND_EXIT_CODE=0
FRONTEND_EXIT_CODE=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================================
# Helper Functions
# ============================================================================

print_header() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}     ScaledTest - Kubernetes Test Runner                    ${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""
}

print_section() {
    echo ""
    echo -e "${YELLOW}▶ $1${NC}"
    echo "───────────────────────────────────────────────────────────"
}

print_success() {
    echo -e "  ${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "  ${RED}✗${NC} $1"
}

print_warning() {
    echo -e "  ${YELLOW}⚠${NC} $1"
}

# Find scaledtest CLI
find_cli() {
    # Prefer .exe on Windows/WSL for better compatibility
    if [[ -f "./backend/bin/scaledtest.exe" ]]; then
        CLI_BIN="./backend/bin/scaledtest.exe"
    elif [[ -f "./backend/bin/scaledtest" ]]; then
        CLI_BIN="./backend/bin/scaledtest"
    elif command -v scaledtest &> /dev/null; then
        CLI_BIN="scaledtest"
    else
        echo "Building scaledtest CLI..."
        (cd backend && go build -o bin/scaledtest ./cmd/scaledtest)
        CLI_BIN="./backend/bin/scaledtest"
    fi
    
    # Create CLI wrapper function that includes connection flags
    # This ensures the gRPC URL is always passed, regardless of environment variable propagation
    CLI="$CLI_BIN --grpc-url=${SCALEDTEST_GRPC_URL}"
    print_success "CLI: $CLI_BIN"
}

# ============================================================================
# Prerequisites Check
# ============================================================================

# Check for command, supporting Windows .exe extensions
check_cmd() {
    local cmd="$1"
    command -v "$cmd" &> /dev/null || command -v "${cmd}.exe" &> /dev/null
}

check_prerequisites() {
    print_section "Checking Prerequisites"
    
    local missing=()
    
    check_cmd docker && print_success "docker" || missing+=("docker")
    check_cmd kind && print_success "kind" || missing+=("kind")
    check_cmd kubectl && print_success "kubectl" || missing+=("kubectl")
    check_cmd helm && print_success "helm" || missing+=("helm")
    
    if [ ${#missing[@]} -ne 0 ]; then
        print_error "Missing required tools: ${missing[*]}"
        exit 1
    fi
    
    find_cli
}

# ============================================================================
# Infrastructure Setup
# ============================================================================

ensure_kind_cluster() {
    print_section "Ensuring Kind Cluster"
    
    if ! $KIND_CMD get clusters 2>/dev/null | grep -q "^scaledtest$"; then
        echo "Creating Kind cluster..."
        $KIND_CMD create cluster --config ./deploy/k8s/kind-cluster-config.yaml
        # Connect registry to kind network
        docker network connect kind scaledtest-registry 2>/dev/null || true
    fi
    print_success "Kind cluster 'scaledtest' exists"
    
    # Set kubectl context
    $KUBECTL_CMD config use-context kind-scaledtest &>/dev/null || true
    
    # Verify connection
    if ! $KUBECTL_CMD cluster-info &>/dev/null; then
        print_error "Cannot connect to cluster"
        exit 1
    fi
    print_success "kubectl connected"
}

ensure_registry() {
    print_section "Ensuring Local Registry"
    
    if ! docker ps --filter "name=scaledtest-registry" --format "{{.Names}}" | grep -q "scaledtest-registry"; then
        echo "Starting local registry..."
        docker run -d --restart=always -p 5001:5000 --network kind --name scaledtest-registry registry:2 || true
        sleep 2
    fi
    print_success "Registry running at ${LOCAL_REGISTRY}"
}

ensure_ingress_controller() {
    print_section "Ensuring Ingress Controller"
    
    # Check if ingress-nginx is already installed
    if $KUBECTL_CMD get namespace ingress-nginx &>/dev/null && \
       $KUBECTL_CMD get deployment -n ingress-nginx ingress-nginx-controller &>/dev/null; then
        print_success "Ingress controller already installed"
    else
        echo "Installing nginx-ingress controller for Kind..."
        $KUBECTL_CMD apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.12.0/deploy/static/provider/kind/deploy.yaml
        
        echo "Waiting for ingress controller to be ready..."
        $KUBECTL_CMD wait --namespace ingress-nginx \
            --for=condition=ready pod \
            --selector=app.kubernetes.io/component=controller \
            --timeout=120s || {
            print_error "Ingress controller failed to start"
            $KUBECTL_CMD get pods -n ingress-nginx
            exit 1
        }
        print_success "Ingress controller ready"
    fi
}

# ============================================================================
# Build Images
# ============================================================================

build_images() {
    print_section "Building Docker Images"
    
    echo "Building backend..."
    docker build -t ${LOCAL_REGISTRY}/scaledtest-backend:dev ./backend -f ./backend/Dockerfile
    docker push ${LOCAL_REGISTRY}/scaledtest-backend:dev
    print_success "Backend image pushed"
    
    echo "Building frontend..."
    docker build -t ${LOCAL_REGISTRY}/scaledtest-frontend:dev ./frontend -f ./frontend/Dockerfile
    docker push ${LOCAL_REGISTRY}/scaledtest-frontend:dev
    print_success "Frontend image pushed"
    
    echo "Building Playwright test runner..."
    docker build -t ${LOCAL_REGISTRY}/scaledtest-playwright:dev . -f ./containers/base-images/playwright-runner/Dockerfile
    docker push ${LOCAL_REGISTRY}/scaledtest-playwright:dev
    print_success "Playwright runner image pushed"
}

# ============================================================================
# Deploy Services
# ============================================================================

deploy_services() {   
    print_section "Deploying Services with Helm"
    
    # Ensure namespace exists
    $KUBECTL_CMD create namespace "$NAMESPACE" 2>/dev/null || true
    
    # Update helm dependencies only if missing
    if [[ ! -d "./deploy/helm/scaledtest/charts" ]]; then
        echo "Updating Helm dependencies..."
        (cd deploy/helm/scaledtest && $HELM_CMD dependency update)
    fi
    
    # Deploy or upgrade - don't use --wait here, we'll wait after rollout restart
    if $HELM_CMD status "$RELEASE_NAME" -n "$NAMESPACE" &>/dev/null; then
        echo "Upgrading release (this is fast, pods restart separately)..."
        $HELM_CMD upgrade "$RELEASE_NAME" ./deploy/helm/scaledtest \
            -n "$NAMESPACE" \
            -f ./deploy/helm/scaledtest/values-dev.yaml \
            --timeout 2m
        
        # Force restart to pick up new images from registry
        # imagePullPolicy: Always in dev means new images are pulled
        echo "Restarting deployments to pick up new images..."
        $KUBECTL_CMD rollout restart deployment -n "$NAMESPACE" scaledtest-backend scaledtest-frontend 2>/dev/null || true
    else
        echo "Installing new release..."
        $HELM_CMD install "$RELEASE_NAME" ./deploy/helm/scaledtest \
            -n "$NAMESPACE" \
            -f ./deploy/helm/scaledtest/values-dev.yaml \
            --wait --timeout 3m
    fi
    
    print_success "Helm deployment initiated"
}

wait_for_services() {
    print_section "Waiting for Services"
    
    # Wait for backend rollout specifically (most important)
    echo "Waiting for backend rollout..."
    $KUBECTL_CMD rollout status deployment/scaledtest-backend -n "$NAMESPACE" --timeout=90s || {
        print_error "Backend rollout failed"
        $KUBECTL_CMD describe deployment/scaledtest-backend -n "$NAMESPACE" | tail -20
        exit 1
    }
    
    echo "Waiting for frontend rollout..."
    $KUBECTL_CMD rollout status deployment/scaledtest-frontend -n "$NAMESPACE" --timeout=60s || true
    
    # Wait for ingress to be ready
    echo "Waiting for ingress..."
    $KUBECTL_CMD wait --namespace "$NAMESPACE" \
        --for=jsonpath='{.status.loadBalancer.ingress}' ingress/scaledtest \
        --timeout=60s 2>/dev/null || true
    
    # Check backend health via ingress (primary) then NodePort (fallback)
    echo "Checking backend health..."
    local retries=30
    local health_url=""
    while [ $retries -gt 0 ]; do
        # Try ingress first (http://localhost/health)
        if curl -s http://localhost/health 2>/dev/null | grep -q "healthy"; then
            health_url="http://localhost"
            print_success "Backend healthy via ingress"
            break
        fi
        # Fallback to NodePort
        if curl -s http://localhost:30080/health 2>/dev/null | grep -q "healthy"; then
            health_url="http://localhost:30080"
            print_success "Backend healthy via NodePort"
            break
        fi
        echo -n "."
        sleep 1
        retries=$((retries - 1))
    done
    echo ""
    
    if [ $retries -eq 0 ]; then
        print_error "Backend health check failed"
        echo "Checking ingress status:"
        $KUBECTL_CMD get ingress -n "$NAMESPACE" -o wide
        echo "Checking backend logs:"
        $KUBECTL_CMD logs -n "$NAMESPACE" -l app.kubernetes.io/component=backend --tail=30
        exit 1
    fi
    
    # CLI always uses NodePort because Connect/gRPC protocol requires special ingress config
    # Frontend (which uses JSON over HTTP) works fine via ingress
    # For CLI commands, always use NodePort for reliability
    export SCALEDTEST_API_URL="http://localhost:30080"
    export SCALEDTEST_GRPC_URL="localhost:30080"
    
    if [ "$health_url" = "http://localhost" ]; then
        print_success "Ingress healthy at http://localhost (frontend access)"
    fi
    print_success "CLI using NodePort at http://localhost:30080"
    
    print_success "All services ready"
}

# ============================================================================
# Platform Setup (via CLI)
# ============================================================================

setup_platform() {
    print_section "Setting up Platform (via CLI)"
    
    # Login or register and capture token
    echo "Authenticating..."
    local login_output
    if login_output=$($CLI auth login --email "$ADMIN_EMAIL" --password "$ADMIN_PASSWORD" -o json 2>&1); then
        # Extract token from JSON output for subsequent commands
        # The keyring doesn't work well across WSL/Windows boundary
        export SCALEDTEST_TOKEN=$(echo "$login_output" | jq -r '.token // empty' 2>/dev/null)
    else
        echo "Creating admin user..."
        $CLI auth signup --email "$ADMIN_EMAIL" --password "$ADMIN_PASSWORD" --name "Admin User" 2>/dev/null || true
        if login_output=$($CLI auth login --email "$ADMIN_EMAIL" --password "$ADMIN_PASSWORD" -o json 2>&1); then
            export SCALEDTEST_TOKEN=$(echo "$login_output" | jq -r '.token // empty' 2>/dev/null)
        else
            print_error "Failed to authenticate"
            exit 1
        fi
    fi
    
    # Verify we have a token
    if [ -z "$SCALEDTEST_TOKEN" ]; then
        print_error "Failed to get authentication token"
        echo "Login output: $login_output"
        exit 1
    fi
    print_success "Authenticated as $ADMIN_EMAIL"
    
    # Get or create project
    echo "Setting up project: $PROJECT_NAME"
    local project_json
    project_json=$($CLI project list -o json 2>/dev/null) || project_json="{}"
    
    # Handle both array and object responses (API returns {projects: [...]} or [...])
    # Try to extract from .projects first, then fall back to direct array
    PROJECT_ID=$(echo "$project_json" | jq -r "(.projects // .)[] | select(.name == \"$PROJECT_NAME\") | .id // empty" 2>/dev/null | head -1)
    
    if [ -z "$PROJECT_ID" ]; then
        echo "Creating project..."
        local create_output
        if create_output=$($CLI project create "$PROJECT_NAME" --description "ScaledTest self-testing" -o json 2>&1); then
            PROJECT_ID=$(echo "$create_output" | jq -r '.id // .project_id // empty' 2>/dev/null || echo "")
        else
            # Project might already exist with different casing, re-check
            project_json=$($CLI project list -o json 2>/dev/null) || project_json="{}"
            PROJECT_ID=$(echo "$project_json" | jq -r "(.projects // .)[] | select(.name == \"$PROJECT_NAME\") | .id // empty" 2>/dev/null | head -1)
        fi
    fi
    
    if [ -z "$PROJECT_ID" ]; then
        print_error "Could not get or create project"
        echo "Debug: project list output: $project_json"
        exit 1
    fi
    print_success "Project: $PROJECT_NAME ($PROJECT_ID)"
    
    # Configure Kind cluster for the project
    echo "Configuring K8s cluster..."
    local clusters
    clusters=$($CLI cluster list --project-id "$PROJECT_ID" -o json 2>/dev/null) || clusters="{}"
    
    # Handle both array and object responses (API returns {clusters: [...]} or [...])
    CLUSTER_ID=$(echo "$clusters" | jq -r "(.clusters // .)[] | select(.name == \"kind-scaledtest\") | .id // empty" 2>/dev/null | head -1)
    
    if [ -z "$CLUSTER_ID" ]; then
        echo "Adding Kind cluster to project..."
        # Use in-cluster auth - the backend runs inside Kind and can use its service account
        local cluster_output
        if cluster_output=$($CLI cluster add kind-scaledtest \
            --project-id "$PROJECT_ID" \
            --namespace "$NAMESPACE" \
            --auth-type in-cluster \
            --default \
            -o json 2>&1); then
            CLUSTER_ID=$(echo "$cluster_output" | jq -r '.id // empty' 2>/dev/null || echo "")
        else
            # Cluster might already exist, re-check
            clusters=$($CLI cluster list --project-id "$PROJECT_ID" -o json 2>/dev/null) || clusters="{}"
            CLUSTER_ID=$(echo "$clusters" | jq -r "(.clusters // .)[] | select(.name == \"kind-scaledtest\") | .id // empty" 2>/dev/null | head -1)
        fi
    fi
    
    if [ -z "$CLUSTER_ID" ]; then
        print_warning "Could not configure cluster - will try test run anyway"
    else
        print_success "K8s cluster: kind-scaledtest ($CLUSTER_ID)"
        
        # Configure the runner settings
        echo "Configuring runner settings..."
        # Platform API URL should be accessible from within the cluster
        # Use the K8s service DNS name for in-cluster communication
        if $CLI cluster update-runner "$CLUSTER_ID" \
            --platform-api-url "http://scaledtest-backend.${NAMESPACE}.svc.cluster.local:8080" \
            --default-base-url "http://scaledtest-frontend.${NAMESPACE}.svc.cluster.local:80" \
            --default-timeout 600 \
            --default-parallelism 2 \
            --image-pull-policy "IfNotPresent" \
            2>/dev/null; then
            print_success "Runner settings configured"
        else
            print_warning "Could not configure runner settings (may already be set)"
        fi
    fi
}

# ============================================================================
# Backend Tests (Local)
# ============================================================================

run_backend_tests() {  
    print_section "Running Backend Tests (Local)"
    
    if ! command -v go &>/dev/null; then
        print_warning "Go not found, skipping backend tests"
        return 0
    fi
    
    pushd backend > /dev/null
    set +e
    go test ./... -v -short
    BACKEND_EXIT_CODE=$?
    set -e
    popd > /dev/null
    
    if [ $BACKEND_EXIT_CODE -eq 0 ]; then
        print_success "Backend tests passed"
    else
        print_error "Backend tests failed"
    fi
}

# ============================================================================
# Frontend Tests (via K8s - dogfooding)
# ============================================================================

run_frontend_tests() {   
    print_section "Running Frontend Tests (via K8s)"
    
    # Verify we have a project ID
    if [ -z "$PROJECT_ID" ]; then
        print_error "No project ID - cannot run tests"
        FRONTEND_EXIT_CODE=1
        return 1
    fi
    
    # Use direct image reference - no registry setup needed
    # The image should be accessible to the Kind cluster via:
    # 1. Local registry (localhost:5001)
    # 2. Pre-loaded with `kind load docker-image`
    local test_image="${LOCAL_REGISTRY}/scaledtest-playwright:dev"
    
    echo "Running tests with image: $test_image"
    echo "Project ID: $PROJECT_ID"
    
    # Trigger test run in K8s using direct image reference (no --wait, streaming not implemented)
    set +e
    local test_output
    test_output=$($CLI test run \
        --project-id "$PROJECT_ID" \
        --image "$test_image" \
        --parallelism 3 \
        --timeout 600 \
        -o json 2>&1)
    local trigger_exit=$?
    set -e
    
    if [ $trigger_exit -ne 0 ]; then
        print_error "Failed to trigger tests"
        echo "$test_output"
        FRONTEND_EXIT_CODE=1
        return 1
    fi
    
    local job_name=$(echo "$test_output" | jq -r '.k8s_job_name // empty')
    if [ -z "$job_name" ]; then
        print_error "No job name in response"
        echo "$test_output"
        FRONTEND_EXIT_CODE=1
        return 1
    fi
    
    print_success "Tests triggered successfully"
    echo "  Job Name: $job_name"
    
    # Poll for test completion (streaming not implemented yet)
    echo "Waiting for test completion..."
    local max_wait=600  # 10 minutes
    local elapsed=0
    local poll_interval=10
    
    while [ $elapsed -lt $max_wait ]; do
        local status_output
        status_output=$($CLI test status "$job_name" --project-id "$PROJECT_ID" -o json 2>/dev/null) || true
        
        local pending=$(echo "$status_output" | jq -r '.stats.pending // 0')
        local running=$(echo "$status_output" | jq -r '.stats.running // 0')
        local succeeded=$(echo "$status_output" | jq -r '.stats.succeeded // 0')
        local failed=$(echo "$status_output" | jq -r '.stats.failed // 0')
        
        echo "  Status: pending=$pending, running=$running, succeeded=$succeeded, failed=$failed"
        
        # All tests done?
        if [ "$pending" = "0" ] && [ "$running" = "0" ] && [ $((succeeded + failed)) -gt 0 ]; then
            if [ "$failed" = "0" ]; then
                FRONTEND_EXIT_CODE=0
                print_success "All $succeeded tests passed"
            else
                FRONTEND_EXIT_CODE=1
                print_error "$failed tests failed, $succeeded passed"
            fi
            return $FRONTEND_EXIT_CODE
        fi
        
        sleep $poll_interval
        elapsed=$((elapsed + poll_interval))
    done
    
    print_error "Test execution timed out after ${max_wait}s"
    FRONTEND_EXIT_CODE=1
}

# ============================================================================
# Summary
# ============================================================================

print_summary() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}                        Summary                             ${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "  Namespace: ${NAMESPACE}"
    echo "  Release:   ${RELEASE_NAME}"
    echo "  API URL:   ${SCALEDTEST_API_URL}"
    echo ""
    
    if [ $BACKEND_EXIT_CODE -eq 0 ]; then
        echo -e "  Backend Tests:  ${GREEN}✓ Passed${NC}"
    else
        echo -e "  Backend Tests:  ${RED}✗ Failed${NC}"
    fi
    
    if [ $FRONTEND_EXIT_CODE -eq 0 ]; then
        echo -e "  Frontend Tests: ${GREEN}✓ Passed${NC}"
    else
        echo -e "  Frontend Tests: ${RED}✗ Failed${NC}"
    fi
    
    echo ""
    
    local total_exit=$((BACKEND_EXIT_CODE + FRONTEND_EXIT_CODE))
    if [ $total_exit -eq 0 ]; then
        echo -e "${GREEN}✓ All tests completed successfully${NC}"
    else
        echo -e "${RED}✗ Some tests failed${NC}"
    fi
    
    return $total_exit
}

# ============================================================================
# Main
# ============================================================================

main() {
    print_header
    check_prerequisites
    ensure_registry
    ensure_kind_cluster
    ensure_ingress_controller
    build_images
    deploy_services
    wait_for_services
    setup_platform
    run_backend_tests
    run_frontend_tests
    print_summary
    
    exit $((BACKEND_EXIT_CODE + FRONTEND_EXIT_CODE))
}

main "$@"
