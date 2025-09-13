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
    await super.goto('/admin/users');
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
   * Expect a user to be listed in the user management table
   */
  async expectUserListed(): Promise<void> {
    testLogger.info('Starting user listing expectation check');

    // Listen for network requests to debug what's happening
    const requests: Array<{ url: string; method: string; status?: number }> = [];
    this.page.on('request', request => {
      const url = request.url();
      if (url.includes('/api/') || url.includes('teams')) {
        requests.push({ url, method: request.method() });
        testLogger.info(`API Request: ${request.method()} ${url}`);
      }
    });

    this.page.on('response', response => {
      const url = response.url();
      if (url.includes('/api/') || url.includes('teams')) {
        const status = response.status();
        testLogger.info(`API Response: ${response.status()} ${url}`);
        // Find matching request and update it
        const req = requests.find(r => r.url === url && !r.status);
        if (req) req.status = status;
      }
    });

    // Wait a moment for any async loading to start
    await this.page.waitForTimeout(1000);

    // Capture any error alerts on the page
    const errorAlert = this.page.locator('[role="alert"]');
    const errorVisible = await errorAlert.isVisible().catch(() => false);

    let errorText = '';
    if (errorVisible) {
      errorText = (await errorAlert.textContent().catch(() => '')) || '';
      testLogger.info(`Error alert visible with text: "${errorText}"`);

      // Also check what's in the actual table area
      const tableHtml = await this.page
        .locator('#users-table')
        .innerHTML()
        .catch(() => 'No users table HTML');
      testLogger.info(`Users table HTML: ${tableHtml.substring(0, 500)}...`);

      // For now, let's continue with the test to see if the table is actually working
      // Only fail if the alert contains an actual error message (not just the page title)
      if (
        errorText &&
        errorText !== 'ScaledTest - Administration - Users' &&
        !errorText.includes('ScaledTest - Administration')
      ) {
        throw new Error(`Actual error loading users: ${errorText}`);
      } else {
        testLogger.info('Alert contains page title, continuing with test...');
      }
    }

    // Debug: check what main content is being rendered
    const mainContentText = await this.page
      .locator('#main-content')
      .textContent()
      .catch(() => 'No main content found');
    testLogger.info(`Main content text: ${mainContentText?.substring(0, 200)}...`);

    // Check for loading skeleton
    const skeleton = this.page.locator('.space-y-4');
    const skeletonVisible = await skeleton.isVisible().catch(() => false);
    testLogger.info(`Loading skeleton visible: ${skeletonVisible}`);

    // Wait for loading to complete (skeleton should disappear or data should load)
    if (skeletonVisible) {
      testLogger.info('Waiting for loading skeleton to disappear...');
      try {
        await this.page.waitForSelector('.space-y-4', { state: 'hidden', timeout: 10000 });
        testLogger.info('Loading skeleton disappeared');
      } catch {
        testLogger.info(
          'Loading skeleton did not disappear within timeout, checking for errors...'
        );
      }
    }

    // Debug: check table body state before expecting it to be visible
    const tableBody = this.page.locator('#users-table tbody');
    const tableBodyExists = (await tableBody.count()) > 0;
    const tableBodyVisible = await tableBody.isVisible();

    testLogger.info(`Table body exists: ${tableBodyExists}, visible: ${tableBodyVisible}`);

    // Log all captured network requests
    testLogger.info(`Network requests captured: ${JSON.stringify(requests, null, 2)}`);

    await expect(tableBody).toBeVisible();

    // Wait for at least one row to appear or timeout after 10 seconds
    await this.page
      .locator('#users-table tbody tr')
      .first()
      .waitFor({ state: 'visible', timeout: 10000 });

    testLogger.info('User table body is visible and contains rows');

    // Additional debugging: Make a direct API call to see what the backend returns
    const apiUrl = `${this.page.url().split('/').slice(0, 3).join('/')}/api/teams?users=true`;
    testLogger.info(`Making direct API call to: ${apiUrl}`);

    try {
      const response = await this.page.evaluate(async url => {
        const res = await fetch(url, {
          method: 'GET',
          credentials: 'include', // Include cookies for authentication
        });
        return {
          status: res.status,
          data: await res.json(),
        };
      }, apiUrl);

      testLogger.info(`Direct API call result: ${JSON.stringify(response, null, 2)}`);
    } catch (error) {
      testLogger.error(`Direct API call failed: ${error}`);
    }
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
    // With the protected admin pages, users are redirected to unauthorized page
    await expect(this.page).toHaveURL(/\/unauthorized/, { timeout: 5000 });
    // Check for the access denied message on the unauthorized page
    const accessDeniedMessage = this.page.locator('text=Access Denied');
    await expect(accessDeniedMessage).toBeVisible();
  }

  /**
   * Check if access denied message is shown when accessing without proper permissions
   * In the protected admin pages, users are redirected to unauthorized page
   */
  async expectUnauthorizedPage() {
    // With the protected admin pages, users are redirected to unauthorized page
    await expect(this.page).toHaveURL(/\/unauthorized/, { timeout: 10000 });

    // Check for the access denied message on the unauthorized page
    const accessDeniedMessage = this.page.locator('text=Access Denied');
    await expect(accessDeniedMessage).toBeVisible();
  }
}
