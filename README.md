# ScaledTest: Next.js Test Management Platform

A comprehensive platform for test result management and reporting built with Next.js, featuring Better Auth authentication and TimescaleDB storage.

## Core Features (Updated January 2025)

- **Modern Tech Stack**: Built with Next.js 14+ and TypeScript
- **Single Page Application (SPA) Navigation**: Default seamless, stateful navigation without page reloads
- **Interactive Test Results Dashboard**: Visualize and monitor test results in real-time
- **Role-Based Access Control (RBAC)**: Powered by Better Auth authentication
- **Test Report Generation**: Generate standardized CTRF test reports
- **TimescaleDB Integration**: High-performance time-series data storage and analytics
- **Comprehensive Testing Suite**: Unit, integration, and system tests with Jest and Playwright

## Prerequisites

- Node.js (v18+)
- Docker and Docker Compose
- Git

## Quick Start

1. Clone the repository:

```bash
git clone <repository-url>
cd <repository-directory>
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env.local` file with the following:

```
# Required Better Auth configuration
BETTER_AUTH_SECRET=your-secret-key-here-should-be-at-least-32-characters-long
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# Required Database configuration
DATABASE_URL=postgresql://scaledtest:password@localhost:5432/auth

# TimescaleDB Configuration
TIMESCALEDB_HOST=localhost
TIMESCALEDB_PORT=5432
TIMESCALEDB_DATABASE=scaledtest
TIMESCALEDB_USERNAME=scaledtest
TIMESCALEDB_PASSWORD=password
```

## Development Workflow

### Starting the Application

The easiest way to start the application with all its dependencies:

```bash
npm run dev
```

This command will:

1. Start Docker containers for TimescaleDB
2. Run database migrations
3. Start the Next.js development server with Turbopack

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
   - Username: `readonly@example.com`
   - Password: `ReadOnly123!`
   - Role: readonly

2. **Maintainer User**
   - Username: `maintainer@example.com`
   - Password: `Maintainer123!`
   - Roles: readonly, maintainer

3. **Owner User**
   - Username: `owner@example.com`
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
- **Infrastructure**: Docker, Docker Compose
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

## Contributing

See our [contributing guide](docs/CONTRIBUTING.md) for how to contribute to the project.

## License

MIT
