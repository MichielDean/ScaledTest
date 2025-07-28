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
   * Navigate to the admin dashboard (users section)
   */
  async goto() {
    await super.goto('/admin?section=users');
  }
  /**
   * Check if the admin dashboard (users section) is loaded properly
   */
  async expectPageLoaded() {
    // Wait for the users section to be visible instead of page title
    const usersSection = this.page.locator('#users-section-title');
    await expect(usersSection).toBeVisible();
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
    // We expect to be redirected to the unauthorized page
    await expect(this.page).toHaveURL(/\/unauthorized/, { timeout: 10000 });
    // Check for the unauthorized title which should be present on the unauthorized page
    const unauthorizedTitle = this.page.locator('#unauthorized-title');
    await expect(unauthorizedTitle).toBeVisible();
    // Check for the return button
    const returnButton = this.page.locator('#return-to-previous');
    await expect(returnButton).toBeVisible();
  }
}
