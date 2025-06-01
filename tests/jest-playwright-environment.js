/**
 * Custom Jest environment that provides Playwright globals
 * This replaces jest-playwright-preset with a simplified implementation
 */
const { chromium } = require('playwright');
const NodeEnvironment =
  require('jest-environment-node').default || require('jest-environment-node');

// Load configuration
function loadConfig() {
  const path = require('path');
  const fs = require('fs');

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
      return { ...defaultConfig, ...userConfig };
    } catch (error) {
      console.warn('Failed to load jest-playwright config, using defaults:', error.message);
    }
  }

  return defaultConfig;
}

class PlaywrightEnvironment extends NodeEnvironment {
  constructor(config, context) {
    super(config, context);
    this.config = loadConfig();
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  async setup() {
    await super.setup();

    // Launch browser
    this.browser = await chromium.launch({
      ...this.config.launchOptions,
    });

    // Create context
    this.context = await this.browser.newContext({
      ...this.config.contextOptions,
    });

    // Create page
    this.page = await this.context.newPage();

    // Set globals that tests expect
    this.global.browser = this.browser;
    this.global.context = this.context;
    this.global.page = this.page;
    this.global.browserName = 'chromium';
    this.global.deviceName = null;

    // Add helper functions that some tests might expect
    this.global.jestPlaywright = {
      resetPage: async () => {
        if (this.page) {
          await this.page.close();
        }
        this.page = await this.context.newPage();
        this.global.page = this.page;
      },
      resetContext: async (newOptions = {}) => {
        if (this.context) {
          await this.context.close();
        }
        this.context = await this.browser.newContext({
          ...this.config.contextOptions,
          ...newOptions,
        });
        this.page = await this.context.newPage();
        this.global.context = this.context;
        this.global.page = this.page;
      },
      resetBrowser: async (newOptions = {}) => {
        if (this.browser) {
          await this.browser.close();
        }
        this.browser = await chromium.launch({
          ...this.config.launchOptions,
        });
        this.context = await this.browser.newContext({
          ...this.config.contextOptions,
          ...newOptions,
        });
        this.page = await this.context.newPage();
        this.global.browser = this.browser;
        this.global.context = this.context;
        this.global.page = this.page;
      },
    };
  }

  async teardown() {
    // Clean up Playwright resources
    if (this.page) {
      await this.page.close().catch(() => {});
    }
    if (this.context) {
      await this.context.close().catch(() => {});
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
    }

    await super.teardown();
  }

  runScript(script) {
    return super.runScript(script);
  }
}

module.exports = PlaywrightEnvironment;
