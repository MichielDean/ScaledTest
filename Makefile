.PHONY: dev build test lint clean run frontend-build frontend-dev

# Binary output
BINARY := scaledtest
BUILD_DIR := bin

# Go build flags
LDFLAGS := -s -w

## dev: Run Go server with air hot-reload + frontend dev server
dev:
	@echo "Starting development servers..."
	@$(MAKE) -j2 dev-api dev-frontend

dev-api:
	@which air > /dev/null 2>&1 || go install github.com/air-verse/air@latest
	air

dev-frontend:
	cd frontend && npm run dev

## build: Build production binary with embedded frontend
build: frontend-build
	go build -ldflags "$(LDFLAGS)" -o $(BUILD_DIR)/$(BINARY) ./cmd/server

## run: Run the built binary
run:
	./$(BUILD_DIR)/$(BINARY)

## test: Run all Go tests
test:
	go test ./... -v -race

## test-short: Run Go tests without race detector
test-short:
	go test ./...

## test-integration: Run store integration tests (requires TEST_DATABASE_URL)
test-integration:
	go test -tags=integration -v -race ./internal/store/... ./internal/integration/...

## lint: Run golangci-lint
lint:
	@which golangci-lint > /dev/null 2>&1 || go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
	golangci-lint run ./...

## fmt: Format Go code
fmt:
	gofmt -s -w .
	goimports -w .

## frontend-build: Build the React frontend
frontend-build:
	cd frontend && npm ci && npm run build
	@rm -f internal/spa/dist/placeholder
	cp -rf frontend/dist/* internal/spa/dist/

## frontend-dev: Run frontend dev server only
frontend-dev:
	cd frontend && npm run dev

## frontend-test: Run frontend tests
frontend-test:
	cd frontend && npm test

## migrate-up: Run database migrations
migrate-up:
	go run ./cmd/server -migrate-up

## migrate-down: Rollback last migration
migrate-down:
	go run ./cmd/server -migrate-down

## docker: Build Docker image
docker:
	docker build -t scaledtest:latest .

## clean: Remove build artifacts
clean:
	rm -rf $(BUILD_DIR)
	rm -rf frontend/dist
	rm -f internal/spa/dist/*
	@echo "placeholder" > internal/spa/dist/placeholder

## help: Show available targets
help:
	@grep -E '^## ' Makefile | sed 's/## //' | column -t -s ':'
