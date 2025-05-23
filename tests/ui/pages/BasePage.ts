import { Page, Locator, expect } from '@playwright/test';

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
    await expect(this.page).toHaveURL(new RegExp(path));
  }

  /**
   * Wait for navigation to complete
   */
  async waitForNavigation() {
    await this.page.waitForLoadState('networkidle');
  }
}
