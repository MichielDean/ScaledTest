/**
 * Jest setup file that provides Playwright globals
 * This replaces jest-playwright-preset with a simplified implementation
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import { testLogger } from '../src/utils/logger';

// Define globals with TypeScript for Node.js environment
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

// Deep merge utility function - unused but kept for future reference
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>
): T {
  const result = { ...target } as Record<string, unknown>;

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = deepMerge(
          (target[key] as Record<string, unknown>) || {},
          source[key] as Record<string, unknown>
        );
      } else {
        result[key] = source[key];
      }
    }
  }

  return result as T;
}

// Load configuration
function loadConfig(): PlaywrightConfig {
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
      // We need to dynamically import the config file - import() can't be used with variable paths
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const userConfig = require(configPath);
      // Create a merged config by manually applying properties to ensure type safety
      const mergedConfig = { ...defaultConfig };

      if (userConfig.browsers) mergedConfig.browsers = userConfig.browsers;
      if (userConfig.launchOptions)
        mergedConfig.launchOptions = {
          ...defaultConfig.launchOptions,
          ...userConfig.launchOptions,
        };
      if (userConfig.contextOptions)
        mergedConfig.contextOptions = {
          ...defaultConfig.contextOptions,
          ...userConfig.contextOptions,
        };

      return mergedConfig;
    } catch (error) {
      testLogger.warn('Failed to load jest-playwright config, using defaults:', { error });
    }
  }

  return defaultConfig;
}

// Global setup function to run before each test file
const setupPlaywright = async (): Promise<void> => {
  const config = loadConfig();

  // Launch browser
  (global as unknown as NodeJS.Global).browser = await chromium.launch({
    ...config.launchOptions,
  });

  (global as unknown as NodeJS.Global).context = await (
    global as unknown as NodeJS.Global
  ).browser.newContext({
    ...config.contextOptions,
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
        testLogger.warn('Error resetting page:', { error });
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
          ...config.contextOptions,
          ...newOptions,
        });
        (global as unknown as NodeJS.Global).page = await (
          global as unknown as NodeJS.Global
        ).context.newPage();
      } catch (error) {
        testLogger.warn('Error resetting context:', { error });
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
          ...config.launchOptions,
        });
        (global as unknown as NodeJS.Global).context = await (
          global as unknown as NodeJS.Global
        ).browser.newContext({
          ...config.contextOptions,
          ...newOptions,
        });
        (global as unknown as NodeJS.Global).page = await (
          global as unknown as NodeJS.Global
        ).context.newPage();
      } catch (error) {
        testLogger.error('Error resetting browser:', { error });
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
    testLogger.warn('Error closing page:', { error });
  }

  try {
    if ((global as unknown as NodeJS.Global).context) {
      await (global as unknown as NodeJS.Global).context.close().catch(() => {});
    }
  } catch (error) {
    testLogger.warn('Error closing context:', { error });
  }

  try {
    if ((global as unknown as NodeJS.Global).browser) {
      await (global as unknown as NodeJS.Global).browser.close().catch(() => {});
    }
  } catch (error) {
    testLogger.warn('Error closing browser:', { error });
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
    testLogger.warn('Error in beforeEach reset:', { error });
    // Try to reinitialize if reset fails
    try {
      await setupPlaywright();
    } catch (setupError) {
      testLogger.error('Failed to reinitialize Playwright in beforeEach:', { error: setupError });
      throw setupError;
    }
  }
});
