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
};

export default nextConfig;
