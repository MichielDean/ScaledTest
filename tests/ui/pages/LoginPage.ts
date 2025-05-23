import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { TestUser } from '../models/TestUsers';

/**
 * Page object representing the login page
 */
export class LoginPage extends BasePage {
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;
  readonly errorMessage: Locator;
  readonly logoutButton: Locator;
  constructor(page: Page) {
    super(page);
    this.usernameInput = page.locator('#username');
    this.passwordInput = page.locator('#password');
    this.signInButton = page.locator('#signInButton');
    this.errorMessage = page.locator('#loginError');
    this.logoutButton = page.locator('#headerLogOut');
  }

  /**
   * Navigate to the login page
   */
  async goto() {
    await super.goto('/login');
  }
  /**
   * Log in with the provided credentials
   */
  async login(username: string, password: string) {
    // Wait for the username input to be visible and ready
    await this.usernameInput.waitFor({ state: 'visible', timeout: 10000 });
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.signInButton.click();
    // Wait for navigation to complete
    await this.waitForNavigation();
  }

  /**
   * Verify that the login error message is displayed
   */
  async expectLoginError() {
    await expect(this.errorMessage).toBeVisible();
  }
  /**
   * Check if we're on the login page
   */
  async expectToBeOnLoginPage() {
    await expect(this.page).toHaveURL(/\/login/);
    await expect(this.signInButton).toBeVisible();
  }

  /**
   * Login with a TestUser object
   * This replaces the functionality from AuthHelper.login()
   */
  async loginWithUser(user: TestUser) {
    await this.goto();
    await this.login(user.username, user.password);
  }

  /**
   * Logout the current user
   * This replaces the functionality from AuthHelper.logout()
   */
  async logout() {
    try {
      // Try to find logout button in header
      // Check if the button is visible before clicking
      const isLogoutVisible = await this.logoutButton.isVisible().catch(() => false);

      if (isLogoutVisible) {
        // Click with navigation wait and retries
        await Promise.race([
          this.logoutButton.click({ timeout: 5000 }),
          this.page.waitForNavigation({ timeout: 10000 }).catch(() => {}),
        ]);
        await this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      } else {
        // If we're already logged out, make sure we're on the login page
        await this.goto();
      }
    } catch (error) {
      // If any error occurs, try to navigate directly to login page
      await this.goto();
    }
  }
}
