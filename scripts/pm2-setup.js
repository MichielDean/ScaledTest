// This runner is intended to be used by PM2:
// npx pm2 start scripts/dev-runner.js --name scaledtest-dev
import { execSync } from 'child_process';

export async function startNextJsServer() {
  console.log('🚀 Starting Next.js development server...');

  try {
    // Start Docker services first
    console.log('🐳 Starting Docker services...');
    execSync('docker compose -f docker/docker-compose.yml up -d', {
      stdio: 'inherit',
      windowsHide: true,
    });

    // Run migrations
    console.log('🗃️ Running database migrations...');
    execSync('npm run migrate', {
      stdio: 'inherit',
      windowsHide: true,
    });

    // Start Next.js
    console.log('⚡ Starting Next.js development server...');
    execSync('npx next dev', {
      stdio: 'inherit',
      windowsHide: true,
    });
  } catch (error) {
    console.error('❌ Error starting Next.js server:', error.message);
    process.exit(1);
  }
}

startNextJsServer();
