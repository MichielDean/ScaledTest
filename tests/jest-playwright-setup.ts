/**
 * Jest setup file that provides Playwright globals
 * This replaces jest-playwright-preset with a simplified implementation
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import { testLogger } from '../src/logging/logger';

// Define globals with TypeScript for Node.js environment
// Note: Namespace is required for global type augmentation in Jest/Playwright setup
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface Global {
      browser: Browser;
      context: BrowserContext;
      page: Page;
      browserName: string;
      deviceName: string | null;
      jestPlaywright: {
        resetPage: () => Promise<void>;
        resetContext: (newOptions?: Record<string, unknown>) => Promise<void>;
        resetBrowser: (newOptions?: Record<string, unknown>) => Promise<void>;
      };
      beforeAll: (fn: () => Promise<void>) => void;
      afterAll: (fn: () => Promise<void>) => void;
      beforeEach: (fn: () => Promise<void>) => void;
    }
  }
}

// Configuration interfaces
interface ContextOptions {
  viewport?: {
    width: number;
    height: number;
  };
  [key: string]: unknown;
}

interface LaunchOptions {
  headless?: boolean;
  [key: string]: unknown;
}

interface PlaywrightConfig {
  browsers: string[];
  launchOptions: LaunchOptions;
  contextOptions: ContextOptions;
}

// Global config instance
let globalConfig: PlaywrightConfig;

// Load configuration
async function loadConfig(): Promise<PlaywrightConfig> {
  const configPath = path.resolve(process.cwd(), 'jest-playwright.config.js');

  // Default configuration
  const defaultConfig: PlaywrightConfig = {
    browsers: ['chromium'],
    launchOptions: {
      headless: true,
    },
    contextOptions: {
      viewport: { width: 1920, height: 1080 },
    },
  };

  if (fs.existsSync(configPath)) {
    try {
      // Use dynamic import for config file loading
      const userConfig = await import(configPath);
      const configData = userConfig.default || userConfig;
      // Create a merged config by manually applying properties to ensure type safety
      const mergedConfig = { ...defaultConfig };

      if (configData.browsers) mergedConfig.browsers = configData.browsers;
      if (configData.launchOptions)
        mergedConfig.launchOptions = {
          ...defaultConfig.launchOptions,
          ...configData.launchOptions,
        };
      if (configData.contextOptions)
        mergedConfig.contextOptions = {
          ...defaultConfig.contextOptions,
          ...configData.contextOptions,
        };

      return mergedConfig;
    } catch (error) {
      testLogger.warn({ error }, 'Failed to load jest-playwright config, using defaults:');
    }
  }

  return defaultConfig;
}

// Global setup function to run before each test file
const setupPlaywright = async (): Promise<void> => {
  globalConfig = await loadConfig();

  // Launch browser
  (global as unknown as NodeJS.Global).browser = await chromium.launch({
    ...globalConfig.launchOptions,
  });

  (global as unknown as NodeJS.Global).context = await (
    global as unknown as NodeJS.Global
  ).browser.newContext({
    ...globalConfig.contextOptions,
  });

  (global as unknown as NodeJS.Global).page = await (
    global as unknown as NodeJS.Global
  ).context.newPage();

  (global as unknown as NodeJS.Global).browserName = 'chromium';
  (global as unknown as NodeJS.Global).deviceName = null;

  // Add helper functions that some tests might expect
  (global as unknown as NodeJS.Global).jestPlaywright = {
    resetPage: async (): Promise<void> => {
      try {
        if ((global as unknown as NodeJS.Global).page) {
          await (global as unknown as NodeJS.Global).page.close().catch(() => {});
        }
        (global as unknown as NodeJS.Global).page = await (
          global as unknown as NodeJS.Global
        ).context.newPage();
      } catch (error) {
        testLogger.warn({ error }, 'Error resetting page:');
        // Fallback: recreate the entire context
        await (global as unknown as NodeJS.Global).jestPlaywright.resetContext();
      }
    },
    resetContext: async (newOptions = {}): Promise<void> => {
      try {
        if ((global as unknown as NodeJS.Global).context) {
          await (global as unknown as NodeJS.Global).context.close().catch(() => {});
        }
        (global as unknown as NodeJS.Global).context = await (
          global as unknown as NodeJS.Global
        ).browser.newContext({
          ...globalConfig.contextOptions,
          ...newOptions,
        });
        (global as unknown as NodeJS.Global).page = await (
          global as unknown as NodeJS.Global
        ).context.newPage();
      } catch (error) {
        testLogger.warn({ error }, 'Error resetting context:');
        // Fallback: recreate the entire browser
        await (global as unknown as NodeJS.Global).jestPlaywright.resetBrowser(newOptions);
      }
    },
    resetBrowser: async (newOptions = {}): Promise<void> => {
      try {
        if ((global as unknown as NodeJS.Global).browser) {
          await (global as unknown as NodeJS.Global).browser.close().catch(() => {});
        }
        (global as unknown as NodeJS.Global).browser = await chromium.launch({
          ...globalConfig.launchOptions,
        });
        (global as unknown as NodeJS.Global).context = await (
          global as unknown as NodeJS.Global
        ).browser.newContext({
          ...globalConfig.contextOptions,
          ...newOptions,
        });
        (global as unknown as NodeJS.Global).page = await (
          global as unknown as NodeJS.Global
        ).context.newPage();
      } catch (error) {
        testLogger.error({ error }, 'Error resetting browser:');
        throw error;
      }
    },
  };
};

// Global teardown function to run after each test file
const teardownPlaywright = async (): Promise<void> => {
  // Clean up Playwright resources
  try {
    if ((global as unknown as NodeJS.Global).page) {
      await (global as unknown as NodeJS.Global).page.close().catch(() => {});
    }
  } catch (error) {
    testLogger.warn({ error }, 'Error closing page:');
  }

  try {
    if ((global as unknown as NodeJS.Global).context) {
      await (global as unknown as NodeJS.Global).context.close().catch(() => {});
    }
  } catch (error) {
    testLogger.warn({ error }, 'Error closing context:');
  }

  try {
    if ((global as unknown as NodeJS.Global).browser) {
      await (global as unknown as NodeJS.Global).browser.close().catch(() => {});
    }
  } catch (error) {
    testLogger.warn({ error }, 'Error closing browser:');
  }

  // Clear globals
  (global as unknown as NodeJS.Global).page = null as unknown as Page;
  (global as unknown as NodeJS.Global).context = null as unknown as BrowserContext;
  (global as unknown as NodeJS.Global).browser = null as unknown as Browser;
};

(global as unknown as NodeJS.Global).beforeAll(async () => {
  await setupPlaywright();
});

// Teardown after each test file
(global as unknown as NodeJS.Global).afterAll(async () => {
  await teardownPlaywright();
});

(global as unknown as NodeJS.Global).beforeEach(async () => {
  // Reset page for each test to ensure clean state
  try {
    // Check if jestPlaywright is available before calling resetPage
    await (global as unknown as NodeJS.Global).jestPlaywright.resetPage();
  } catch (error) {
    testLogger.warn({ error }, 'Error in beforeEach reset:');
    // Try to reinitialize if reset fails
    try {
      await setupPlaywright();
    } catch (setupError) {
      testLogger.error({ error: setupError }, 'Failed to reinitialize Playwright in beforeEach:');
      throw setupError;
    }
  }
});
