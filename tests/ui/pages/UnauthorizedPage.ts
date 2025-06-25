import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page object representing the unauthorized page
 */
export class UnauthorizedPage extends BasePage {
  readonly pageTitle: Locator;
  readonly errorMessage: Locator;
  readonly backButton: Locator;

  constructor(page: Page) {
    super(page);
    this.pageTitle = page.locator('#unauthorized-title');
    this.errorMessage = page.locator('#unauthorized-message');
    this.backButton = page.locator('#return-to-previous');
  }

  /**
   * Navigate to the unauthorized page
   */
  async goto() {
    await super.goto('/unauthorized');
  }

  /**
   * Wait for the page to be fully loaded
   */
  async waitForPageToLoad() {
    await this.waitForPageLoad(1000);
  }

  /**
   * Check if the page is loaded properly
   */
  async expectPageLoaded() {
    await this.waitForSelector('#unauthorized-container', { state: 'visible' });
  }
}
