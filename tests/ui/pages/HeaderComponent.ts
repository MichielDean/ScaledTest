import { Page, Locator, expect } from '@playwright/test';

/**
 * Component object representing the sidebar navigation
 */
export class HeaderComponent {
  readonly page: Page;
  readonly loginLink: Locator;
  readonly registerLink: Locator;
  readonly profileLink: Locator;
  readonly logoutButton: Locator;
  readonly userGreeting: Locator;
  readonly userAvatarButton: Locator;
  readonly dashboardLink: Locator;
  readonly adminLink: Locator;

  constructor(page: Page) {
    this.page = page;
    // Navigation links
    this.loginLink = page.locator('a[href="/login"]');
    this.registerLink = page.locator('a[href="/register"]');
    this.profileLink = page.locator('a[href="/profile"]');

    // Sidebar elements
    this.dashboardLink = page.locator('#headerDashboard');
    this.adminLink = page.locator('#headerAdminUsers'); // Point to the Users admin link directly
    this.logoutButton = page.locator('#headerLogOut');
    this.userGreeting = page.locator('#headerGreeting');

    // User avatar button in sidebar footer - more specific selector
    this.userAvatarButton = page
      .locator('[data-sidebar="footer"] button, [data-sidebar="footer"] [role="button"]')
      .first();
  }

  /**
   * Ensure sidebar is expanded and visible
   */
  private async ensureSidebarExpanded() {
    const sidebarTrigger = this.page.locator('[data-sidebar="trigger"]').first();

    // Wait for sidebar trigger to be available
    await sidebarTrigger.waitFor({ state: 'visible', timeout: 5000 });

    // Check if sidebar is collapsed and expand if needed
    const sidebar = this.page.locator('[data-sidebar="sidebar"]').first();
    const isCollapsed = await sidebar.getAttribute('data-state');
    if (isCollapsed === 'collapsed') {
      await sidebarTrigger.click();
      await this.page.waitForTimeout(500);
    }
  }

  /**
   * Navigate to the dashboard via sidebar
   */
  async navigateToDashboard() {
    await this.ensureSidebarExpanded();
    await this.dashboardLink.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Navigate to the admin dashboard (users management) for users with proper permissions.
   * In the SPA, this is done by expanding the Administration section first, then clicking the Users link.
   */
  async navigateToAdminDashboard(): Promise<void> {
    // In the SPA structure, the Administration section is a collapsible menu
    // We need to expand it first to make the Users link visible
    const administrationSection = this.page.locator('text=Administration').first();

    // Check if the Administration section exists (user has write access)
    await administrationSection.waitFor({ state: 'visible', timeout: 10000 });

    // Click to expand the Administration section if it's not already expanded
    const usersLink = this.page.locator('#headerAdminUsers');
    const isUsersLinkVisible = await usersLink.isVisible();

    if (!isUsersLinkVisible) {
      await administrationSection.click();
      // Wait for the collapsible content to expand
      await this.page.waitForTimeout(500);
    }

    // Now click the Users link
    await usersLink.waitFor({ state: 'visible', timeout: 5000 });
    await usersLink.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Navigate to user management page via sidebar
   */
  async navigateToUserManagement() {
    // This is the same as navigateToAdminDashboard since Users is the default admin page
    await this.navigateToAdminDashboard();
  }

  /**
   * Log out the current user
   */
  async logout() {
    // Open the user dropdown menu in sidebar footer
    await this.userAvatarButton.click();

    // Click logout button in the dropdown
    await this.logoutButton.click();
    await this.page.waitForLoadState('networkidle');

    // Wait for redirect to login page to complete
    await this.page.waitForURL(/\/login/, { timeout: 10000 });
  }

  /**
   * Check if user is logged in by verifying user avatar button is visible in sidebar
   */
  async expectUserLoggedIn() {
    // User avatar button should be visible in sidebar footer
    await expect(this.userAvatarButton).toBeVisible();

    // Open user menu to verify logout option is available
    await this.userAvatarButton.click();
    await expect(this.logoutButton).toBeVisible();

    // Close the menu by pressing escape
    await this.page.keyboard.press('Escape');
  }

  /**
   * Check if user is logged out by verifying we're on the login page or login/register links are visible
   */
  async expectUserLoggedOut() {
    // Check if we're on the login page (which means user was logged out)
    const currentUrl = this.page.url();
    if (currentUrl.includes('/login')) {
      // We're on login page - logout was successful
      await expect(this.page.locator('form')).toBeVisible();
      return;
    }

    // Otherwise check for login/register links (if we're on a different page)
    await expect(this.loginLink).toBeVisible();
    await expect(this.registerLink).toBeVisible();

    // Verify user-specific elements are not visible
    await expect(this.userAvatarButton).not.toBeVisible();
  }

  /**
   * Check if user has admin access by verifying the Administration section is visible in sidebar
   */
  async expectAdminAccess() {
    await this.ensureSidebarExpanded();
    await expect(this.page.locator('button:has-text("Administration")')).toBeVisible();
  }

  /**
   * Check if user does not have admin access
   */
  async expectNoAdminAccess() {
    await this.ensureSidebarExpanded();
    await expect(this.page.locator('button:has-text("Administration")')).not.toBeVisible();
  }
}
