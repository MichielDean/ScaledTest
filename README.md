# ScaledTest: Go Backend with React Test Management Platform

A comprehensive platform for test result management and reporting built with Go backend, React/Vite frontend, featuring JWT authentication and PostgreSQL/TimescaleDB storage.

## Project Structure

```
ScaledTest/
├── backend/           # Go backend (Fiber + gRPC)
│   ├── cmd/          # Application entrypoints
│   ├── internal/     # Internal packages (handlers, services, middleware)
│   ├── proto/        # Protocol Buffer definitions
│   └── go.mod        # Go dependencies
├── frontend/         # React + Vite SPA
│   ├── src/          # Frontend source code
│   ├── tests/        # Jest and Playwright tests
│   ├── .env          # Frontend environment variables (VITE_API_URL)
│   ├── jest.config.ts       # Jest test configuration
│   ├── playwright.config.ts # Playwright E2E test configuration
│   └── package.json  # Frontend dependencies
├── deploy/           # Deployment configuration
│   ├── helm/         # Helm chart (primary deployment method)
│   └── k8s/          # Raw Kubernetes manifests (reference)
├── .vscode/          # VS Code workspace settings
├── Tiltfile          # Tilt configuration for local development
├── CODEOWNERS
└── README.md         # This file
```

**Note**: Environment variables are managed via Helm values and Kubernetes secrets.

- Backend: Configured via Helm values.yaml
- Frontend: `frontend/.env` (contains `VITE_API_URL`)
- Deployment: `deploy/helm/scaledtest/values.yaml` and `values-dev.yaml`

## Architecture

**3-Container Minimal Stack:**

- **PostgreSQL with TimescaleDB**: Single database for authentication and application data
- **Go Backend**: Fiber web framework with native JWT authentication and gRPC support
- **React/Vite Frontend**: Modern SPA with React Router

## Core Features

- **Go Backend**: High-performance Fiber v2.52 HTTP framework with gRPC v1.73
- **JWT Authentication**: Secure bcrypt password hashing and JWT token-based auth
- **Interactive Test Results Dashboard**: Visualize and monitor test results in real-time
- **Role-Based Access Control**: User roles managed in Go backend
- **Test Report Generation**: Standardized CTRF test reports
- **TimescaleDB Integration**: High-performance time-series data storage and analytics
- **Comprehensive Testing**: Frontend testing with Jest and Playwright
- **Kubernetes Test Execution**: Run tests at scale using K8s Indexed Jobs
- **Dogfooding**: Platform runs its own Playwright tests through K8s infrastructure

## Prerequisites

- **Docker Desktop with Kubernetes** - for container orchestration
- **Helm 3.12+** - for Kubernetes deployments
- **Tilt** (optional) - for hot-reload development
- **Node.js (v20+)** - for frontend development
- **Go 1.24+** - for backend development
- **Git**

### Download Helm Dependencies

The Helm chart uses the Bitnami PostgreSQL subchart:

```bash
cd deploy/helm/scaledtest
helm dependency update
```

### Install Tilt (Optional)

For local development with hot-reload:

```powershell
# Windows (PowerShell)
iex ((new-object net.webclient).DownloadString('https://raw.githubusercontent.com/tilt-dev/tilt/master/scripts/install.ps1'))

# Windows (Scoop)
scoop bucket add tilt-dev https://github.com/tilt-dev/scoop-bucket
scoop install tilt
```

```bash
# macOS
brew install tilt

# Linux
curl -fsSL https://raw.githubusercontent.com/tilt-dev/tilt/master/scripts/install.sh | bash
```

## Quick Start

### 1. Start with Tilt (Recommended for Development)

```bash
npm run dev  # or: tilt up
```

This will:
- Deploy the Helm chart with development values
- Build and deploy backend and frontend images
- Enable hot-reload for code changes
- Set up port forwards automatically

Access the application:
- **Tilt Dashboard**: http://localhost:10350
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8080
- **Backend gRPC**: localhost:9090

### 2. Start with Helm (Without Tilt)

