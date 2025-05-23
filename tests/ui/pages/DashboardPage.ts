import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page object representing the dashboard page
 */
export class DashboardPage extends BasePage {
  readonly userProfileSection: Locator;
  readonly contentSection: Locator;
  readonly adminActionsSection: Locator;
  readonly editContentButton: Locator;
  readonly userRolesList: Locator;

  constructor(page: Page) {
    super(page);
    this.userProfileSection = page.locator('#user-profile-section');
    this.contentSection = page.locator('#content-section');
    this.adminActionsSection = page.locator('#admin-actions-section');
    this.editContentButton = page.locator('#edit-content-button');
    this.userRolesList = page.locator('#user-roles-list');
  }

  /**
   * Navigate to the dashboard page
   */
  async goto() {
    await super.goto('/dashboard');
  }

  /**
   * Check if the dashboard has loaded properly
   */
  async expectDashboardLoaded() {
    await expect(this.userProfileSection).toBeVisible();
    await expect(this.contentSection).toBeVisible();
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
  /**
   * Check if a specific role is displayed in the user profile
   */
  async expectHasRole(role: string) {
    // Use the user-roles-list element and look for a role-specific ID element
    const formattedRole = role.toLowerCase().replace('-', '');
    const roleLocator = this.page.locator(`#role-${formattedRole}`);
    await expect(roleLocator).toBeVisible();
  }
}
