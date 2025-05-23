import { Page, Locator, expect } from '@playwright/test';

/**
 * Component object representing the header navigation bar
 */
export class HeaderComponent {
  readonly page: Page;
  readonly homeLink: Locator;
  readonly dashboardLink: Locator;
  readonly loginLink: Locator;
  readonly registerLink: Locator;
  readonly manageUsersLink: Locator;
  readonly logoutButton: Locator;
  readonly userGreeting: Locator;

  constructor(page: Page) {
    this.page = page;
    this.homeLink = page.locator('#headerHome');
    this.dashboardLink = page.locator('#headerDashboard');
    this.loginLink = page.locator('#headerLogin');
    this.registerLink = page.locator('#headerRegister');
    this.manageUsersLink = page.locator('#headerManageUsers');
    this.logoutButton = page.locator('#headerLogOut');
    this.userGreeting = page.locator('#headerGreeting');
  }

  /**
   * Navigate to the dashboard
   */
  async navigateToDashboard() {
    await this.dashboardLink.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Navigate to user management page
   */
  async navigateToUserManagement() {
    await this.manageUsersLink.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Log out the current user
   */
  async logout() {
    await this.logoutButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Check if user is logged in by verifying dashboard link is visible
   */
  async expectUserLoggedIn() {
    await expect(this.dashboardLink).toBeVisible();
    await expect(this.logoutButton).toBeVisible();
    await expect(this.userGreeting).toBeVisible();
  }

  /**
   * Check if user is logged out by verifying login link is visible
   */
  async expectUserLoggedOut() {
    await expect(this.loginLink).toBeVisible();
    await expect(this.registerLink).toBeVisible();
    await expect(this.logoutButton).not.toBeVisible();
  }

  /**
   * Check if user has admin access by verifying the Manage Users link is visible
   */
  async expectAdminAccess() {
    await expect(this.manageUsersLink).toBeVisible();
  }

  /**
   * Check if user does not have admin access
   */
  async expectNoAdminAccess() {
    await expect(this.manageUsersLink).not.toBeVisible();
  }
}
