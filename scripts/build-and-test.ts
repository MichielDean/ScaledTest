#!/usr/bin/env tsx

import { execSync } from 'child_process';
import { runBuildWithProgress } from './build';

/**
 * Build and test script that wraps Jest with build process
 *
 * Usage:
 *   tsx scripts/build-and-test.ts                                    # Run all tests
 *   tsx scripts/build-and-test.ts --selectProjects System          # Run system tests only
 *   tsx scripts/build-and-test.ts --selectProjects Integration     # Run integration tests only
 *   tsx scripts/build-and-test.ts --selectProjects Unit           # Run unit tests only
 *   tsx scripts/build-and-test.ts --selectProjects Components     # Run component tests only
 *   tsx scripts/build-and-test.ts --testNamePattern="auth"        # Run tests matching pattern
 *
 * Or use the npm scripts (recommended):
 *   npm run test                    # Run all tests
 *   npm run test:system            # Run system tests only
 *   npm run test:integration       # Run integration tests only
 *   npm run test:unit              # Run unit tests only
 *   npm run test:components        # Run component tests only
 */
async function buildAndTest(args: string[] = []): Promise<void> {
  try {
    // Step 1: Run build with smart progress tracking (progress bar will show the message)
    const { output: buildOutput } = await runBuildWithProgress();

    process.stdout.write('✓ Build completed successfully!\n');

    // Show a concise build summary instead of full output
    const buildLines = buildOutput.split('\n');
    const successLine = buildLines.find(line => line.includes('Compiled successfully'));
    const routeCount = buildLines.filter(line => line.match(/^[├└┌│]/)).length;

    if (successLine && routeCount > 0) {
      process.stdout.write(
        `→ Build Summary: ${successLine.trim()}, ${routeCount} routes generated\n`
      );
    }

    process.stdout.write('→ Running tests...\n');

    // Step 2: Build Jest command with the provided arguments
    let testCommand = 'npx jest';

    // Show which tests we're running based on arguments
    if (args.includes('--selectProjects')) {
      const projectIndex = args.indexOf('--selectProjects');
      if (projectIndex !== -1 && args[projectIndex + 1]) {
        const project = args[projectIndex + 1];
        process.stdout.write(`→ Running ${project.toLowerCase()} tests only...\n`);
      }
    } else if (args.length > 0) {
      process.stdout.write('→ Running tests with custom arguments...\n');
    } else {
      process.stdout.write('→ Running all tests...\n');
    }

    // Add all Jest arguments directly
    if (args.length > 0) {
      testCommand += ` ${args.join(' ')}`;
    }

    execSync(testCommand, { stdio: 'inherit' });
  } catch (error) {
    if (error instanceof Error && 'status' in error) {
      process.stdout.write(`Command failed with exit code ${(error as any).status}\n`);
      process.exit((error as any).status);
    } else {
      process.stdout.write(`Command failed with unknown error: ${error}\n`);
      process.exit(1);
    }
  }
}

// Get arguments from command line
const args = process.argv.slice(2);
buildAndTest(args);
