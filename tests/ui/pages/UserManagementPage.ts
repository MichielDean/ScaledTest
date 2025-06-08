import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page object representing the user management page
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
   * Navigate to the user management page
   */
  async goto() {
    await super.goto('/admin/users');
  }
  /**
   * Check if the user management page is loaded properly
   */
  async expectPageLoaded() {
    await expect(this.pageTitle).toBeVisible();
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
  } /**
   * Check if unauthorized page is shown when accessing without proper permissions
   */
  async expectUnauthorizedPage() {
    try {
      // We expect to be redirected to the unauthorized page with a timeout
      await expect(this.page).toHaveURL(/\/unauthorized/, { timeout: 10000 });
      // Check for the unauthorized title which should be present on the unauthorized page
      const unauthorizedTitle = this.page.locator('#unauthorized-title');
      await expect(unauthorizedTitle).toBeVisible();
      // Check for the return button
      const returnButton = this.page.locator('#return-to-previous');
      await expect(returnButton).toBeVisible();
    } catch {
      // If not redirected, check that we're still on the admin page but don't see user data
      // This is an acceptable state for the test as the protection can be done either via
      // redirect or by hiding content
      await expect(this.page).toHaveURL(/\/admin\/users/);
      // Verify we don't see the user table (protection by hiding content)
      await expect(this.usersTable).not.toBeVisible();
    }
  }
}
