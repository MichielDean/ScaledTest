#!/usr/bin/env node
/**
 * ScaledTest Jest Test Execution Script
 *
 * Executes a single test and uploads results to ScaledTest platform via CTRF.
 * Supports both command-line and environment variable configuration.
 */

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

// Configuration from environment or command line
const TEST_ID = process.env.TEST_ID || getArgValue("--test-id");
const PLATFORM_API_URL = process.env.PLATFORM_API_URL;
const JOB_AUTH_TOKEN = process.env.JOB_AUTH_TOKEN;
const ARTIFACT_PATH = process.env.ARTIFACT_PATH || "/test-artifacts";
const PROJECT_ID = process.env.PROJECT_ID;
const JOB_COMPLETION_INDEX = process.env.JOB_COMPLETION_INDEX || "0";
const TEST_TIMEOUT = process.env.TEST_TIMEOUT || "30000";
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || "/app";

/**
 * Get command line argument value
 */
function getArgValue(flag) {
  const arg = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (arg) return arg.split("=")[1];

  const index = process.argv.indexOf(flag);
  if (index !== -1 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }

  return null;
}

/**
 * Show usage information
 */
function showHelp() {
  console.log(`
ScaledTest Jest Runner - Single Test Execution

Usage:
  /app/run-test --test-id "<test-id>"
  
  Or set environment variable:
  TEST_ID="<test-id>" /app/run-test

Required Environment Variables:
  TEST_ID              - Test identifier from discovery (e.g., "tests/auth.test.js::Login::should succeed")
  PLATFORM_API_URL     - ScaledTest API URL (e.g., "https://api.scaledtest.io")
  JOB_AUTH_TOKEN       - JWT token for uploading results
  PROJECT_ID           - Project UUID

Optional Environment Variables:
  ARTIFACT_PATH        - Directory for artifacts (default: /test-artifacts)
  JOB_COMPLETION_INDEX - K8s Job index (default: 0)
  TEST_TIMEOUT         - Test timeout in ms (default: 30000)
  WORKSPACE_DIR        - Working directory (default: /app)

Examples:
  # Run single test
  /app/run-test --test-id "auth/login.test.js::Login Flow::should authenticate"
  
  # With environment variables
  export TEST_ID="auth/login.test.js::should work"
  export PLATFORM_API_URL="https://api.scaledtest.io"
  export JOB_AUTH_TOKEN="eyJhbGc..."
  /app/run-test

Exit Codes:
  0  - Test passed
  1  - Test failed
  2  - Configuration error
`);
}

/**
 * Validate configuration
 */
function validateConfig() {
  if (!TEST_ID) {
    console.error("Error: TEST_ID is required");
    showHelp();
    process.exit(2);
  }

  if (!PLATFORM_API_URL) {
    console.error("Error: PLATFORM_API_URL environment variable is required");
    process.exit(2);
  }

  if (!JOB_AUTH_TOKEN) {
    console.error("Error: JOB_AUTH_TOKEN environment variable is required");
    process.exit(2);
  }

  if (!PROJECT_ID) {
    console.error("Error: PROJECT_ID environment variable is required");
    process.exit(2);
  }

  // Ensure artifact directory exists
  if (!fs.existsSync(ARTIFACT_PATH)) {
    try {
      fs.mkdirSync(ARTIFACT_PATH, { recursive: true });
    } catch (error) {
      console.error(
        `Error creating artifact directory ${ARTIFACT_PATH}:`,
        error.message,
      );
      process.exit(2);
    }
  }
}

/**
 * Parse test ID to extract file and test name pattern
 * Format: "file/path.test.js::Suite Name::test name"
 */
function parseTestId(testId) {
  const parts = testId.split("::");

  if (parts.length < 1) {
    throw new Error(`Invalid TEST_ID format: ${testId}`);
  }

  const file = parts[0];
  const testPattern = parts.slice(1).join(".*"); // Create regex pattern

  return { file, testPattern };
}

/**
 * Execute Jest test
 */
function runTest() {
  try {
    const { file, testPattern } = parseTestId(TEST_ID);

    console.log("=".repeat(60));
    console.log("ScaledTest Jest Runner");
    console.log("=".repeat(60));
    console.log(`Test ID:       ${TEST_ID}`);
    console.log(`File:          ${file}`);
    console.log(`Pattern:       ${testPattern}`);
    console.log(`Artifact Path: ${ARTIFACT_PATH}`);
    console.log(`Job Index:     ${JOB_COMPLETION_INDEX}`);
    console.log("=".repeat(60));
    console.log("");

    // Build Jest command
    const jestArgs = [
      "jest",
      file,
      "--testTimeout",
      TEST_TIMEOUT,
      "--reporters",
      path.join(__dirname, "../reporters/ctrf-stream-reporter.js"),
      "--runInBand", // Run tests serially
      "--no-coverage", // Disable coverage for single test runs
      "--verbose",
    ];

    // Add test name pattern if suite/test name provided
    if (testPattern) {
      jestArgs.push("--testNamePattern", testPattern);
    }

    // Spawn Jest process
    const jest = spawn("npx", jestArgs, {
      cwd: WORKSPACE_DIR,
      env: {
        ...process.env,
        NODE_ENV: "test",
        FORCE_COLOR: "1", // Enable colored output
        CI: "true", // Consistent behavior in CI
      },
      stdio: "inherit",
    });

    // Handle process termination
    jest.on("error", (error) => {
      console.error("Failed to start Jest:", error.message);
      process.exit(2);
    });

    jest.on("exit", (code) => {
      console.log("");
      console.log("=".repeat(60));
      console.log(`Jest exited with code: ${code}`);
      console.log("=".repeat(60));

      // Exit with same code as Jest
      process.exit(code || 0);
    });

    // Handle signals
    process.on("SIGTERM", () => {
      console.log("Received SIGTERM, terminating Jest...");
      jest.kill("SIGTERM");
    });

    process.on("SIGINT", () => {
      console.log("Received SIGINT, terminating Jest...");
      jest.kill("SIGINT");
    });
  } catch (error) {
    console.error("Test execution failed:", error.message);
    console.error(error.stack);
    process.exit(2);
  }
}

// Main execution
if (require.main === module) {
  // Check for help flag
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    showHelp();
    process.exit(0);
  }

  // Validate and run
  validateConfig();
  runTest();
}

module.exports = { runTest, parseTestId };
