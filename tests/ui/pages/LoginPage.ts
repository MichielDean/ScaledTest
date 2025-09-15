import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { TestUser } from '../models/TestUsers';
import { testLogger } from '@/logging/logger';

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

    // Click the button
    await this.signInButton.click({ timeout: 5000 });

    // Wait for either navigation away from login or error message
    try {
      await Promise.race([
        this.page.waitForURL(url => !url.href.includes('/login'), { timeout: 15000 }),
        this.errorMessage.waitFor({ state: 'visible', timeout: 15000 }),
      ]);
    } catch (error) {
      // If both navigation and error wait failed, check current state
      const currentUrl = this.page.url();
      if (currentUrl.includes('/login')) {
        // Still on login, something went wrong
        throw new Error(`Login failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Attempt login expecting it to fail with an error message
   */
  async loginExpectingError(email: string, password: string) {
    // Fill in credentials
    await this.emailInput.waitFor({ state: 'visible', timeout: 10000 });
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);

    // Click submit button
    await this.signInButton.waitFor({ state: 'visible' });
    await expect(this.signInButton).toBeEnabled();

    // Listen for console errors and logs
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        testLogger.debug(`Browser console error: ${msg.text()}`);
      }
    });

    // Clear any existing error first
    await this.page.evaluate(() => {
      const errorElement = document.getElementById('loginError');
      if (errorElement) {
        errorElement.style.display = 'none';
      }
    });

    // Check if form exists and has proper attributes
    const formInfo = await this.page.evaluate(() => {
      const form = document.querySelector('form');
      return {
        exists: !!form,
        method: form?.getAttribute('method') || 'none',
        action: form?.getAttribute('action') || 'none',
        hasSubmitHandler: form?.onsubmit !== null,
      };
    });
    testLogger.info(`Form info: ${formInfo}`);

    await this.signInButton.click({ timeout: 5000 });

    // Wait a moment for the form submission to process
    await this.page.waitForTimeout(3000);

    // Check if we're still on the login page (form should have prevented navigation)
    const currentUrl = this.page.url();
    testLogger.info(`Current URL after form submission: ${currentUrl}`);

    // Wait specifically for the error message to appear
    await this.errorMessage.waitFor({ state: 'visible', timeout: 15000 });
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
