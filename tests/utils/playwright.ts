/**
 * Playwright test utilities
 * Provides functions for setting up Playwright in UI tests
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { beforeAll, afterAll, beforeEach } from '@jest/globals';
import { testLogger } from '../../src/logging/logger';

// Playwright configuration
const PLAYWRIGHT_CONFIG = {
  launchOptions: {
    headless: true,
    slowMo: 0,
  },
  contextOptions: {
    ignoreHTTPSErrors: true,
    viewport: { width: 1920, height: 1080 },
  },
} as const;

/**
 * Playwright test context interface
 */
export interface PlaywrightTestContext {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

/**
 * Set up Playwright for a test suite
 * Call this function in your describe block to get automatic Playwright setup
 * Returns an object with browser, context, and page instances
 */
export function setupPlaywright(): PlaywrightTestContext {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  beforeAll(async () => {
    try {
      browser = await chromium.launch(PLAYWRIGHT_CONFIG.launchOptions);
      context = await browser.newContext(PLAYWRIGHT_CONFIG.contextOptions);
      page = await context.newPage();
    } catch (error) {
      testLogger.error('Failed to setup Playwright', {
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  });

  afterAll(async () => {
    try {
      if (page && !page.isClosed()) {
        await page.close();
      }

      if (context) {
        await context.close();
      }

      if (browser) {
        await browser.close();
      }
    } catch (error) {
      testLogger.warn('Error during Playwright teardown', {
        error: error instanceof Error ? error.message : error,
      });
    }
  });

  beforeEach(async () => {
    // Only reset if the page is closed or context is invalid
    try {
      if (!page || page.isClosed()) {
        if (context) {
          page = await context.newPage();
        }
      }
    } catch (error) {
      testLogger.warn('Error checking page state, recreating page', {
        error: error instanceof Error ? error.message : error,
      });
      // If page check fails, try to reset context
      try {
        if (context) {
          await context.close();
        }
        context = await browser.newContext(PLAYWRIGHT_CONFIG.contextOptions);
        page = await context.newPage();
      } catch (contextError) {
        testLogger.warn('Context reset also failed, recreating browser', {
          error: contextError instanceof Error ? contextError.message : contextError,
        });
        // Only recreate browser as last resort
        if (browser) {
          await browser.close().catch(() => {});
        }
        browser = await chromium.launch(PLAYWRIGHT_CONFIG.launchOptions);
        context = await browser.newContext(PLAYWRIGHT_CONFIG.contextOptions);
        page = await context.newPage();
      }
    }
  });

  // Return the context object with getters to ensure proper initialization timing
  const context_obj: PlaywrightTestContext = {
    get browser() {
      if (!browser) {
        throw new Error(
          'Browser not initialized. Make sure setupPlaywright is called in a describe block.'
        );
      }
      return browser;
    },
    get context() {
      if (!context) {
        throw new Error(
          'Browser context not initialized. Make sure setupPlaywright is called in a describe block.'
        );
      }
      return context;
    },
    get page() {
      if (!page) {
        throw new Error(
          'Page not initialized. Make sure setupPlaywright is called in a describe block.'
        );
      }
      return page;
    },
  };

  return context_obj;
}
