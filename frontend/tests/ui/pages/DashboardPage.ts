import { Page, Locator, expect } from "@playwright/test";
import { BasePage } from "./BasePage";

/**
 * Page object representing the dashboard page
 */
export class DashboardPage extends BasePage {
  readonly contentSection: Locator;
  readonly adminActionsSection: Locator;
  readonly manageUsersButton: Locator;

  constructor(page: Page) {
    super(page);
    this.contentSection = page.locator("#main-content");
    this.adminActionsSection = page.locator("#admin-actions-section");
    this.manageUsersButton = page.locator("#manage-users-button");
  }

  /**
   * Navigate to the dashboard page
   */
  async goto() {
    await super.goto("/dashboard");
  }

  /**
   * Check if the dashboard has loaded properly
   * Updated to check for elements that actually exist on the dashboard page
   */
  async expectDashboardLoaded() {
    // Check for the main content section which should always be visible
    await expect(this.contentSection).toBeVisible();

    // Check for the dashboard title using its ID
    const dashboardTitle = this.page.locator("#dashboard-title");
    await expect(dashboardTitle).toBeVisible();
  }

  /**
   * Check if admin actions are available (manage users button)
   * This should only be visible for owner roles
   */
  async expectAdminPermissions() {
    // Wait a bit for auth state to fully load
    await this.page.waitForTimeout(1000);
    await expect(this.adminActionsSection).toBeVisible({ timeout: 10000 });
    await expect(this.manageUsersButton).toBeVisible();
  }

  /**
   * Check if admin actions are not available
   * This should not be visible for readonly and maintainer roles
   */
  async expectNoAdminPermissions() {
    await expect(this.adminActionsSection).not.toBeVisible();
  }

  /**
   * Check if the admin actions section is visible
   * This should only be visible for owner role
   */
  async expectAdminActionsVisible() {
    // Wait a bit for auth state to fully load
    await this.page.waitForTimeout(1000);
    await expect(this.adminActionsSection).toBeVisible({ timeout: 10000 });
  }

  /**
   * Check if the admin actions section is not visible
   * This should not be visible for readonly and maintainer roles
   */
  async expectAdminActionsNotVisible() {
    await expect(this.adminActionsSection).not.toBeVisible();
  }
}