```bash
# Install with development values
npm run helm:install

# Or use Helm directly
helm install scaledtest ./deploy/helm/scaledtest \
  -f ./deploy/helm/scaledtest/values-dev.yaml \
  --wait --timeout 5m
```

### Useful Commands

```bash
npm run dev          # Start Tilt
npm run dev:down     # Stop Tilt
npm run helm:install # Install Helm chart
npm run helm:upgrade # Upgrade Helm chart
npm run k8s:status   # View pod status
npm run db:shell     # Connect to PostgreSQL
```

See [deploy/README.md](deploy/README.md) for detailed deployment documentation.

## Development
### Backend Development

```bash
cd backend
go run cmd/server/main.go
```

### Frontend Development

```bash
cd frontend
npm install
npm run dev
```

## Testing

### Run All Tests

The project includes a unified test script that leverages the ScaledTest platform APIs:

```bash
# Using npm script (recommended)
npm run test:all
# Or use the dogfood alias
npm run test:dogfood

# Or run bash script directly
bash test-all.sh
```

This API-driven approach:
- ✓ Uses REST APIs instead of manual Docker/K8s commands
- ✓ Automatically manages projects, registries, and test images
- ✓ Triggers test discovery via platform
- ✓ Runs backend Go tests locally
- ✓ Clean, simple output
- ✓ Only 245 lines of code

The script **automatically**:

- ✓ Checks if Kubernetes services are running
- ✓ Starts services if needed (`npm run helm:install`)
- ✓ Creates admin user if it doesn't exist
- ✓ Sets admin role in database
- ✓ Runs backend Go tests
- ✓ Runs frontend Playwright tests (CTRF format)
- ✓ Authenticates with ScaledTest API
- ✓ Uploads test results (dogfooding)
- ✓ Provides unified summary with colored output
- ✓ View results at http://localhost:5173/test-results

**Requirements:**

- **Docker Desktop with Kubernetes**: For running services
- **Helm 3.12+**: For Kubernetes deployments
- **Go**: Required for backend tests. If not installed, backend tests will be skipped.
- **Node.js/npm**: Required for frontend tests and service management
- **Bash**: Available on Linux, macOS, and Windows (via Git Bash or WSL)

**Environment Variables:**

