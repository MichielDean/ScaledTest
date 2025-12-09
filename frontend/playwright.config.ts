import { defineConfig, devices } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Check if we should skip server startup (servers already running)
const skipServerStartup = process.env.SKIP_SERVER_STARTUP === "true";

export default defineConfig({
  testDir: "./tests/ui",
  outputDir: "test-results/playwright",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["html", { open: "never" }],
    ["list"],
    [
      "playwright-ctrf-json-reporter",
      {
        outputFile: "ctrf-report.json",
        outputDir: "test-results",
      },
    ],
  ],
  globalSetup: path.resolve(__dirname, "./tests/global-setup.ts"),
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
  // Only start servers if not skipped
  ...(skipServerStartup
    ? {}
    : {
        webServer: {
          command: "node start-test-servers.js",
          url: "http://localhost:5173",
          reuseExistingServer: !process.env.CI,
          timeout: 300 * 1000, // 5 minutes for Helm deployment and port forwarding
        },
      }),
});
