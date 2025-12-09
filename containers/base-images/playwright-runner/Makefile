# Makefile for Playwright Runner

.PHONY: help build test-discovery test-run push clean

REGISTRY ?= ghcr.io
ORG ?= your-org
IMAGE_NAME ?= scaledtest/playwright-runner
TAG ?= latest
FULL_IMAGE = $(REGISTRY)/$(ORG)/$(IMAGE_NAME):$(TAG)

help: ## Show this help message
	@echo "Playwright Test Runner - Make targets:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

build: ## Build the Docker image
	@echo "Building $(FULL_IMAGE)..."
	docker build -f Dockerfile -t $(FULL_IMAGE) ../../..
	@echo "✓ Build complete"

build-local: ## Build with 'local' tag for testing
	@$(MAKE) build TAG=local

test-discovery: ## Test discovery mode locally
	@echo "Running test discovery..."
	docker run --rm \
		-e DISCOVERY_MODE=true \
		$(FULL_IMAGE) | tee discovery-output.json
	@echo ""
	@echo "Discovered tests:"
	@cat discovery-output.json | jq -r '.tests[] | "\(.id) - \(.name)"' | head -20

test-run: ## Run a single test (requires TEST_ID)
ifndef TEST_ID
	$(error TEST_ID is not set. Usage: make test-run TEST_ID=test_login_should_display_form)
endif
	@echo "Running test: $(TEST_ID)"
	@mkdir -p test-output test-artifacts
	docker run --rm \
		-e JOB_COMPLETION_INDEX=0 \
		-e TEST_ID=$(TEST_ID) \
		-e BASE_URL=http://host.docker.internal:5173 \
		-v $(PWD)/test-output:/test-results \
		-v $(PWD)/test-artifacts:/artifacts \
		$(FULL_IMAGE)
	@echo ""
	@echo "Results:"
	@cat test-output/ctrf-report.json | jq .
	@echo ""
	@echo "Artifacts:"
	@ls -lh test-artifacts/

test-first: ## Run the first discovered test
	@$(eval TEST_ID := $(shell cat discovery-output.json | jq -r '.tests[0].id'))
	@$(MAKE) test-run TEST_ID=$(TEST_ID)

push: ## Push image to registry
	@echo "Pushing $(FULL_IMAGE)..."
	docker push $(FULL_IMAGE)
	@echo "✓ Push complete"

login-ghcr: ## Login to GitHub Container Registry
ifndef GITHUB_TOKEN
	$(error GITHUB_TOKEN is not set. Set it with: export GITHUB_TOKEN=ghp_xxx)
endif
	@echo $(GITHUB_TOKEN) | docker login ghcr.io -u $(USER) --password-stdin
	@echo "✓ Logged in to GHCR"

release: build push ## Build and push image

clean: ## Clean up local test outputs
	rm -rf test-output test-artifacts discovery-output.json
	@echo "✓ Cleaned test outputs"

inspect: ## Inspect the built image
	@docker images $(FULL_IMAGE) --format "table {{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"

size: ## Show image size breakdown
	@docker history $(FULL_IMAGE) --human --format "table {{.Size}}\t{{.CreatedBy}}"

shell: ## Open shell in container
	docker run --rm -it \
		-e DISCOVERY_MODE=false \
		--entrypoint /bin/bash \
		$(FULL_IMAGE)

# Quick commands
.PHONY: quick-test quick-build-and-test

quick-build-and-test: build-local test-discovery test-first ## Build, discover, and run first test

quick-test: test-discovery test-first ## Discover and run first test
