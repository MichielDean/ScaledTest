import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page object representing the registration page
 */
export class RegisterPage extends BasePage {
  readonly emailInput: Locator;
  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly registerButton: Locator;
  readonly errorMessage: Locator;
  readonly loginLink: Locator;

  constructor(page: Page) {
    super(page);
    this.emailInput = page.locator('#email');
    this.firstNameInput = page.locator('#firstName');
    this.lastNameInput = page.locator('#lastName');
    this.passwordInput = page.locator('#password');
    this.confirmPasswordInput = page.locator('#confirmPassword');
    this.registerButton = page.locator('#registerButton');
    this.errorMessage = page.locator('#registerError');
    this.loginLink = page.locator('#loginLink');
  }

  /**
   * Navigate to the registration page
   */
  async goto() {
    await super.goto('/register');
  }

  /**
   * Register a new user
   */
  async register(email: string, password: string, firstName?: string, lastName?: string) {
    await this.emailInput.waitFor({ state: 'visible', timeout: 10000 });
    await this.emailInput.fill(email);

    if (firstName) {
      await this.firstNameInput.fill(firstName);
    }

    if (lastName) {
      await this.lastNameInput.fill(lastName);
    }

    await this.passwordInput.fill(password);
    await this.confirmPasswordInput.fill(password);
    await this.registerButton.click();

    // Wait for navigation to complete (either success or showing error)
    await this.waitForNavigationOrError();
  }

  /**
   * Wait for either navigation to complete or an error to be displayed
   */
  private async waitForNavigationOrError() {
    try {
      // Wait for either navigation or error with a reasonable timeout
      await Promise.race([
        this.page.waitForNavigation({ timeout: 15000 }),
        this.errorMessage.waitFor({ state: 'visible', timeout: 15000 }),
      ]);
    } catch {
      // If both navigation and error detection timeout, continue silently
      // This allows the test to proceed and check the actual state
    }

    // Give a brief pause for any client-side processing
    await this.page.waitForTimeout(1000);
  }

  /**
   * Verify that registration error is displayed
   */
  async expectRegistrationError() {
    await expect(this.errorMessage).toBeVisible();
  }

  /**
   * Check if we're on the registration page
   */
  async expectToBeOnRegisterPage() {
    await expect(this.page).toHaveURL(/\/register/);
    await expect(this.registerButton).toBeVisible();
  }
}
