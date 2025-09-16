import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Ensure required environment variables are available
  env: {
    NEXT_PUBLIC_APP_BASE_URL: process.env.NEXT_PUBLIC_APP_BASE_URL || 'http://localhost:3000',
  },
  eslint: {
    dirs: ['src', 'pages', 'tests'], // Include tests directory for linting
  },
  // Configure development behavior
  experimental: {
    // Disable overlay in development to prevent test interference
    appDocumentPreloading: false,
  },
  // Disable various development features that can interfere with testing
  compiler: {
    // Remove development-only code that might interfere with tests
    removeConsole: process.env.NODE_ENV === 'production',
  },
};

export default nextConfig;
