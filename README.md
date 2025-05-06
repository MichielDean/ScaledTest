# Next.js Keycloak Authentication Demo

A complete Next.js application with Keycloak integration for Role-Based Access Control (RBAC).

## Features

- Next.js and TypeScript
- Keycloak authentication with RBAC
- Docker-based Keycloak setup for local development
- Three user roles:
  - Read-only: Can only view content
  - Maintainer: Can view and edit some content
  - Owner: Has full access to all features

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
NEXT_PUBLIC_KEYCLOAK_URL=http://localhost:8080
NEXT_PUBLIC_KEYCLOAK_REALM=scaledtest4
NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=scaledtest4-client
NEXT_PUBLIC_APP_BASE_URL=http://localhost:3000
```

## Running the Application

You can start the application with all dependencies using the included PowerShell script:

```bash
./start-app.ps1
```

This script will:
1. Check if Docker is running
2. Start the Keycloak container with PostgreSQL
3. Set up the Keycloak realm, client, roles, and test users
4. Start the Next.js application

Alternatively, you can run the individual commands:

1. Start Keycloak using Docker Compose:

```bash
docker-compose -f docker/docker-compose.yml up -d
```

2. Set up Keycloak with the required realm, client, roles, and test users:

```bash
node scripts/setup-keycloak.js
```

3. Start the Next.js application:

```bash
npm run start
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
docker-compose -f docker/docker-compose.yml up -d
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