# ScaledTest: Next.js Test Management Platform

A comprehensive platform for test result management and reporting built with Next.js, featuring Keycloak authentication and OpenSearch integration.

## Core Features (Updated June 2025)

- **Modern Tech Stack**: Built with Next.js 14+ and TypeScript
- **Interactive Test Results Dashboard**: Visualize and monitor test results in real-time
- **Role-Based Access Control (RBAC)**: Powered by Keycloak authentication
- **Test Report Generation**: Generate standardized CTRF test reports
- **OpenSearch Integration**: Fast searching and analytics of test data
- **Demo Data Generation**: Create realistic test data for dashboard visualization
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
# Required Keycloak configuration
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_ADMIN_USERNAME=admin
KEYCLOAK_ADMIN_PASSWORD=admin
KEYCLOAK_REALM=scaledtest
KEYCLOAK_REALM_DISPLAY_NAME=ScaledTest Local Realm
KEYCLOAK_CLIENT_ID=scaledtest-client

# Required OpenSearch configuration
OPENSEARCH_HOST=http://localhost:9200
OPENSEARCH_USERNAME=admin
OPENSEARCH_PASSWORD=admin

# Required Next.js public variables
NEXT_PUBLIC_KEYCLOAK_URL=http://localhost:8080
NEXT_PUBLIC_KEYCLOAK_REALM=scaledtest
NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=scaledtest-client
NEXT_PUBLIC_APP_BASE_URL=http://localhost:3000
```

## Development Workflow

### Starting the Application

The easiest way to start the application with all its dependencies:

```bash
npm run dev
```

This command will:

1. Start Docker containers for Keycloak and OpenSearch
2. Run the Keycloak setup script
3. Start the Next.js development server with Turbopack

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:system
```

### Code Formatting

```bash
# Format all code with Prettier
npm run format
```

## Authentication System

ScaledTest uses Keycloak for authentication with:

- **Custom Login Flow**: Direct login through a custom form integrated with Keycloak API
- **Role-Based Access**: Three progressive access levels
- **Token Management**: Silent refresh for seamless session management

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

## Demo Data Generation

ScaledTest includes a powerful demo data generator for testing dashboard visualizations:

```bash
# Generate random test reports (recommended for variety)
npm run demo-data

# Generate 5 random reports with different scenarios
npm run demo-data random 5

# Generate specific scenarios
npm run demo-data improving 3    # Shows test quality improvement
npm run demo-data flaky 2        # Shows unreliable tests
npm run demo-data stable 1       # Shows consistent performance

# List all available scenarios
npm run demo-data list

# Get help
npm run demo-data help
```

### Available Demo Scenarios

- **random**: Mixed scenarios with varied tools, environments, and performance
- **improving**: Gradual improvement in test quality over time
- **declining**: Quality regression scenario (useful for alerts testing)
- **stable**: Consistent high-performance test suite
- **flaky**: Inconsistent results with high variability
- **large**: Enterprise-scale test suite with multiple components

The demo data generator creates realistic test reports with:

- Multiple test types (unit, integration, e2e, accessibility)
- Realistic test names and error messages
- Various performance profiles (fast, normal, slow)
- Time-distributed reports for trend analysis

See the [Demo Data Guide](docs/DEMO_DATA_GUIDE.md) for detailed information.

## Environment Configuration

For detailed environment configuration, see the [Environment Configuration Guide](docs/ENVIRONMENT.md).

### Production Configuration

In production environments, configure these secure settings:

```
KEYCLOAK_URL=https://your-keycloak-server
KEYCLOAK_ADMIN_USERNAME=your-admin-username
KEYCLOAK_ADMIN_PASSWORD=your-secure-admin-password
KEYCLOAK_REALM=your-realm-name
KEYCLOAK_CLIENT_ID=your-client-id
KEYCLOAK_REDIRECT_URIS=https://your-app-url/*
KEYCLOAK_WEB_ORIGINS=https://your-app-url
OPENSEARCH_HOST=https://your-opensearch-instance
OPENSEARCH_USERNAME=your-opensearch-username
OPENSEARCH_PASSWORD=your-secure-opensearch-password
```

## Component Architecture

ScaledTest consists of three main components:

1. **Next.js Application**: Frontend and API endpoints
2. **Keycloak Server**: Authentication and user management
3. **OpenSearch**: Data storage and querying

## Test Users

The system automatically creates these test users:

1. **Read-only User**

   - Username: `readonly@example.com`
   - Password: `password`
   - Role: readonly

2. **Maintainer User**

   - Username: `maintainer@example.com`
   - Password: `password`
   - Roles: readonly, maintainer

3. **Owner User**
   - Username: `owner@example.com`
   - Password: `password`
   - Roles: readonly, maintainer, owner

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
- **Authentication**: Keycloak with custom flows
- **Data Storage**: OpenSearch
- **Testing**: Jest, Playwright
- **Infrastructure**: Docker, Docker Compose
- **CI/CD**: GitHub Actions
- **Report Format**: CTRF (Common Test Result Format)

## Testing & CTRF Reporting

ScaledTest includes comprehensive testing capabilities with automated CTRF (Common Test Report Format) reporting:

### Running Tests with CTRF Reporting

```bash
# Send existing test results to API
npm run send-test-results
```

### CTRF Benefits

- **Standardized Format**: Uses the industry-standard CTRF schema
- **API Integration**: Automatically sends test results to your own API for dogfooding
- **Rich Metadata**: Includes environment info, timing, and failure details
- **Authentication**: Supports Keycloak authentication for secure API submission
- **Flexible Reporting**: Works with CI/CD pipelines and local development

For detailed CTRF configuration and usage, see the [CTRF Reporting Guide](docs/CTRF_REPORTING.md).

## Contributing

See our [contributing guide](docs/CONTRIBUTING.md) for how to contribute to the project.

## License

MIT
