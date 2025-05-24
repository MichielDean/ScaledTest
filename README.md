# Next.js Keycloak Authentication Demo

A complete Next.js application with Keycloak integration for Role-Based Access Control (RBAC) and OpenSearch for data storage.

## Features

- Next.js and TypeScript
- Keycloak authentication with RBAC
- Docker-based Keycloak and OpenSearch setup for local development
- Three user roles:
  - Read-only: Can only view content
  - Maintainer: Can view and edit some content
  - Owner: Has full access to all features
- OpenSearch for storing and querying test results

## Prerequisites

- Node.js (latest LTS version)
- Docker and Docker Compose
- Git

## Getting Started

1. Clone the repository:

```bash
git clone <repository-url>
cd <repository-directory>
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env.local` file in the root of the project with the following content:

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

## Keycloak Configuration

The application uses a Keycloak setup script to configure the Keycloak server with the necessary realm, client, roles, and test users. This script is configured using environment variables only, with strict validation for required values.

## Authentication

The application integrates with Keycloak for authentication and provides:

1. Direct login through a custom login form that connects to Keycloak API
2. Custom registration through a registration form that creates users in Keycloak
3. Role-based access control using Keycloak roles

### Registration

The application provides two methods for user registration:

1. **Custom Registration Form**: Users can register directly through the application's custom registration form, which creates an account in Keycloak and automatically logs the user in after registration.
2. **Keycloak Registration**: Users can still access the native Keycloak registration page if desired.

### Environment Variables for Authentication API

Make sure to set the following environment variables for user registration to work:

```
KEYCLOAK_ADMIN_USERNAME=admin
KEYCLOAK_ADMIN_PASSWORD=admin
```

## Environment Configuration

The application uses environment variables for all configuration, including Keycloak and OpenSearch settings. For detailed information about environment configuration for different deployment environments (local, development, staging, and production), see the [Environment Configuration Guide](docs/ENVIRONMENT.md).

### Using Environment Variables

To customize the Keycloak setup using environment variables, copy the `.env.example` file to `.env` and adjust the values:

```bash
cp .env.example .env
# Edit .env file with your preferred values
```

### Custom Configuration File

The script will first look for configuration in `config/keycloak.config.js`. This file allows for more structured configuration and is the recommended approach for production environments.

### For Production Use

In production environments, consider setting the following environment variables:

```
KEYCLOAK_URL=https://your-keycloak-server
KEYCLOAK_ADMIN_USERNAME=your-admin-username
KEYCLOAK_ADMIN_PASSWORD=your-secure-admin-password
KEYCLOAK_REALM=your-realm-name
KEYCLOAK_CLIENT_ID=your-client-id
KEYCLOAK_REDIRECT_URIS=https://your-app-url/*
KEYCLOAK_WEB_ORIGINS=https://your-app-url
```

## Running the Application

You can start the application with all dependencies using the included PowerShell script:

```bash
./start-app.ps1
```

Alternatively, you can start the components manually:

1. Start the Docker containers for Keycloak and OpenSearch:

```bash
docker compose -f docker/docker-compose.yml up -d
```

2. Run the Keycloak setup script:

```bash
node scripts/setup-keycloak.js
```

3. Start the Next.js application:

```bash
npm run dev
```

## Test Users

The application automatically creates the following test users:

1. **Read-only User**

   - Username: readonly-user
   - Password: password
   - Role: readonly

2. **Maintainer User**

   - Username: maintainer-user
   - Password: password
   - Roles: readonly, maintainer

3. **Owner User**
   - Username: owner-user
   - Password: password
   - Roles: readonly, maintainer, owner

## Development

For local development, you can use:

```bash
npm run dev
```

Note that you'll still need to have Keycloak running:

```bash
docker compose -f docker/docker-compose.yml up -d
```

## Building for Production

To build the application for production:

```bash
npm run build
```

## Keeping Dependencies Up to Date

To check and update dependencies to their latest versions:

```bash
npm run update-deps
```

## Technologies Used

- Next.js
- TypeScript
- Keycloak
- Docker
- PostgreSQL (for Keycloak database)

## License

MIT
