/**
 * Jest setup file that provides Playwright globals
 * This replaces jest-playwright-preset with a simplified implementation
 */

const { chromium } = require('playwright');
const path = require('path');
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
      const userConfig = require(configPath);
      return deepMerge(defaultConfig, userConfig);
    } catch (error) {
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

  global.context = await global.browser.newContext({
    ...config.contextOptions,
  });

  global.page = await global.context.newPage();

  global.browserName = 'chromium';
  global.deviceName = null;

  // Add helper functions that some tests might expect
  global.jestPlaywright = {
    resetPage: async () => {
      try {
        if (global.page) {
          await global.page.close().catch(() => {});
        }
        global.page = await global.context.newPage();
      } catch (error) {
        console.warn('Error resetting page:', error.message);
        // Fallback: recreate the entire context
        await global.jestPlaywright.resetContext();
      }
    },
    resetContext: async (newOptions = {}) => {
      try {
        if (global.context) {
          await global.context.close().catch(() => {});
        }
        global.context = await global.browser.newContext({
          ...config.contextOptions,
          ...newOptions,
        });
        global.page = await global.context.newPage();
      } catch (error) {
        console.warn('Error resetting context:', error.message);
        // Fallback: recreate the entire browser
        await global.jestPlaywright.resetBrowser(newOptions);
      }
    },
    resetBrowser: async (newOptions = {}) => {
      try {
        if (global.browser) {
          await global.browser.close().catch(() => {});
        }
        global.browser = await chromium.launch({
          ...config.launchOptions,
        });
        global.context = await global.browser.newContext({
          ...config.contextOptions,
          ...newOptions,
        });
        global.page = await global.context.newPage();
      } catch (error) {
        console.error('Error resetting browser:', error.message);
        throw error;
      }
    },
  };
};

// Global teardown function to run after each test file
const teardownPlaywright = async () => {
  // Clean up Playwright resources
  try {
    if (global.page) {
      await global.page.close().catch(() => {});
    }
  } catch (error) {
    console.warn('Error closing page:', error.message);
  }

  try {
    if (global.context) {
      await global.context.close().catch(() => {});
    }
  } catch (error) {
    console.warn('Error closing context:', error.message);
  }

  try {
    if (global.browser) {
      await global.browser.close().catch(() => {});
    }
  } catch (error) {
    console.warn('Error closing browser:', error.message);
  }

  // Clear globals
  global.page = null;
  global.context = null;
  global.browser = null;
};

global.beforeAll(async () => {
  await setupPlaywright();
});

// Teardown after each test file
global.afterAll(async () => {
  await teardownPlaywright();
});

global.beforeEach(async () => {
  // Reset page for each test to ensure clean state
  try {
    if (global.jestPlaywright && global.jestPlaywright.resetPage) {
      await global.jestPlaywright.resetPage();
    }
  } catch (error) {
    console.warn('Error in beforeEach reset:', error.message);
    // Try to reinitialize if reset fails
    try {
      await setupPlaywright();
    } catch (setupError) {
      console.error('Failed to reinitialize Playwright in beforeEach:', setupError.message);
      throw setupError;
    }
  }
});
