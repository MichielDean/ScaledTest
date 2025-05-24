# Environment Configuration

This document explains how to use the environment configuration files for the application in different environments.

## Environment Files Overview

The application uses different `.env` files for different environments:

- `.env.local`: Local development environment (not committed to source control)
- `.env.development`: Development environment (can be committed)
- `.env.development.local`: Development secrets (not committed)
- `.env.staging`: Staging environment (can be committed)
- `.env.staging.local`: Staging secrets (not committed)
- `.env.production`: Production environment (can be committed)
- `.env.production.local`: Production secrets (not committed)

## Loading Precedence

The application loads environment variables in the following order:

1. Environment variables set in the system
2. `.env.local` file
3. `.env` file

## Required Environment Variables

The application requires the following environment variables to be set:

### Keycloak Server Configuration

- `KEYCLOAK_URL`: The URL of the Keycloak server
- `KEYCLOAK_ADMIN_USER`: The admin username
- `KEYCLOAK_ADMIN_PASSWORD`: The admin password
- `NEXT_PUBLIC_KEYCLOAK_URL`: The public URL of the Keycloak server (used by frontend)
- `KEYCLOAK_ADMIN_USERNAME`: The admin username for the API to create users
- `KEYCLOAK_ADMIN_PASSWORD`: The admin password for the API to create users

### Keycloak Realm Configuration

- `KEYCLOAK_REALM`: The name of the realm
- `KEYCLOAK_REALM_DISPLAY_NAME`: The display name of the realm

### Keycloak Client Configuration

- `KEYCLOAK_CLIENT_ID`: The client ID

### OpenSearch Configuration

- `OPENSEARCH_HOST`: The URL of the OpenSearch server
- `OPENSEARCH_USERNAME`: The OpenSearch username
- `OPENSEARCH_PASSWORD`: The OpenSearch password

### User Configuration

If you want to create users, you must provide at least:

- `KEYCLOAK_[ROLE]_USER_USERNAME`: The username
- `KEYCLOAK_[ROLE]_USER_PASSWORD`: The password

Where `[ROLE]` can be `READONLY`, `MAINTAINER`, or `OWNER`.

## Using Environment Files

### Local Development

For local development, copy `.env.local` to your project root and modify as needed. This file should not be committed to source control as it contains secrets.

```bash
# Start the application in local development mode
npm run dev
```

### Development Environment

For the development environment, the setup will use `.env.development` and `.env.development.local`. You should create `.env.development.local` with your secrets and ensure it is not committed to source control.

```bash
# Start the application in development mode
NODE_ENV=development npm run start
```

### Staging Environment

For the staging environment, the setup will use `.env.staging` and `.env.staging.local`.

```bash
# Start the application in staging mode
NODE_ENV=staging npm run start
```

### Production Environment

For the production environment, the setup will use `.env.production` and `.env.production.local`. In a real production environment, you should use a proper secrets management service instead of `.env.production.local`.

```bash
# Start the application in production mode
NODE_ENV=production npm run start
```

## Using Command Line Arguments

You can also override environment variables using command line arguments with the setup-keycloak-cli.js script:

```bash
# Run the Keycloak setup with command line arguments
node scripts/setup-keycloak-cli.js --realm=custom-realm --client-id=custom-client
```

## Configuration Details

### OpenSearch Configuration

The application uses OpenSearch for storing and querying test results. The following environment variables configure the OpenSearch client:

#### Required Variables

- `OPENSEARCH_HOST`: The URL of the OpenSearch server (e.g., `http://localhost:9200`)
- `OPENSEARCH_USERNAME`: The username for authentication
- `OPENSEARCH_PASSWORD`: The password for authentication

#### Optional Variables

- `OPENSEARCH_SSL_VERIFY`: Whether to verify SSL certificates (`true` or `false`, default: `false`)
- `OPENSEARCH_TEST_RESULTS_INDEX`: The name of the index for test results (default: `test-results`)

### Environment-Specific Configuration

Each environment has specific configuration values for OpenSearch:

- **Local**: Uses `http://localhost:9200` with `admin`/`admin` credentials
- **Development**: Uses `http://opensearch-dev.example.com` with secure credentials in `.env.development.local`
- **Staging**: Uses `https://opensearch-stage.example.com` with secure credentials in `.env.staging.local`
- **Production**: Uses `https://opensearch.example.com` with secure credentials in `.env.production.local`

## Security Considerations

- Never commit `.env.*.local` files to source control
- In production, use a proper secrets management service
- Regularly rotate passwords and secrets
- Use strong, unique passwords for each environment
- Always use SSL in production environments
- Set `OPENSEARCH_SSL_VERIFY=true` in production to validate SSL certificates
