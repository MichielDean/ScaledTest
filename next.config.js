/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Ensure required environment variables are available
  env: {
    NEXT_PUBLIC_KEYCLOAK_URL: process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'http://localhost:8080',
    NEXT_PUBLIC_KEYCLOAK_REALM: process.env.NEXT_PUBLIC_KEYCLOAK_REALM || 'scaledtest',
    NEXT_PUBLIC_KEYCLOAK_CLIENT_ID:
      process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || 'scaledtest-client',
    NEXT_PUBLIC_APP_BASE_URL: process.env.NEXT_PUBLIC_APP_BASE_URL || 'http://localhost:3000',
  },
  eslint: {
    dirs: ['src', 'pages', 'tests'], // Include tests directory for linting
  },
};

module.exports = nextConfig;
