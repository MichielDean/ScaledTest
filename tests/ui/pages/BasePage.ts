import { Page, expect } from '@playwright/test';

/**
 * Base page object that all other page objects will extend
 */
export class BasePage {
  readonly page: Page;
  readonly baseUrl: string;

  constructor(page: Page) {
    this.page = page;
    this.baseUrl = 'http://localhost:3000';
  }

  /**
   * Navigate to a specific URL path
   */
  async goto(path: string) {
    await this.page.goto(`${this.baseUrl}${path}`);
  }

  /**
   * Get page title
   */
  async getTitle(): Promise<string> {
    return await this.page.title();
  }

  /**
   * Check if page URL contains a specific path
   */
  async expectUrlToContain(path: string) {
    // Escape the provided path to ensure it's used as a literal in the RegExp
    const escapeForRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await expect(this.page).toHaveURL(new RegExp(escapeForRegExp(path)));
  }

  /**
   * Wait for navigation to complete
   */
  async waitForNavigation() {
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Wait for page to be fully loaded with content visible
   */
  async waitForPageLoad(timeout = 1500) {
    try {
      // Try networkidle but with shorter timeout
      await this.page.waitForLoadState('networkidle', { timeout: 10000 });
    } catch {
      // Fallback to domcontentloaded if networkidle fails
      await this.page.waitForLoadState('domcontentloaded');
    }
    await this.page.waitForSelector('#main-content, main, body', { state: 'visible' });
    await this.page.waitForTimeout(timeout);
  }

  /**
   * Wait for URL to match a pattern
   */
  async waitForURL(pattern: string | RegExp, options?: { timeout?: number }) {
    await this.page.waitForURL(pattern, options);
  }

  /**
   * Press a keyboard key
   */
  async pressKey(key: string) {
    await this.page.keyboard.press(key);
  }

  /**
   * Evaluate JavaScript in the page context
   */
  async evaluate<T>(func: () => T): Promise<T> {
    return await this.page.evaluate(func);
  }

  /**
   * Wait for a function to return truthy value
   */
  async waitForFunction<T>(func: () => T, options?: { timeout?: number }) {
    await this.page.waitForFunction(func, options);
  }

  /**
   * Get the currently focused element
   */
  async getFocusedElement() {
    return this.page.locator(':focus');
  }

  /**
   * Wait for a specified amount of time
   */
  async waitForTimeout(timeout: number) {
    await this.page.waitForTimeout(timeout);
  }

  /**
   * Get a locator for an element
   */
  locator(selector: string) {
    return this.page.locator(selector);
  }

  /**
   * Wait for an element to be visible
   */
  async waitForSelector(
    selector: string,
    options?: { state?: 'visible' | 'hidden' | 'attached' | 'detached' }
  ) {
    if (options) {
      await this.page.waitForSelector(selector, options);
    } else {
      await this.page.waitForSelector(selector);
    }
  }
}
