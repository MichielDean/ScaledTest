import { Page, Locator, expect } from "@playwright/test";

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

    // Sidebar navigation elements
    this.dashboardLink = page.locator("#nav-dashboard");
    this.adminLink = page.locator("#nav-admin-users");
    // Logout is in the dropdown menu - need to open it first
    this.logoutButton = page.locator("#dropdown-logout");
    this.userGreeting = page.locator("#headerGreeting");

    // User avatar button in sidebar footer
    this.userAvatarButton = page
      .locator('button:has-text("user"), button:has-text("admin")')
      .first();
  }

  /**
   * Navigate to the dashboard via nav bar
   */
  async navigateToDashboard() {
    await this.dashboardLink.click();
    await this.page.waitForLoadState("networkidle");
  }

  /**
   * Navigate to the admin dashboard (users management) for users with proper permissions.
   */
  async navigateToAdminDashboard(): Promise<void> {
    const adminLink = this.page.locator("#nav-admin-users");
    await adminLink.waitFor({ state: "visible", timeout: 10000 });
    await adminLink.click();
    await this.page.waitForLoadState("networkidle");
  }

  /**
   * Navigate to user management page via nav bar
   */
  async navigateToUserManagement() {
    // This is the same as navigateToAdminDashboard since Users is the default admin page
    await this.navigateToAdminDashboard();
  }

  /**
   * Log out the current user
   */
  async logout() {
    // First, open the user dropdown menu in the sidebar footer
    const userMenuButton = this.page
      .locator('[data-sidebar="menu-button"]')
      .last();
    await userMenuButton.click();

    // Then click the logout button
    await this.logoutButton.click();
    await this.page.waitForLoadState("networkidle");

    // Wait for redirect to login page to complete
    await this.page.waitForURL(/\/login/, { timeout: 10000 });
  }

  /**
   * Check if user is logged in by verifying sidebar is visible
   */
  async expectUserLoggedIn() {
    // Check if sidebar or user menu is visible (indicates user is logged in)
    const sidebar = this.page.locator('[data-sidebar="sidebar"]');
    await expect(sidebar).toBeVisible();
  }

  /**
   * Check if user is logged out by verifying we're on the login page or login/register links are visible
   */
  async expectUserLoggedOut() {
    // Check if we're on the login page (which means user was logged out)
    const currentUrl = this.page.url();
    if (currentUrl.includes("/login")) {
      // We're on login page - logout was successful
      await expect(this.page.locator("form")).toBeVisible();
      return;
    }

    // Otherwise check for login/register links (if we're on a different page)
    await expect(this.loginLink).toBeVisible();
    await expect(this.registerLink).toBeVisible();

    // Verify user-specific elements are not visible
    await expect(this.userAvatarButton).not.toBeVisible();
  }

  /**
   * Check if user has admin access by verifying the Administration section is visible in nav bar
   */
  async expectAdminAccess() {
    // Check if the admin navigation group is visible in the sidebar
    const adminSection = this.page.getByText("Administration").first();
    await expect(adminSection).toBeVisible();
  }

  /**
   * Check if user does not have admin access
   */
  async expectNoAdminAccess() {
    // Admin section should not be visible for non-admin users
    const adminSection = this.page.getByText("Administration").first();
    await expect(adminSection).not.toBeVisible();
  }
}
