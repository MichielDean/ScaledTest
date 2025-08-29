import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page object for user management functionality
 */
export class UserManagementPage extends BasePage {
  readonly usersTable: Locator;
  readonly tableRows: Locator;
  readonly successMessage: Locator;
  readonly errorMessage: Locator;
  readonly pageTitle: Locator;

  constructor(page: Page) {
    super(page);
    this.usersTable = page.locator('#users-table');
    this.tableRows = page.locator('#users-table tbody tr');
    this.successMessage = page.locator('#success-message');
    this.errorMessage = page.locator('#error-message');
    this.pageTitle = page.locator('#page-title');
  }

  /**
   * Navigate to the admin dashboard (users section)
   */
  async goto() {
    await super.goto('/dashboard?view=admin-users');
  }

  /**
   * Check if the admin dashboard (users section) is loaded properly
   */
  async expectPageLoaded() {
    // Wait for the users section to be visible instead of page title
    const usersTitle = this.page.locator('#admin-users-title');
    await expect(usersTitle).toBeVisible();
    await expect(this.usersTable).toBeVisible();
  }

  /**
   * Check if a specific user is listed in the table
   */
  async expectUserListed(email: string) {
    // Find the row containing the email address in the email column
    const userRow = this.page.locator(`#users-table tbody tr`).filter({
      hasText: email,
    });
    await expect(userRow).toBeVisible();
  }

  /**
   * Get the number of listed users
   */
  async getUserCount(): Promise<number> {
    return await this.tableRows.count();
  }

  /**
   * Check if a specific role is listed for a user
   */
  async expectUserHasRole(username: string, role: string) {
    const userRow = this.page.locator(`#user-row-${username}`);
    const rolesCell = userRow.locator(`#user-role-${role.toLowerCase()}`);
    await expect(rolesCell).toBeVisible();
  }

  /**
   * Check if access denied message is shown when accessing without proper permissions
   */
  async expectAccessDenied() {
    // We expect to stay on the dashboard but see an access denied alert
    await expect(this.page).toHaveURL(/\/dashboard/, { timeout: 5000 });
    // Check for the access denied alert using Shadcn Alert component selector
    const accessDeniedAlert = this.page.locator('[data-slot="alert"]', {
      hasText: "You don't have permission to manage users",
    });
    await expect(accessDeniedAlert).toBeVisible();
  }

  /**
   * Check if access denied message is shown when accessing without proper permissions
   * In the SPA structure, we show access denied messages inline instead of redirecting
   */
  async expectUnauthorizedPage() {
    // In SPA, we expect to stay on the same page but see an access denied alert
    await expect(this.page).toHaveURL(/\/dashboard\?view=admin-users/, { timeout: 10000 });

    // Check for the access denied alert message
    const accessDeniedAlert = this.page.locator('[data-slot="alert"]', {
      hasText: "You don't have permission to manage users",
    });
    await expect(accessDeniedAlert).toBeVisible();
  }
}
