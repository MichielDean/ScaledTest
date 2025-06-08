/**
 * Jest setup file that provides Playwright globals
 * This replaces jest-playwright-preset with a simplified implementation
 */

// CommonJS imports are required in this Jest setup file
const { chromium } = require('playwright'); // eslint-disable-line @typescript-eslint/no-require-imports
const path = require('path'); // eslint-disable-line @typescript-eslint/no-require-imports
const fs = require('fs'); // eslint-disable-line @typescript-eslint/no-require-imports

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
      const userConfig = require(configPath); // eslint-disable-line @typescript-eslint/no-require-imports
      return deepMerge(defaultConfig, userConfig);
    } catch (error) {
      // Console logging is needed for test setup debugging
      console.warn('Failed to load jest-playwright config, using defaults:', error.message); // eslint-disable-line no-console
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
// Jest globals are available in test environment
global.beforeAll(async () => {
  // eslint-disable-line no-undef
  await setupPlaywright();
});

// Teardown after each test file
global.afterAll(async () => {
  // eslint-disable-line no-undef
  await teardownPlaywright();
});

// Setup before each test
global.beforeEach(async () => {
  // eslint-disable-line no-undef
  // Reset page for each test to ensure clean state
  if (global.jestPlaywright && global.jestPlaywright.resetPage) {
    await global.jestPlaywright.resetPage();
  }
});
