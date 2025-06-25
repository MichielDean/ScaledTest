import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page object representing the test results dashboard page
 */
export class TestResultsDashboardPage extends BasePage {
  readonly pageTitle: Locator;
  readonly chartsContainer: Locator;
  readonly loadingIndicator: Locator;

  constructor(page: Page) {
    super(page);
    this.pageTitle = page.locator('#test-results-title');
    this.chartsContainer = page.locator('#charts-container');
    this.loadingIndicator = page.locator('#loading-indicator');
  }

  /**
   * Navigate to the test results dashboard page
   */
  async goto() {
    await super.goto('/test-results-dashboard');
  }

  /**
   * Wait for the page to be fully loaded
   */
  async waitForPageToLoad() {
    await this.waitForPageLoad(1500);
  }

  /**
   * Check if the page is loaded properly
   */
  async expectPageLoaded() {
    await this.page.waitForSelector('#test-results-container', { state: 'visible' });
  }
}
