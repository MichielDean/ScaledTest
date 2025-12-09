.PHONY: help proto build build-cli run test clean docker-build wire mocks arch-test generate-ci verify-generated \
        tilt-up tilt-down helm-install helm-uninstall helm-upgrade k8s-logs k8s-status k8s-shell cli-install

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

proto: ## Generate Go and TypeScript code from proto files using buf
	@echo "Generating code from proto files..."
	buf generate
	@echo "✓ Proto code generated successfully"

wire: ## Generate Wire dependency injection code
	@echo "Generating Wire dependency injection code..."
	@cd internal/wire && wire
	@echo "✓ Wire code generated successfully"

mocks: ## Generate Mockery mocks from interfaces
	@echo "Generating Mockery mocks..."
	@mkdir -p internal/mocks
	mockery
	@echo "✓ Mocks generated successfully"

generate: proto wire mocks ## Run all code generation (proto + wire + mocks)

generate-ci: wire mocks ## Run CI-safe code generation (skips proto - requires buf)

verify-generated: generate-ci ## Verify generated code is up-to-date (fails if uncommitted changes)
	@echo "Checking for uncommitted generated code changes..."
	@if [ -n "$$(git status --porcelain)" ]; then \
		echo "ERROR: Generated code is out of date. Please run 'make generate' and commit the changes."; \
		git status --porcelain; \
		git diff --stat; \
		exit 1; \
	fi
	@echo "✓ Generated code is up-to-date"

arch-test: ## Run architecture tests (dependency rules, function limits)
	@echo "Running architecture tests..."
	@go install github.com/arch-go/arch-go/v2@latest
	@arch-go
	@echo "✓ Architecture tests passed"

build: ## Build the Go application
	@echo "Building server..."
	go build -o bin/server cmd/server/main.go

build-cli: ## Build the CLI application
	@echo "Building CLI..."
	go build -o bin/scaledtest cmd/scaledtest/main.go
	@echo "✓ CLI built: bin/scaledtest"

cli-install: build-cli ## Build and install CLI to GOPATH/bin
	@echo "Installing CLI..."
	go install ./cmd/scaledtest
	@echo "✓ CLI installed to $$(go env GOPATH)/bin/scaledtest"

run: ## Run the development server
	@echo "Starting server..."
	go run cmd/server/main.go

test: arch-test ## Run all tests (arch + unit + integration)
	@echo "Running all tests..."
	go test -v ./...

test-unit: ## Run unit tests only (with mocks, fast)
	@echo "Running unit tests..."
	go test -v -short ./internal/services/...

test-integration: ## Run integration tests (requires database)
	@echo "Running integration tests..."
	go test -v -tags=integration ./internal/services/...

test-coverage: ## Run tests with coverage
	@echo "Running tests with coverage..."
	go test -v -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out -o coverage.html
	@echo "✓ Coverage report generated: coverage.html"

clean: ## Clean build artifacts
	@echo "Cleaning..."
	rm -rf bin/
	rm -f coverage.out coverage.html

deps: ## Download dependencies
	@echo "Downloading dependencies..."
	go mod download
	go mod tidy

docker-build: ## Build Docker image
	docker build -t scaledtest-backend:latest -f Dockerfile .

# Kubernetes/Helm settings
NAMESPACE ?= default
RELEASE_NAME ?= scaledtest
HELM_CHART_PATH := ../deploy/helm/scaledtest
VALUES_FILE ?= $(HELM_CHART_PATH)/values-dev.yaml

tilt-up: ## Start Tilt for K8s development (hot reload)
	@echo "Starting Tilt for Kubernetes development..."
	cd .. && tilt up

tilt-down: ## Stop Tilt
	@echo "Stopping Tilt..."
	cd .. && tilt down

helm-install: ## Install Helm chart
	@echo "Installing Helm chart..."
	helm install $(RELEASE_NAME) $(HELM_CHART_PATH) \
		-n $(NAMESPACE) \
		-f $(VALUES_FILE) \
		--wait --timeout 5m

helm-uninstall: ## Uninstall Helm chart
	@echo "Uninstalling Helm chart..."
	helm uninstall $(RELEASE_NAME) -n $(NAMESPACE)

helm-upgrade: ## Upgrade Helm chart
	@echo "Upgrading Helm chart..."
	helm upgrade $(RELEASE_NAME) $(HELM_CHART_PATH) \
		-n $(NAMESPACE) \
		-f $(VALUES_FILE) \
		--wait --timeout 5m

k8s-logs: ## View backend logs in Kubernetes
	@echo "Viewing backend logs..."
	kubectl logs -f -l app.kubernetes.io/component=backend,app.kubernetes.io/instance=$(RELEASE_NAME) -n $(NAMESPACE)

k8s-status: ## Check Kubernetes resource status
	@echo "Checking Kubernetes status..."
	@echo "\n=== Pods ==="
	kubectl get pods -n $(NAMESPACE) -l app.kubernetes.io/instance=$(RELEASE_NAME)
	@echo "\n=== Services ==="
	kubectl get svc -n $(NAMESPACE) -l app.kubernetes.io/instance=$(RELEASE_NAME)
	@echo "\n=== PostgreSQL Cluster ==="
	kubectl get cluster -n $(NAMESPACE) 2>/dev/null || echo "No PostgreSQL clusters found"

k8s-shell: ## Open shell in backend pod
	@echo "Opening shell in backend pod..."
	kubectl exec -it -n $(NAMESPACE) \
		$$(kubectl get pod -n $(NAMESPACE) -l app.kubernetes.io/component=backend,app.kubernetes.io/instance=$(RELEASE_NAME) -o jsonpath='{.items[0].metadata.name}') \
		-- /bin/sh

migrate-up: ## Run database migrations up
	@echo "Running migrations up..."
	supabase migration up

migrate-down: ## Run database migrations down
	@echo "Running migrations down..."
	supabase migration down

migrate-new: ## Create a new migration file (usage: make migrate-new NAME=migration_name)
	@echo "Creating new migration..."
	supabase migration new $(NAME)
