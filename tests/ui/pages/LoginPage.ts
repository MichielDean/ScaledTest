import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { TestUser } from '../models/TestUsers';

/**
 * Page object representing the login page
 */
export class LoginPage extends BasePage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;
  readonly errorMessage: Locator;
  readonly logoutButton: Locator;
  constructor(page: Page) {
    super(page);
    this.emailInput = page.locator('#email');
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
  async login(email: string, password: string) {
    // Wait for the username input to be visible and ready
    await this.emailInput.waitFor({ state: 'visible', timeout: 10000 });
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);

    // Make sure the button is enabled before clicking
    await this.signInButton.waitFor({ state: 'visible' });
    await expect(this.signInButton).toBeEnabled();

    // Click the button and immediately wait for navigation or error
    try {
      // Start the click action
      const clickPromise = this.signInButton.click({ timeout: 5000 });

      // Wait for either navigation away from login or error message
      const navigationPromise = Promise.race([
        this.page.waitForURL(url => !url.href.includes('/login'), { timeout: 15000 }),
        this.errorMessage.waitFor({ state: 'visible', timeout: 15000 }),
      ]);

      // Execute click first, then wait for result
      await clickPromise;
      await navigationPromise;
    } catch (error) {
      // If click failed, check if we're still on login page and try to handle the situation
      const currentUrl = this.page.url();
      if (currentUrl.includes('/login')) {
        // We're still on login page, check for error message or try again
        const errorVisible = await this.errorMessage.isVisible().catch(() => false);
        if (!errorVisible) {
          // No error visible, maybe the form is still processing - wait a bit more
          await this.page.waitForTimeout(3000);

          // Check if we navigated during the wait
          const newUrl = this.page.url();
          if (newUrl.includes('/login')) {
            // Still on login, something went wrong
            throw new Error(
              `Login failed: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      }
    }
  }

  /**
   * Verify that the login error message is displayed
   */
  async expectLoginError() {
    await expect(this.errorMessage).toBeVisible({ timeout: 10000 });
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
    await this.login(user.email, user.password);
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
    } catch {
      // If any error occurs, try to navigate directly to login page
      await this.goto();
    }
  }
}
