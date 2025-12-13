import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/ui",
  outputDir: process.env.TEST_RESULTS_DIR || "test-results/playwright",
  fullyParallel: true, // Allow parallel test execution
  forbidOnly: true,
  retries: 0, // No retries in K8s - each job runs once
  // Use PARALLELISM env var or default to 1 for individual test runs
  // For "all" tests, this controls how many tests run in parallel
  workers: parseInt(process.env.PARALLELISM || "1", 10),
  // Global setup runs before tests - idempotent (checks if users exist first)
  // In K8s indexed jobs, each pod runs this but race conditions are handled
  // by the DB (duplicate email returns error, which is caught and ignored)
  globalSetup: "./tests/global-setup.ts",
  reporter: [
    ["list"],
    // CTRF JSON reporter for standardized output
    [
      "playwright-ctrf-json-reporter",
      {
        outputFile: "ctrf-report.json", // Writes to ctrf/ctrf-report.json
        minimal: false,
        testType: "e2e",
        appName: "ScaledTest",
        appVersion: process.env.APP_VERSION || "1.0.0",
        osPlatform: process.platform,
        osRelease: process.env.K8S_NODE_NAME || "unknown",
        osVersion: process.version,
        buildName: process.env.BUILD_NAME || "local",
        buildNumber: process.env.BUILD_NUMBER || "0",
      },
    ],
  ],
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:5173",
    trace: "on",
    screenshot: "on",
    video: "on",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
  // No webServer in K8s mode - tests run against deployed environment
});
