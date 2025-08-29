import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page object representing the dashboard page
 */
export class DashboardPage extends BasePage {
  readonly contentSection: Locator;
  readonly adminActionsSection: Locator;
  readonly manageUsersButton: Locator;
  readonly manageTeamsButton: Locator;

  constructor(page: Page) {
    super(page);
    this.contentSection = page.locator('#main-content');
    this.adminActionsSection = page.locator('#admin-actions-section');
    this.manageUsersButton = page.locator('#manage-users-button');
    this.manageTeamsButton = page.locator('#manage-teams-button');
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
   * Check if admin actions are available (manage users/teams buttons)
   * This should only be visible for owner roles
   */
  async expectAdminPermissions() {
    await expect(this.adminActionsSection).toBeVisible();
    await expect(this.manageUsersButton).toBeVisible();
    await expect(this.manageTeamsButton).toBeVisible();
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
