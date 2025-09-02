import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { testLogger } from '../../../src/logging/testLogger';

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
    // First, wait for the table to be visible
    await expect(this.usersTable).toBeVisible();

    // Wait for any loading indicators to disappear
    await this.page.waitForFunction(
      () => {
        const loadingElements = document.querySelectorAll(
          '.loading, .skeleton, [data-loading="true"]'
        );
        return loadingElements.length === 0;
      },
      { timeout: 15000 }
    );

    // Wait a bit more for data to load
    await this.page.waitForTimeout(2000);

    // Add debugging to see console logs
    this.page.on('console', msg => {
      testLogger.info(`Browser console: ${msg.text()}`);
    });

    // Wait for the page to finish loading and API calls to complete
    await this.page.waitForLoadState('networkidle');

    // Check if the table body exists and is visible
    const tableBody = this.page.locator('#users-table tbody');
    await expect(tableBody).toBeVisible();

    // Wait for at least one row to appear or timeout after 10 seconds
    await this.page
      .waitForFunction(
        () => {
          const rows = document.querySelectorAll('#users-table tbody tr');
          return rows.length > 0;
        },
        { timeout: 10000 }
      )
      .catch(() => {
        // If no rows appear, we'll handle it below
      });

    // Check the row count
    const rowCount = await this.page.locator('#users-table tbody tr').count();
    testLogger.info(`Found ${rowCount} rows in users table`);

    if (rowCount === 0) {
      // Check for error messages
      const errorElements = await this.page.locator('.error, [role="alert"], .alert').all();
      for (let i = 0; i < errorElements.length; i++) {
        const errorText = await errorElements[i].textContent();
        if (errorText) {
          testLogger.info(`Error message found: ${errorText}`);
        }
      }

      // Log the current page state for debugging
      const pageTitle = await this.page.title();
      const currentUrl = this.page.url();
      testLogger.info(`Page title: ${pageTitle}, URL: ${currentUrl}`);

      throw new Error('No rows found in users table after waiting');
    }

    // Get all table rows and log their content for debugging
    const rows = await this.page.locator('#users-table tbody tr').all();

    for (let i = 0; i < rows.length; i++) {
      const rowText = await rows[i].textContent();
      testLogger.info(`Row ${i}: ${rowText}`);
    }

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
