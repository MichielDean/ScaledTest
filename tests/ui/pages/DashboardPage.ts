import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page object representing the dashboard page
 */
export class DashboardPage extends BasePage {
  readonly contentSection: Locator;
  readonly adminActionsSection: Locator;
  readonly editContentButton: Locator;

  constructor(page: Page) {
    super(page);
    this.contentSection = page.locator('#content-section');
    this.adminActionsSection = page.locator('#admin-actions-section');
    this.editContentButton = page.locator('#edit-content-button');
  }

  /**
   * Navigate to the dashboard page
   */
  async goto() {
    await super.goto('/dashboard');
  }

  /**
   * Check if the dashboard has loaded properly
   * Updated to check for elements that actually exist on the dashboard page
   */
  async expectDashboardLoaded() {
    // Check for the main content section which should always be visible
    await expect(this.contentSection).toBeVisible();

    // Check for the dashboard title using its ID
    const dashboardTitle = this.page.locator('#dashboard-title');
    await expect(dashboardTitle).toBeVisible();
  }

  /**
   * Check if the edit content button is visible
   * This should only be visible for maintainer and owner roles
   */
  async expectEditPermission() {
    await expect(this.editContentButton).toBeVisible();
  }

  /**
   * Check if the edit content button is not visible
   * This should not be visible for readonly role
   */
  async expectNoEditPermission() {
    await expect(this.editContentButton).not.toBeVisible();
  }

  /**
   * Check if the admin actions section is visible
   * This should only be visible for owner role
   */
  async expectAdminActionsVisible() {
    await expect(this.adminActionsSection).toBeVisible();
  }

  /**
   * Check if the admin actions section is not visible
   * This should not be visible for readonly and maintainer roles
   */
  async expectAdminActionsNotVisible() {
    await expect(this.adminActionsSection).not.toBeVisible();
  }
}
