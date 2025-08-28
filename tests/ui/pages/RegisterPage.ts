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
   * Register a new user by filling out the form and submitting it
   * @param email User's email address
   * @param password User's password
   * @param firstName Optional first name
   * @param lastName Optional last name
   */
  async register(
    email: string,
    password: string,
    firstName?: string,
    lastName?: string
  ): Promise<void> {
    // Wait for form to be ready
    await this.emailInput.waitFor({ state: 'visible' });

    // Fill form with retries to handle DOM changes
    await this.fillWithRetry(this.emailInput, email, 'email');
    await this.page.waitForTimeout(100);

    if (firstName) {
      await this.fillWithRetry(this.firstNameInput, firstName, 'firstName');
      await this.page.waitForTimeout(100);
    }

    if (lastName) {
      await this.fillWithRetry(this.lastNameInput, lastName, 'lastName');
      await this.page.waitForTimeout(100);
    }

    await this.fillWithRetry(this.passwordInput, password, 'password');
    await this.page.waitForTimeout(100);

    await this.fillWithRetry(this.confirmPasswordInput, password, 'confirmPassword');
    await this.page.waitForTimeout(200);

    // Submit with retries
    await this.submitWithRetry();
  }

  private async fillWithRetry(locator: Locator, value: string, fieldName: string): Promise<void> {
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        await locator.waitFor({ state: 'visible' });
        await locator.clear();
        await locator.fill(value);
        return;
      } catch (error) {
        attempts++;
        if (attempts >= maxAttempts) {
          throw new Error(`Failed to fill ${fieldName} after ${maxAttempts} attempts: ${error}`);
        }
        await this.page.waitForTimeout(500);
      }
    }
  }

  private async submitWithRetry(): Promise<void> {
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        await this.registerButton.waitFor({ state: 'visible' });
        await this.registerButton.click();
        return;
      } catch (error) {
        attempts++;
        if (attempts >= maxAttempts) {
          throw new Error(
            `Failed to submit registration form after ${maxAttempts} attempts: ${error}`
          );
        }
        await this.page.waitForTimeout(500);
      }
    }
  }

  /**
   * Wait for either navigation to complete or an error to be displayed
   */
  private async waitForNavigationOrError() {
    try {
      // Wait for either navigation to dashboard or error message to appear
      await Promise.race([
        this.page.waitForURL(/\/dashboard/, { timeout: 15000 }),
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
