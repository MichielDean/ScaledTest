import { Page } from 'playwright';
import { BasePage } from './BasePage';

export class AdminUsersPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async navigateToAdminUsers(): Promise<void> {
    await this.page.goto(`${this.baseUrl}/admin/users`, { waitUntil: 'load' });

    // Wait a moment for any redirects to complete
    await this.page.waitForTimeout(1000);
  }
  async expectPageLoaded(): Promise<void> {
    // First check if we're on the right URL - the page might have redirected
    const currentUrl = this.page.url();
    if (!currentUrl.includes('/admin/users')) {
      throw new Error(`Expected to be on admin/users page, but current URL is: ${currentUrl}`);
    }

    await this.page.waitForSelector('#main-content', { state: 'visible' });

    // Check if we're seeing a login page instead (indicating auth failure)
    const isLoginPage = await this.page
      .locator('#login-form')
      .isVisible()
      .catch(() => false);
    if (isLoginPage) {
      throw new Error('Redirected to login page - user may not have proper admin permissions');
    }

    // Check if we're seeing an unauthorized page
    const isUnauthorizedPage = await this.page
      .locator('#unauthorized-message')
      .isVisible()
      .catch(() => false);
    if (isUnauthorizedPage) {
      throw new Error('Redirected to unauthorized page - user may not have owner role');
    }

    await this.page.waitForSelector('#page-title', { state: 'visible' });

    // Verify we're on the correct page
    const title = await this.page.textContent('#page-title');
    if (title !== 'User Management') {
      throw new Error(`Expected 'User Management' title, got: ${title}`);
    }
  }

  async isUsersTableVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector('#users-table', { state: 'visible', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async getErrorMessage(): Promise<string | null> {
    try {
      const errorElement = await this.page.locator('#error-message');
      if (await errorElement.isVisible()) {
        return await errorElement.textContent();
      }
    } catch {
      // Error element might not exist
    }
    return null;
  }

  async getSuccessMessage(): Promise<string | null> {
    try {
      const successElement = await this.page.locator('#success-message');
      if (await successElement.isVisible()) {
        return await successElement.textContent();
      }
    } catch {
      // Success element might not exist
    }
    return null;
  }
}