- `UPLOAD_RESULTS=false` - Skip results upload (just run tests)
- `ADMIN_EMAIL` - Override admin email (default: admin@scaledtest.com)
- `ADMIN_PASSWORD` - Override admin password (default: Admin123!)
- `API_URL` - Override API URL (default: http://localhost:8080)
- `PROJECT_NAME` - K8s project name (default: ScaledTest)
- `IMAGE_TAG` - Playwright runner image tag (default: latest)

**K8s Platform Mode (Always Enabled)**:

The script always uses K8s platform mode and will:

1. Build the `playwright-runner` Docker image (idempotently)
2. Discover all available tests using the runner
3. Create/ensure project exists in the K8s platform
4. Trigger test execution via K8s Indexed Jobs (when REST APIs are implemented)
5. Fall back to local execution if K8s execution is not yet available

```bash
# Run tests with API-driven approach
bash test-all.sh

# Build runner image with custom tag
IMAGE_TAG=v1.0.0 bash test-all.sh
```

**Current Status**: Script uses REST APIs for project management, registry setup, test image registration, and test discovery. Runs backend tests locally.

**Note for Windows users**: The script automatically detects Go in common Windows installation paths (`C:\Program Files\Go\bin`) even if it's not in your bash PATH.

### Backend Tests Only

```bash
cd backend
go test ./...

# With verbose output
go test -v ./...

# Run specific test
go test -v ./internal/services -run TestUserService
```

### Frontend Tests Only

```bash
cd frontend

# Run all Playwright tests
npm test

# Run with UI mode (interactive)
npm run test:ui

# Run in headed mode (visible browser)
npm run test:headed

# Run in debug mode
npm run test:debug

# Show test report
npm run test:report
```

## Authentication

The Go backend provides these authentication endpoints:

- `POST /api/v1/auth/signup` - Create a new user account
- `POST /api/v1/auth/login` - Login and receive JWT token
- `GET /api/v1/auth/user` - Get current user info (requires auth)
- `POST /api/v1/auth/logout` - Logout and invalidate session

### Example Login Request:

```bash
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"yourpassword"}'
```

Response:

```json
{
  "access_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 604800,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User Name",
    "role": "user"
  }
}
```

## Environment Variables

**Backend** (configured via Helm `values.yaml`):

- `DATABASE_URL`: PostgreSQL connection string (auto-configured by Helm)
- `JWT_SECRET`: Secret key for JWT token signing
- `PORT`: HTTP server port (default: 8080)
- `GRPC_PORT`: gRPC server port (default: 9090)

**Frontend** (configured in `.env` files):

- `VITE_API_URL`: Backend API URL (default: http://localhost:8080)

## Database Schema

**Authentication Schema (`auth.*`):**

- `auth.users`: User accounts with encrypted passwords and roles
- `auth.sessions`: Active JWT session tracking

**Application Schema (`public.*`):**

- `public.profiles`: Extended user profile information
- `public.teams`: Team management
- TimescaleDB hypertables for test results and metrics

## Repository Organization

This repository is organized into three independent modules:

- **`/backend`**: Complete Go application with its own dependencies (`go.mod`)
- **`/frontend`**: Complete React application with its own dependencies (`package.json`) and test infrastructure
- **`/deploy`**: Helm charts and Kubernetes manifests

Each module is self-contained and can be developed independently. The root directory contains only essential documentation and git configuration.

## Contributing

When contributing to this project:

1. **Backend changes**: Work in the `backend/` directory
2. **Frontend changes**: Work in the `frontend/` directory
3. **Database changes**: Add migrations to `deploy/helm/scaledtest/migrations/`
4. **Infrastructure changes**: Update Helm chart in `deploy/helm/scaledtest/`

Each module has its own linting, testing, and build configuration.TIMESCALEDB_USERNAME=scaledtest
TIMESCALEDB_PASSWORD=password

````

## Development Workflow

### Starting the Application

**Everything is fully automated - no manual migration commands needed!**

#### Option 1: Docker (Recommended)

```bash
npm run dev
````

This single command:

1. Builds the Docker images
2. Starts TimescaleDB (waits for health check)
3. **Automatically runs database migrations**
4. Starts Next.js development server

**Performance Optimization:** Docker uses named volumes for `node_modules` and `.next` cache, which persist across container rebuilds. This means:

- First run: Dependencies are installed (takes a few minutes)
- Subsequent runs: Dependencies are cached (starts in seconds)
- Optional: Pre-populate the Docker volume with your local node_modules:

  ```bash
  # Windows (PowerShell)
  .\scripts\sync-node-modules-to-docker.ps1

  # Linux/Mac
  ./scripts/sync-node-modules-to-docker.sh
  ```

#### Option 2: Local Development

```bash
npm run dev:local
```

This single command:

1. Starts Docker containers (database only)
2. **Automatically runs migrations**
3. Starts Next.js locally (outside Docker)

**No manual migration steps required!** Migrations run automatically on every startup, ensuring your database schema is always up-to-date.

### Database Migrations

**Migrations run automatically!** When you run `npm run dev` or `npm run dev:local`, migrations are executed automatically before the app starts.

For advanced migration management (optional):

```bash
# Manually run pending migrations (usually not needed)
npm run migrate

# Rollback last migration
npm run migrate:down

# Create new migration
npm run migrate:make -- migration_name

# List all migrations and their status
npm run migrate:list
```

Migration files are TypeScript files located in `src/data/db/migrations/`. The kysely-ctl tool handles TypeScript compilation automatically.

**How it works:**

- **Docker**: The Dockerfile runs `npm run migrate` before starting Next.js
- **Local**: The `dev:local` script runs migrations before starting Next.js
- **Smart**: kysely-ctl only runs new migrations, skipping already-applied ones

### Managing Docker

Docker can be controlled independently:

```bash
# Start Docker only (database services)
npm run docker:up

# Stop Docker and remove volumes
npm run docker:down
```

### Running Tests

ScaledTest uses Jest with multiple test projects for comprehensive testing:

```bash
# Run all tests
npm test

# Run specific test types
npm run test:unit           # Unit tests only
npm run test:components     # React component tests only
npm run test:integration    # Integration tests only
npm run test:system         # System and UI tests (includes Playwright)
```

#### Advanced Jest CLI Usage

You can use Jest CLI options directly for more granular control:

```bash
# Run specific projects
npx jest --selectProjects Unit
npx jest --selectProjects Integration System

# Filter tests by name pattern
npx jest --testNamePattern="auth"                    # Tests containing "auth"
npx jest --testNamePattern="should validate"         # Tests starting with "should validate"

# Filter tests by file path pattern
npx jest --testPathPattern="components"              # Tests in components directory
npx jest --testPathPattern="auth.*test"              # Auth-related test files

# Combine project selection with filtering
npx jest --selectProjects Unit --testNamePattern="validation"

# Run tests in watch mode
npx jest --watch                                     # Watch changed files
npx jest --watchAll                                  # Watch all files

# Debug and verbose output
npx jest --verbose                                   # Show individual test results
npx jest --detectOpenHandles                        # Debug async handle issues
npx jest --runInBand                                # Run tests serially (good for debugging)

# Coverage reporting
npx jest --coverage                                  # Generate coverage reports
npx jest --coverage --collectCoverageFrom="src/**/*.{ts,tsx}"
```

#### Test Project Structure

- **Unit** (`tests/unit/`): Fast, isolated unit tests for individual functions and modules
- **Components** (`tests/components/`): React Testing Library tests for UI components
- **Integration** (`tests/integration/`): API and service integration tests
- **System** (`tests/system/` and `tests/ui/`): End-to-end tests with Playwright

#### Environment Variables for Testing

Ensure these environment variables are set for complete test coverage:

```bash
# Required for integration and system tests
DATABASE_URL=postgresql://scaledtest:password@localhost:5432/scaledtest
BETTER_AUTH_SECRET=your-secret-key-here-should-be-at-least-32-characters-long
NEXT_PUBLIC_BASE_URL=http://localhost:3000

TIMESCALEDB_HOST=localhost
TIMESCALEDB_PORT=5432
TIMESCALEDB_DATABASE=scaledtest
TIMESCALEDB_USERNAME=scaledtest
TIMESCALEDB_PASSWORD=password

# Optional: Control test execution
JEST_TIMEOUT=60000                                   # Test timeout in milliseconds
MAX_WORKERS=50%                                      # Control parallel test execution
```

### Database Setup and Migrations

ScaledTest uses separate databases for different concerns:

- **auth database**: Better Auth authentication
- **scaledtest database**: Test results with TimescaleDB

```bash
# Run all migrations (both databases)
npm run migrate:all
```

**Key Benefits:**

- **Separate database isolation** for auth and analytics
- **Version-controlled schema changes** with rollback capability
- **TypeScript migrations** for type safety
- **Production-ready** with proper error handling and logging
- **TimescaleDB optimizations** built into migrations

For detailed information about the migration system, see [MIGRATIONS.md](MIGRATIONS.md).

#### Migration Commands

```bash
# Run all migrations (recommended)
npm run migrate:all

# Run specific database migrations
npm run migrate:auth           # Auth database only
npm run migrate:scaledtest     # ScaledTest database only

# Rollback migrations
npm run migrate:down:auth      # Rollback auth database
npm run migrate:down:scaledtest # Rollback scaledtest database
```

### Code Formatting

```bash
# Format all code with Prettier
npm run format
```

## Authentication System

ScaledTest uses Better Auth for authentication with:

- **Email/Password Authentication**: Secure login through Better Auth
- **Role-Based Access**: Three progressive access levels
- **Session Management**: Secure session handling with automatic refresh

## User Roles

ScaledTest implements three permission levels:

1. **Read-only User**
   - Can view test results and dashboards
   - Cannot modify any data

2. **Maintainer User**
   - Read permissions plus ability to upload test results
   - Can edit test metadata and tags

3. **Owner User**
   - Full administrative access
   - User management capabilities
   - System configuration access

## Test Results Dashboard

The Test Results Dashboard provides:

- Filterable view of test executions
- Performance trend analysis
- CTRF-compliant report generation
- Test result comparison features

## Environment Configuration

For detailed environment configuration, see the [Environment Configuration Guide](docs/ENVIRONMENT.md).

### Production Configuration

In production environments, configure these secure settings:

```
BETTER_AUTH_SECRET=your-secure-secret-key-at-least-32-characters-long
BETTER_AUTH_URL=https://your-app-url
NEXT_PUBLIC_BASE_URL=https://your-app-url
DATABASE_URL=postgresql://username:password@host:port/database
TIMESCALEDB_HOST=your-timescaledb-host
TIMESCALEDB_DATABASE=your-database-name
TIMESCALEDB_USERNAME=your-database-username
TIMESCALEDB_PASSWORD=your-secure-database-password
```

## Component Architecture

ScaledTest consists of two main components:

1. **Next.js Application**: Frontend, API endpoints, and authentication
2. **TimescaleDB**: Time-series data storage and analytics
3. **TimescaleDB**: High-performance time-series data storage

## Test Users

The system automatically creates these test users for development and testing:

1. **Read-only User**
   - Username: `readonly@scaledtest.com`
   - Password: `ReadOnly123!`
   - Role: readonly

2. **Maintainer User**
   - Username: `maintainer@scaledtest.com`
   - Password: `Maintainer123!`
   - Roles: readonly, maintainer

3. **Owner User**
   - Username: `owner@scaledtest.com`
   - Password: `Owner123!`
   - Roles: readonly, maintainer, owner

**Security Note**: These test users are intended for development and testing environments only. In production, create proper user accounts through the Better Auth system with secure passwords following your organization's password policy.

## CI/CD Integration

The project includes:

- Jest tests for all code layers
- Playwright for UI testing
- Ready-to-use GitHub Actions workflows

## Building for Production

```bash
npm run build
```

## Dependency Management

Keep dependencies current with:

```bash
npm run update-deps
```

## Technologies

- **Frontend**: Next.js 14+, TypeScript, React
- **Authentication**: Better Auth with email/password authentication
- **Data Storage**: TimescaleDB (PostgreSQL with time-series extensions)
- **Testing**: Jest, Playwright
- **Infrastructure**: Docker, Kubernetes, Helm
- **CI/CD**: GitHub Actions
- **Report Format**: CTRF (Common Test Result Format)
- **Module System**: ES2024/ESM with TypeScript
- **Test Runner**: Jest with custom ES module reporters

## Testing & Quality Assurance

ScaledTest includes comprehensive testing capabilities with automated CTRF (Common Test Report Format) reporting:

### Test Architecture

- **Unit Tests**: Fast, isolated tests for business logic and utility functions
- **Component Tests**: React Testing Library tests for UI components and user interactions
- **Integration Tests**: API endpoints, database interactions, and service integration
- **System Tests**: End-to-end workflows using Playwright for complete user journeys

### Running Tests

```bash
# Run all test suites
npm test

# Run specific test types
npm run test:unit           # Unit tests only
npm run test:components     # React component tests only
npm run test:integration    # API and service integration tests
npm run test:system         # End-to-end and UI tests (Playwright)

# Advanced filtering with Jest CLI
npx jest --selectProjects Unit Integration          # Multiple projects
npx jest --testNamePattern="auth"                   # Filter by test name
npx jest --testPathPattern="components"             # Filter by file path
npx jest --watch                                    # Watch mode for development
npx jest --coverage                                 # Generate coverage reports
```

### Test Reports & CTRF Integration

Tests automatically generate CTRF-compliant reports with:

- **Standardized Format**: Industry-standard Common Test Report Format
- **Rich Metadata**: Environment info, timing, failure details, and log capture
- **API Integration**: Automated submission to test management APIs
- **CI/CD Ready**: Seamless integration with continuous integration pipelines

```bash
# Send test results to API endpoints
npm run send-test-results
```

### Continuous Integration

The project includes ready-to-use CI/CD configurations:

- **GitHub Actions**: Automated testing on pull requests and main branch
- **Docker Support**: Containerized test execution for consistent environments
- **Parallel Execution**: Optimized test running with configurable worker processes
- **Failure Reporting**: Detailed test failure analysis and artifact collection

For detailed CTRF configuration and CI/CD setup, see the [CTRF Reporting Guide](docs/CTRF_REPORTING.md).

## Kubernetes Test Execution Platform

ScaledTest includes a complete Kubernetes-based test execution platform that runs tests at scale using the Indexed Jobs pattern.

### Features

- **Container-based Test Runners**: Docker images with Jest, Playwright, and other frameworks
- **Automatic Test Discovery**: Scans test suites and registers tests with platform
- **Kubernetes Indexed Jobs**: Each test runs in isolated pod with unique index
- **CTRF Output**: Standardized test reports in Common Test Report Format
- **Real-time Monitoring**: Watch test execution with live status updates
- **Artifact Management**: Automatic collection of screenshots, videos, traces, logs
- **Parallel Execution**: Configurable parallelism (run 5, 10, 20+ tests simultaneously)
- **Resource Management**: CPU/memory limits per test

### Platform UI

- **Projects** (`/k8s/projects`): Manage test projects with Git repository links
- **Registries** (`/k8s/registries`): Configure container registries with encrypted credentials
- **Test Images** (`/k8s/images`): Add and discover tests from container images
- **Test Selection** (`/k8s/tests`): Select tests to run with filters and resource configuration
- **Job Monitor** (`/k8s/jobs`): Real-time job monitoring with logs and artifact downloads

### Current Status

**✅ Available:**

- Playwright runner Docker image (`containers/base-images/playwright-runner/`)
- gRPC API for K8s platform operations
- Frontend UI pages for platform management
- Database schema for projects, registries, images, jobs
- K8s manifests and RBAC configuration
- **NEW**: `test-all.sh` uses API-driven approach (245 lines)

**⚠️ In Progress:**

- REST API wrappers for frontend (currently frontend uses REST, backend has gRPC only)
- Service migrations to DBPool interface

**See Documentation:**

- [K8s Runner System Architecture](docs/K8S_RUNNER_SYSTEM.md) - Complete architecture details
- [Quick Start Guide](docs/QUICK_START_RUNNER.md) - Build and test runner image

### API-Driven Test Execution

The `test-all.sh` script uses REST APIs to manage test execution:

```bash
bash test-all.sh
```

This will:

1. ✅ Authenticate with platform
2. ✅ Create/ensure project exists
3. ✅ Create/ensure container registry exists
4. ✅ Build and register test runner image
5. ✅ Discover all available tests via platform
6. ✅ Run backend tests locally
7. ✅ Display clean test summary

**Benefits**: Uses REST APIs instead of manual Docker/K8s orchestration, reducing script complexity from 654 to 245 lines.

### Building the Runner Image

```bash
cd containers/base-images/playwright-runner

# Build locally
make build TAG=local

# Test discovery mode (lists all tests)
make test-discovery

# Test execution mode (runs one test)
make test-run TEST_ID=tests_ui_login_test_ts_Login_should_display_login_form

# Build and push to registry
export REGISTRY=ghcr.io
export ORG=your-org
export TAG=v1.0.0
make build push
```

**Documentation**:

- **[K8s Runner System](docs/K8S_RUNNER_SYSTEM.md)** - Complete architecture and implementation status
- [K8s Platform Guide](docs/K8S_PLATFORM_COMPLETE.md) - Platform documentation
- [Dogfooding Guide](docs/DOGFOODING_PLAYWRIGHT.md) - Running Playwright tests via platform
- [Quick Start](docs/QUICK_START_DOGFOOD.md) - Get started in 5 minutes

**Architecture**: Tests run in Kubernetes using Indexed Jobs where each pod executes one test with `JOB_COMPLETION_INDEX`. Results are collected in CTRF format and artifacts stored in shared persistent volumes.

## Contributing

See our [contributing guide](docs/CONTRIBUTING.md) for how to contribute to the project.

## License

MIT
