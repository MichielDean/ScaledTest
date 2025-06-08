import { describe, beforeEach, afterEach, it } from '@jest/globals';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { HeaderComponent } from './pages/HeaderComponent';
import type { Page } from 'playwright';

// For Jest-Playwright integration
declare const page: Page;

describe('Registration Tests', () => {
  let loginPage: LoginPage;
  let registerPage: RegisterPage;
  let dashboardPage: DashboardPage;
  let headerComponent: HeaderComponent;

  beforeEach(async () => {
    loginPage = new LoginPage(page);
    registerPage = new RegisterPage(page);
    dashboardPage = new DashboardPage(page);
    headerComponent = new HeaderComponent(page);
  });

  afterEach(async () => {
    // Ensure logout after each test
    await loginPage.logout();
  });

  /**
   * Generate a unique email for testing
   * Using timestamp to ensure uniqueness
   */
  const generateUniqueEmail = (): string => {
    const timestamp = new Date().getTime();
    return `test-user-${timestamp}@example.com`;
  };

  describe('Registration and Auto-Login Flow', () => {
    it('should register a new user and automatically log them in', async () => {
      // Step 1: Navigate to the login page
      await loginPage.goto();

      // Step 2: Click the register link to go to registration page
      await page.locator('#registerLink').click();

      // Verify we're on the registration page
      await registerPage.expectToBeOnRegisterPage();

      // Step 3: Fill out registration form and submit
      const testEmail = generateUniqueEmail();
      const testPassword = 'Password123!';
      const testFirstName = 'Test';
      const testLastName = 'User';

      await registerPage.register(testEmail, testPassword, testFirstName, testLastName);

      // Step 4: Verify we're automatically redirected to the dashboard after registration
      // This is the key test for the auto-login functionality
      await page.waitForURL(/\/dashboard/, { timeout: 15000 });

      // Step 5: Verify dashboard is properly loaded
      await dashboardPage.expectDashboardLoaded();

      // Step 6: Verify the user is shown as logged in
      await headerComponent.expectUserLoggedIn();
    });

    it('should show error when registering with an existing email', async () => {
      // First, register a user successfully
      await registerPage.goto();
      const existingEmail = generateUniqueEmail();
      await registerPage.register(existingEmail, 'Password123!');

      // Log out the user
      await loginPage.logout();

      // Try to register again with the same email
      await registerPage.goto();
      await registerPage.register(existingEmail, 'Password123!');

      // Should show an error and remain on registration page
      await registerPage.expectRegistrationError();
      await registerPage.expectToBeOnRegisterPage();
    });

    it('should validate password confirmation', async () => {
      await registerPage.goto();

      // Fill form with mismatched passwords
      await registerPage.emailInput.fill(generateUniqueEmail());
      await registerPage.firstNameInput.fill('Test');
      await registerPage.lastNameInput.fill('User');
      await registerPage.passwordInput.fill('Password123!');
      await registerPage.confirmPasswordInput.fill('DifferentPassword123!');
      await registerPage.registerButton.click();

      // Should show validation error and remain on registration page
      await registerPage.expectRegistrationError();
      await registerPage.expectToBeOnRegisterPage();
    });
  });
});
