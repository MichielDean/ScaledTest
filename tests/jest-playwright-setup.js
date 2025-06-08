/**
 * Jest setup file that provides Playwright globals
 * This replaces jest-playwright-preset with a simplified implementation
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { chromium } = require('playwright');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');

// Deep merge utility function
function deepMerge(target, source) {
  const result = { ...target };

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
  }

  return result;
}

// Load configuration
function loadConfig() {
  const configPath = path.resolve(process.cwd(), 'jest-playwright.config.js');

  // Default configuration
  const defaultConfig = {
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
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const userConfig = require(configPath);
      return deepMerge(defaultConfig, userConfig);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Failed to load jest-playwright config, using defaults:', error.message);
    }
  }

  return defaultConfig;
}

// Global setup function to run before each test file
const setupPlaywright = async () => {
  const config = loadConfig();

  // Launch browser
  global.browser = await chromium.launch({
    ...config.launchOptions,
  });

  // Create context
  global.context = await global.browser.newContext({
    ...config.contextOptions,
  });

  // Create page
  global.page = await global.context.newPage();

  // Set additional globals
  global.browserName = 'chromium';
  global.deviceName = null;

  // Add helper functions that some tests might expect
  global.jestPlaywright = {
    resetPage: async () => {
      if (global.page) {
        await global.page.close();
      }
      global.page = await global.context.newPage();
    },
    resetContext: async (newOptions = {}) => {
      if (global.context) {
        await global.context.close();
      }
      global.context = await global.browser.newContext({
        ...config.contextOptions,
        ...newOptions,
      });
      global.page = await global.context.newPage();
    },
    resetBrowser: async (newOptions = {}) => {
      if (global.browser) {
        await global.browser.close();
      }
      global.browser = await chromium.launch({
        ...config.launchOptions,
      });
      global.context = await global.browser.newContext({
        ...config.contextOptions,
        ...newOptions,
      });
      global.page = await global.context.newPage();
    },
  };
};

// Global teardown function to run after each test file
const teardownPlaywright = async () => {
  // Clean up Playwright resources
  if (global.page) {
    await global.page.close().catch(() => {});
  }
  if (global.context) {
    await global.context.close().catch(() => {});
  }
  if (global.browser) {
    await global.browser.close().catch(() => {});
  }
};

// Setup before each test file
// eslint-disable-next-line no-undef
beforeAll(async () => {
  await setupPlaywright();
});

// Teardown after each test file
// eslint-disable-next-line no-undef
afterAll(async () => {
  await teardownPlaywright();
});

// Setup before each test
// eslint-disable-next-line no-undef
beforeEach(async () => {
  // Reset page for each test to ensure clean state
  if (global.jestPlaywright && global.jestPlaywright.resetPage) {
    await global.jestPlaywright.resetPage();
  }
});
