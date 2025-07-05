#!/usr/bin/env tsx

import { execSync } from 'child_process';
import logger from '../src/logging/logger';

/**
 * Build and test script with explicit error handling and common Jest flags
 */
async function buildAndTest(jestArgs: string[] = []): Promise<void> {
  try {
    // Step 1: Run the build
    logger.info('Starting build process...');
    execSync('npm run build', { stdio: 'inherit' });
    logger.info('Build completed successfully');

    // Step 2: Run tests only if build succeeded
    // Always include common Jest flags for consistent behavior
    const commonJestFlags = ['--forceExit', '--detectOpenHandles'];
    const allJestArgs = [...jestArgs, ...commonJestFlags];
    const jestCommand = ['jest', ...allJestArgs].join(' ');

    logger.info(`Running tests: ${jestCommand}`);
    execSync(jestCommand, { stdio: 'inherit' });
    logger.info('Tests completed successfully');
  } catch (error) {
    if (error instanceof Error && 'status' in error) {
      logger.error(`Command failed with exit code ${(error as any).status}`);
      process.exit((error as any).status);
    } else {
      logger.error('Command failed with unknown error', { error });
      process.exit(1);
    }
  }
}

// Get Jest arguments from command line
const jestArgs = process.argv.slice(2);
buildAndTest(jestArgs);
