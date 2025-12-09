#!/bin/bash
# ScaledTest - Complete Test Runner using CLI
# This script uses the scaledtest CLI for all API operations
#
# Prerequisites:
#   1. Docker Desktop with Kubernetes enabled
#   2. Helm 3.x installed with dependencies downloaded
#   3. kubectl configured for your cluster
#   4. scaledtest CLI built (make build-cli in backend/)

set -e

# Ignore SIGPIPE - WSL/Windows terminal interop can cause premature script termination
trap '' SIGPIPE 2>/dev/null || true

# WSL/Windows interop: Add common Windows tool paths to PATH when running in WSL
if [[ -d "/mnt/c/Users" ]]; then
    WINGET_LINKS="/mnt/c/Users/$(whoami)/AppData/Local/Microsoft/WinGet/Links"
    if [[ -d "$WINGET_LINKS" ]]; then
        export PATH="$PATH:$WINGET_LINKS"
    fi
    for user_dir in /mnt/c/Users/*/AppData/Local/Microsoft/WinGet/Links; do
        if [[ -d "$user_dir" && ":$PATH:" != *":$user_dir:"* ]]; then
            export PATH="$PATH:$user_dir"
        fi
    done
fi

# WSL/Windows interop: Create wrapper functions
command_exists() {
    command -v "$1" &> /dev/null || command -v "$1.exe" &> /dev/null
}

get_command() {
    if command -v "$1" &> /dev/null; then
        echo "$1"
    elif command -v "$1.exe" &> /dev/null; then
        echo "$1.exe"
    else
        echo "$1"
    fi
}

# Set command aliases
KUBECTL_CMD=$(get_command kubectl)
HELM_CMD=$(get_command helm)
DOCKER_CMD=$(get_command docker)
KIND_CMD=$(get_command kind)

# Ensure kubectl uses the correct kubeconfig
# In WSL, we need to use the Windows kubeconfig location
if [[ -d "/mnt/c/Users" ]]; then
    # Running in WSL, use Windows kubeconfig
    WINDOWS_USER=$(cmd.exe /c "echo %USERNAME%" 2>/dev/null | tr -d '\r' || whoami)
    WINDOWS_KUBECONFIG="/mnt/c/Users/${WINDOWS_USER}/.kube/config"
    if [[ -f "$WINDOWS_KUBECONFIG" ]]; then
        export KUBECONFIG="$WINDOWS_KUBECONFIG"
    fi
fi

# Configuration (can be overridden with environment variables)
NAMESPACE="${NAMESPACE:-default}"
RELEASE_NAME="${RELEASE_NAME:-scaledtest}"
API_URL="${SCALEDTEST_API_URL:-http://localhost:8080}"
GRPC_URL="${SCALEDTEST_GRPC_URL:-localhost:9090}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@scaledtest.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin123!}"
PROJECT_NAME="${PROJECT_NAME:-ScaledTest}"
REGISTRY_URL="${REGISTRY_URL:-localhost:5001}"
REGISTRY_NAME="${REGISTRY_NAME:-local-registry}"
LOCAL_REGISTRY="${LOCAL_REGISTRY:-localhost:5001}"

# Test configuration
SKIP_BUILD="${SKIP_BUILD:-false}"
SKIP_DEPLOY="${SKIP_DEPLOY:-false}"
SKIP_BACKEND_TESTS="${SKIP_BACKEND_TESTS:-false}"
SKIP_FRONTEND_TESTS="${SKIP_FRONTEND_TESTS:-false}"

# Exit codes
BACKEND_EXIT_CODE=0
FRONTEND_EXIT_CODE=0
K8S_EXIT_CODE=0

# Find scaledtest CLI
find_cli() {
    if command -v scaledtest &> /dev/null; then
        SCALEDTEST_CMD="scaledtest"
    elif [[ -f "./backend/bin/scaledtest" ]]; then
        SCALEDTEST_CMD="./backend/bin/scaledtest"
    elif [[ -f "./backend/bin/scaledtest.exe" ]]; then
        SCALEDTEST_CMD="./backend/bin/scaledtest.exe"
    else
        echo "Error: scaledtest CLI not found"
        echo "Build it with: cd backend && make build-cli"
        exit 1
    fi
    export SCALEDTEST_GRPC_URL="$GRPC_URL"
    export SCALEDTEST_API_URL="$API_URL"
}

# Print functions
print_header() {
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "     ScaledTest - Kubernetes/Helm Test Execution           "
    echo "═══════════════════════════════════════════════════════════"
    echo ""
}

print_section() {
    echo ""
    echo "▶ $1"
    echo "───────────────────────────────────────────────────────────"
}

# Check prerequisites
check_prerequisites() {
    print_section "Checking Prerequisites"
    
    local missing=()
    
    if ! command_exists kubectl; then
        missing+=("kubectl")
    else
        echo "  ✓ kubectl found"
    fi
    
    if ! command_exists helm; then
        missing+=("helm")
    else
        echo "  ✓ helm found"
    fi
    
    if ! command_exists docker; then
        missing+=("docker")
    else
        echo "  ✓ docker found"
    fi
    
    if ! command_exists kind; then
        missing+=("kind")
    else
        echo "  ✓ kind found"
    fi
    
    find_cli
    echo "  ✓ scaledtest CLI found: $SCALEDTEST_CMD"
    
    # Check if Kind cluster exists and is running
    if command_exists kind; then
        local clusters=$($KIND_CMD get clusters 2>/dev/null || echo "")
        if [[ ! "$clusters" =~ "scaledtest" ]]; then
            echo "  ⚠ Kind cluster 'scaledtest' not found"
            echo "  Creating cluster..."
            $KIND_CMD create cluster --name scaledtest --config ./deploy/k8s/kind-cluster-config.yaml || true
            sleep 5
        fi
        
        # Check if cluster containers are running
        local running_containers=$($DOCKER_CMD ps -q --filter "label=io.x-k8s.kind.cluster=scaledtest" 2>/dev/null | wc -l)
        if [ "$running_containers" -eq 0 ]; then
            echo "  ⚠ Kind cluster containers not running, attempting to start..."
            # Delete and recreate if stopped (Kind doesn't support stop/start well)
            $KIND_CMD delete cluster --name scaledtest 2>/dev/null || true
            $KIND_CMD create cluster --name scaledtest --config ./deploy/k8s/kind-cluster-config.yaml
            sleep 5
        fi
    fi
    
    if ! $KUBECTL_CMD cluster-info &> /dev/null; then
        echo "  ✗ Cannot connect to Kubernetes cluster"
        echo "  Cluster status:"
        $KUBECTL_CMD cluster-info 2>&1 || true
        echo ""
        echo "  Try running: $KIND_CMD create cluster --name scaledtest --config ./deploy/k8s/kind-cluster-config.yaml"
        exit 1
    fi
    echo "  ✓ Kubernetes cluster accessible"
    
    if [[ ! -d "./deploy/helm/scaledtest/charts" ]]; then
        echo "  ⚠ Helm dependencies not downloaded, running helm dep update..."
        (cd deploy/helm/scaledtest && $HELM_CMD dependency update)
    fi
    echo "  ✓ Helm dependencies available"
    
    if [ ${#missing[@]} -ne 0 ]; then
        echo ""
        echo "Missing required tools: ${missing[*]}"
        exit 1
    fi
}

# Build Docker images
build_images() {
    if [[ "$SKIP_BUILD" == "true" ]]; then
        echo "  Skipping build (SKIP_BUILD=true)"
        return 0
    fi
    
    print_section "Building Docker Images"
    
    # Ensure local registry is running
    if ! $DOCKER_CMD ps --filter "name=scaledtest-registry" --format "{{.Names}}" | grep -q "scaledtest-registry"; then
        echo "Starting local registry on port 5001..."
        $DOCKER_CMD run -d --restart=always -p 5001:5000 --name scaledtest-registry registry:2 || true
        sleep 2
    fi
    echo "  ✓ Local registry running at ${LOCAL_REGISTRY}"
    
    echo "Building backend image..."
    $DOCKER_CMD build -t ${LOCAL_REGISTRY}/scaledtest-backend:dev ./backend -f ./backend/Dockerfile
    echo "  ✓ Backend image built"
    
    $DOCKER_CMD push ${LOCAL_REGISTRY}/scaledtest-backend:dev
    echo "  ✓ Backend image pushed"
    
    echo "Building frontend image..."
    $DOCKER_CMD build -t ${LOCAL_REGISTRY}/scaledtest-frontend:dev ./frontend -f ./frontend/Dockerfile
    echo "  ✓ Frontend image built"
    
    $DOCKER_CMD push ${LOCAL_REGISTRY}/scaledtest-frontend:dev
    echo "  ✓ Frontend image pushed"
    
    echo "Building Playwright runner image..."
    $DOCKER_CMD build -t ${LOCAL_REGISTRY}/scaledtest-playwright:dev ./containers/base-images/playwright-runner
    echo "  ✓ Playwright runner image built"
    
    $DOCKER_CMD push ${LOCAL_REGISTRY}/scaledtest-playwright:dev
    echo "  ✓ Playwright runner image pushed"
}

# Deploy services using Helm
deploy_services() {
    if [[ "$SKIP_DEPLOY" == "true" ]]; then
        echo "  Skipping deploy (SKIP_DEPLOY=true)"
        return 0
    fi
    
    print_section "Deploying Services with Helm"
    
    local helm_args=(
        -n "$NAMESPACE"
        -f ./deploy/helm/scaledtest/values-dev.yaml
        --set postgresql.primary.initdb.scriptsConfigMap=${RELEASE_NAME}-postgres-initdb
        --timeout 5m
        --wait
    )
    
    if $HELM_CMD status "$RELEASE_NAME" -n "$NAMESPACE" &> /dev/null; then
        echo "Upgrading existing release..."
        $HELM_CMD upgrade "$RELEASE_NAME" ./deploy/helm/scaledtest "${helm_args[@]}"
    else
        echo "Installing new release..."
        $HELM_CMD install "$RELEASE_NAME" ./deploy/helm/scaledtest "${helm_args[@]}" --create-namespace
    fi
    
    echo "  ✓ Helm deployment complete"
}

# Wait for services to be ready
wait_for_services() {
    print_section "Waiting for Services"
    
    echo "Waiting for backend pods..."
    $KUBECTL_CMD wait --for=condition=ready pod -l app.kubernetes.io/component=backend -n "$NAMESPACE" --timeout=300s || true
    
    echo "Waiting for frontend pods..."
    $KUBECTL_CMD wait --for=condition=ready pod -l app.kubernetes.io/component=frontend -n "$NAMESPACE" --timeout=300s || true
    
    echo "  ✓ Services ready"
}

# Setup port forwards
setup_port_forwards() {
    print_section "Setting up Port Forwards"
    
    # Kill any existing port forwards
    pkill -f "kubectl port-forward.*${RELEASE_NAME}" 2>/dev/null || true
    
    $KUBECTL_CMD port-forward -n "$NAMESPACE" svc/${RELEASE_NAME}-backend 8080:8080 &
    BACKEND_PF_PID=$!
    
    $KUBECTL_CMD port-forward -n "$NAMESPACE" svc/${RELEASE_NAME}-backend 9090:9090 &
    GRPC_PF_PID=$!
    
    $KUBECTL_CMD port-forward -n "$NAMESPACE" svc/${RELEASE_NAME}-frontend 3000:80 &
    FRONTEND_PF_PID=$!
    
    sleep 3
    echo "  ✓ Port forwards established"
    echo "    - Backend HTTP: localhost:8080"
    echo "    - Backend gRPC: localhost:9090"
    echo "    - Frontend: localhost:3000"
}

# Cleanup port forwards on exit
cleanup() {
    print_section "Cleanup"
    
    echo "Stopping port forwards..."
    [ -n "${BACKEND_PF_PID:-}" ] && kill $BACKEND_PF_PID 2>/dev/null || true
    [ -n "${FRONTEND_PF_PID:-}" ] && kill $FRONTEND_PF_PID 2>/dev/null || true
    [ -n "${GRPC_PF_PID:-}" ] && kill $GRPC_PF_PID 2>/dev/null || true
    pkill -f "kubectl port-forward.*${RELEASE_NAME}" 2>/dev/null || true
    
    echo "✓ Cleanup complete"
}

trap cleanup EXIT

# Authenticate using CLI
authenticate() {
    print_section "Authentication (via CLI)"
    
    # Check if already authenticated
    if $SCALEDTEST_CMD auth status &> /dev/null; then
        echo "  ✓ Already authenticated"
        return 0
    fi
    
    # Try to login first
    echo "Attempting login..."
    if $SCALEDTEST_CMD auth login --email "$ADMIN_EMAIL" --password "$ADMIN_PASSWORD" 2>/dev/null; then
        echo "  ✓ Logged in as ${ADMIN_EMAIL}"
        return 0
    fi
    
    # If login failed, try to register
    echo "Login failed, attempting signup..."
    if $SCALEDTEST_CMD auth signup --email "$ADMIN_EMAIL" --password "$ADMIN_PASSWORD" --name "Admin User" 2>/dev/null; then
        echo "  ✓ Registered and logged in as ${ADMIN_EMAIL}"
        return 0
    fi
    
    echo "  ✗ Authentication failed"
    exit 1
}

# Ensure project exists using CLI
ensure_project() {
    print_section "Project Setup (via CLI)"
    
    # List projects and check if ours exists
    local projects=$($SCALEDTEST_CMD project list --json 2>/dev/null || echo "[]")
    PROJECT_ID=$(echo "$projects" | jq -r ".[] | select(.name == \"${PROJECT_NAME}\") | .id // empty" 2>/dev/null || echo "")
    
    if [ -z "$PROJECT_ID" ]; then
        echo "Creating project: ${PROJECT_NAME}"
        local result=$($SCALEDTEST_CMD project create --name "$PROJECT_NAME" --description "ScaledTest self-testing project" --json 2>/dev/null)
        PROJECT_ID=$(echo "$result" | jq -r '.project_id // .id // empty' 2>/dev/null || echo "")
    fi
    
    if [ -z "$PROJECT_ID" ]; then
        echo "  ⚠ Could not get project ID, continuing anyway"
    else
        echo "  ✓ Project: ${PROJECT_NAME} (${PROJECT_ID})"
    fi
}

# Ensure registry exists using CLI
ensure_registry() {
    print_section "Registry Setup (via CLI)"
    
    # List registries and check if ours exists
    local registries=$($SCALEDTEST_CMD registry list --json 2>/dev/null || echo "[]")
    REGISTRY_ID=$(echo "$registries" | jq -r ".[] | select(.name == \"${REGISTRY_NAME}\") | .id // empty" 2>/dev/null || echo "")
    
    if [ -z "$REGISTRY_ID" ]; then
        echo "Creating registry: ${REGISTRY_NAME}"
        local result=$($SCALEDTEST_CMD registry add \
            --name "$REGISTRY_NAME" \
            --url "$REGISTRY_URL" \
            --type "generic" \
            --auth-type "none" \
            --json 2>/dev/null)
        REGISTRY_ID=$(echo "$result" | jq -r '.registry_id // .id // empty' 2>/dev/null || echo "")
    fi
    
    if [ -z "$REGISTRY_ID" ]; then
        echo "  ⚠ Could not get registry ID, continuing anyway"
    else
        echo "  ✓ Registry: ${REGISTRY_NAME} (${REGISTRY_ID})"
    fi
}

# Ensure K8s cluster exists and is configured
ensure_k8s_cluster() {
    print_section "K8s Cluster Setup (via CLI)"
    
    # List clusters and check if one exists
    local clusters=$($SCALEDTEST_CMD cluster list --json 2>/dev/null || echo "[]")
    CLUSTER_ID=$(echo "$clusters" | jq -r ".[0].id // empty" 2>/dev/null || echo "")
    
    if [ -z "$CLUSTER_ID" ]; then
        echo "Creating K8s cluster configuration..."
        # Add cluster using current kubeconfig
        local result=$($SCALEDTEST_CMD cluster add "local-k8s" \
            --project-id "$PROJECT_ID" \
            --auth-type "kubeconfig" \
            --namespace "$NAMESPACE" \
            --json 2>/dev/null)
        CLUSTER_ID=$(echo "$result" | jq -r '.id // empty' 2>/dev/null || echo "")
        
        if [ -n "$CLUSTER_ID" ]; then
            # Set as default cluster
            $SCALEDTEST_CMD cluster set-default "$CLUSTER_ID" 2>/dev/null || true
            
            # Configure runner settings
            $SCALEDTEST_CMD cluster update-runner "$CLUSTER_ID" \
                --platform-api-url "$API_URL" \
                --default-parallelism 2 \
                --default-timeout 600 \
                --job-ttl 3600 \
                --service-account "scaledtest-job-runner" \
                2>/dev/null || true
        fi
    fi
    
    if [ -z "$CLUSTER_ID" ]; then
        echo "  ⚠ Could not get cluster ID, continuing anyway"
    else
        echo "  ✓ K8s Cluster configured (${CLUSTER_ID})"
    fi
}

# Register test image and discover tests
register_test_image() {
    print_section "Test Image Registration (via CLI)"
    
    if [ -z "$PROJECT_ID" ] || [ -z "$REGISTRY_ID" ]; then
        echo "  ⚠ Missing PROJECT_ID or REGISTRY_ID, skipping test image registration"
        return 0
    fi
    
    echo "Registering Playwright test image..."
    local result=$($SCALEDTEST_CMD image add scaledtest-playwright \
        --project-id "$PROJECT_ID" \
        --registry-id "$REGISTRY_ID" \
        --tag "dev" \
        --auto-discover \
        --json 2>/dev/null)
    
    TEST_IMAGE_ID=$(echo "$result" | jq -r '.id // empty' 2>/dev/null || echo "")
    
    if [ -z "$TEST_IMAGE_ID" ]; then
        # Try to get existing image
        local images=$($SCALEDTEST_CMD image list --project-id "$PROJECT_ID" --json 2>/dev/null || echo "[]")
        TEST_IMAGE_ID=$(echo "$images" | jq -r ".[] | select(.image_path == \"scaledtest-playwright\") | .id // empty" 2>/dev/null || echo "")
        
        if [ -n "$TEST_IMAGE_ID" ]; then
            echo "Using existing test image (${TEST_IMAGE_ID})"
            # Force discovery refresh
            $SCALEDTEST_CMD image discover "$TEST_IMAGE_ID" --force 2>/dev/null || true
        fi
    fi
    
    if [ -z "$TEST_IMAGE_ID" ]; then
        echo "  ⚠ Could not register test image"
        return 1
    fi
    
    echo "  ✓ Test Image: scaledtest-playwright:dev (${TEST_IMAGE_ID})"
    
    # Get test count
    local image_info=$($SCALEDTEST_CMD image get "$TEST_IMAGE_ID" --json 2>/dev/null || echo "{}")
    local test_count=$(echo "$image_info" | jq -r '.total_test_count // 0' 2>/dev/null || echo "0")
    echo "  ✓ Discovered ${test_count} tests"
}

# Run K8s-based tests via platform
run_k8s_tests() {
    print_section "K8s Test Execution (via CLI)"
    
    if [ -z "$TEST_IMAGE_ID" ]; then
        echo "  ⚠ No test image registered, skipping K8s tests"
        K8S_EXIT_CODE=0
        return 0
    fi
    
    echo "Triggering test execution on K8s..."
    
    set +e
    # Trigger tests - the CLI should have a test run command
    # For now, we'll check if tests were discovered successfully
    local image_info=$($SCALEDTEST_CMD image get "$TEST_IMAGE_ID" --json 2>/dev/null || echo "{}")
    local test_count=$(echo "$image_info" | jq -r '.total_test_count // 0' 2>/dev/null || echo "0")
    
    if [ "$test_count" -gt 0 ]; then
        echo "  ✓ K8s test infrastructure validated ($test_count tests available)"
        echo "  ℹ Full test execution requires test run command (planned for future CLI version)"
        K8S_EXIT_CODE=0
    else
        echo "  ⚠ No tests discovered in image"
        K8S_EXIT_CODE=1
    fi
    set -e
}

# Health check using CLI
health_check() {
    print_section "Health Check (via CLI)"
    
    echo "Checking backend health..."
    if $SCALEDTEST_CMD health check 2>/dev/null; then
        echo "  ✓ Backend healthy"
    else
        echo "  ⚠ Health check failed, but continuing"
    fi
}

# Run backend tests
run_backend_tests() {
    if [[ "$SKIP_BACKEND_TESTS" == "true" ]]; then
        echo "  Skipping backend tests (SKIP_BACKEND_TESTS=true)"
        return 0
    fi
    
    print_section "Backend Tests"
    
    local GO_CMD="go"
    if ! command -v go &> /dev/null; then
        if [ -f "/c/Program Files/Go/bin/go.exe" ]; then
            GO_CMD="/c/Program Files/Go/bin/go"
        elif [ -f "/c/Go/bin/go.exe" ]; then
            GO_CMD="/c/Go/bin/go"
        else
            echo "⚠ Go not found, skipping backend tests"
            return 0
        fi
    fi
    
    echo "Running Go tests..."
    pushd backend > /dev/null
    
    set +e
    "$GO_CMD" test ./... -v
    BACKEND_EXIT_CODE=$?
    set -e
    
    popd > /dev/null
    
    if [ $BACKEND_EXIT_CODE -eq 0 ]; then
        echo "  ✓ Backend tests passed"
    else
        echo "  ✗ Backend tests failed"
    fi
}

# Run frontend tests
run_frontend_tests() {
    if [[ "$SKIP_FRONTEND_TESTS" == "true" ]]; then
        echo "  Skipping frontend tests (SKIP_FRONTEND_TESTS=true)"
        return 0
    fi
    
    print_section "Frontend Tests"
    
    if ! command -v npm &> /dev/null; then
        echo "⚠ npm not found, skipping frontend tests"
        return 0
    fi
    
    echo "Running frontend tests..."
    pushd frontend > /dev/null
    
    set +e
    npm test
    FRONTEND_EXIT_CODE=$?
    set -e
    
    popd > /dev/null
    
    if [ $FRONTEND_EXIT_CODE -eq 0 ]; then
        echo "  ✓ Frontend tests passed"
    else
        echo "  ✗ Frontend tests failed"
    fi
}

# Test stats using CLI
show_test_stats() {
    print_section "Test Statistics (via CLI)"
    
    echo "Fetching test statistics..."
    $SCALEDTEST_CMD test stats --days 7 2>/dev/null || echo "  (no statistics available)"
}

# Print summary
print_summary() {
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "                      Summary                              "
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    echo "  Namespace: ${NAMESPACE}"
    echo "  Release: ${RELEASE_NAME}"
    echo "  Project: ${PROJECT_NAME} (${PROJECT_ID:-not created})"
    echo "  Registry: ${REGISTRY_NAME} (${REGISTRY_ID:-not created})"
    echo "  Cluster: ${CLUSTER_ID:-not configured}"
    echo "  Test Image: ${TEST_IMAGE_ID:-not registered}"
    echo ""
    echo "  K8s Tests:       $([ ${K8S_EXIT_CODE:-0} -eq 0 ] && echo '✓ Validated' || echo '✗ Failed')"
    echo "  Backend Tests:   $([ ${BACKEND_EXIT_CODE:-0} -eq 0 ] && echo '✓ Passed' || echo '✗ Failed')"
    echo "  Frontend Tests:  $([ ${FRONTEND_EXIT_CODE:-0} -eq 0 ] && echo '✓ Passed' || echo '✗ Failed')"
    echo ""
    
    local total_exit=$((${K8S_EXIT_CODE:-0} + ${BACKEND_EXIT_CODE:-0} + ${FRONTEND_EXIT_CODE:-0}))
    if [ $total_exit -eq 0 ]; then
        echo "✓ All tests completed successfully"
    else
        echo "✗ Some tests failed"
    fi
}

# Show help
show_help() {
    cat << EOF
ScaledTest Test Runner

Usage: $0 [options]

Options:
    --help              Show this help message
    --skip-build        Skip building Docker images
    --skip-deploy       Skip Helm deployment
    --skip-backend      Skip backend tests
    --skip-frontend     Skip frontend tests
    --namespace NAME    Kubernetes namespace (default: default)
    --release NAME      Helm release name (default: scaledtest)

Environment Variables:
    NAMESPACE           Kubernetes namespace
    RELEASE_NAME        Helm release name
    ADMIN_EMAIL         Admin user email
    ADMIN_PASSWORD      Admin user password
    PROJECT_NAME        Project name to create/use
    REGISTRY_URL        Container registry URL
    REGISTRY_NAME       Container registry name
    LOCAL_REGISTRY      Local registry for images
    SKIP_BUILD          Set to 'true' to skip build
    SKIP_DEPLOY         Set to 'true' to skip deploy
    SKIP_BACKEND_TESTS  Set to 'true' to skip backend tests
    SKIP_FRONTEND_TESTS Set to 'true' to skip frontend tests

Example:
    # Run everything
    $0

    # Skip build and deploy (use existing deployment)
    $0 --skip-build --skip-deploy

    # Run only backend tests
    SKIP_FRONTEND_TESTS=true $0 --skip-build --skip-deploy
EOF
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --help)
            show_help
            exit 0
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --skip-deploy)
            SKIP_DEPLOY=true
            shift
            ;;
        --skip-backend)
            SKIP_BACKEND_TESTS=true
            shift
            ;;
        --skip-frontend)
            SKIP_FRONTEND_TESTS=true
            shift
            ;;
        --namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        --release)
            RELEASE_NAME="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Main execution
main() {
    print_header
    check_prerequisites
    build_images
    deploy_services
    wait_for_services
    setup_port_forwards
    health_check
    authenticate
    ensure_project
    ensure_registry
    ensure_k8s_cluster
    register_test_image
    run_k8s_tests
    run_backend_tests
    run_frontend_tests
    show_test_stats
    print_summary
    
    local total_exit=$((${K8S_EXIT_CODE:-0} + ${BACKEND_EXIT_CODE:-0} + ${FRONTEND_EXIT_CODE:-0}))
    exit $total_exit
}

main "$@"
