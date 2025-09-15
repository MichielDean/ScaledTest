import { describe, beforeEach, afterEach, it } from '@jest/globals';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { HeaderComponent } from './pages/HeaderComponent';
import { BasePage } from './pages/BasePage';
import { setupPlaywright } from './playwrightSetup';

describe('Registration Tests', () => {
  const playwrightContext = setupPlaywright();
  let loginPage: LoginPage;
  let registerPage: RegisterPage;
  let dashboardPage: DashboardPage;
  let headerComponent: HeaderComponent;
  let basePage: BasePage;

  beforeEach(async () => {
    loginPage = new LoginPage(playwrightContext.page);
    registerPage = new RegisterPage(playwrightContext.page);
    dashboardPage = new DashboardPage(playwrightContext.page);
    headerComponent = new HeaderComponent(playwrightContext.page);
    basePage = new BasePage(playwrightContext.page);
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
    return `test-user-${timestamp}@scaledtest.com`;
  };

  describe('Registration and Auto-Login Flow', () => {
    it('should register a new user and automatically log them in', async () => {
      // Step 1: Start from login page
      await loginPage.goto();
      await basePage.waitForNavigation();

      // Step 2: Click the register link to go to registration page
      await playwrightContext.page.locator('#registerLink').click();

      // Verify we're on the registration page
      await registerPage.expectToBeOnRegisterPage();

      // Step 3: Fill out registration form and submit
      const testEmail = generateUniqueEmail();
      const testPassword = 'Password123!';
      const testFirstName = 'Test';
      const testLastName = 'User';

      // Use the register method for better reliability
      await registerPage.register(testEmail, testPassword, testFirstName, testLastName);

      // Step 4: Verify we're automatically redirected to the dashboard after registration
      // Wait longer for navigation as registration may take time and role propagation
      await playwrightContext.page.waitForURL(/\/dashboard/, { timeout: 45000 });

      // Step 5: Give a brief moment for the dashboard to fully load after role propagation
      await playwrightContext.page.waitForTimeout(2000);

      // Step 6: Verify dashboard is properly loaded
      await dashboardPage.expectDashboardLoaded();

      // Step 7: Verify the user is shown as logged in
      await headerComponent.expectUserLoggedIn();
    });

    it('should show error when registering with an existing email', async () => {
      // Generate a unique email for this test run to avoid conflicts with previous runs
      const uniqueEmail = `existing-user-${Date.now()}-duplicate@scaledtest.com`;

      // Step 1: First, create a user with this email to ensure it exists
      // Start completely fresh - clear all authentication state
      await playwrightContext.page.context().clearCookies();
      await playwrightContext.page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });

      // Navigate to registration page and register the first user
      await registerPage.goto();
      await registerPage.expectToBeOnRegisterPage();
      await registerPage.register(uniqueEmail, 'Password123!', 'First', 'User');

      // Wait for successful registration and redirect to dashboard
      await playwrightContext.page.waitForURL(/\/dashboard/, { timeout: 15000 });

      // Step 2: Now clear authentication and attempt duplicate registration
      await playwrightContext.page.context().clearCookies();
      await playwrightContext.page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });

      // Navigate to registration page again (should not redirect since we cleared auth)
      await registerPage.goto();
      await registerPage.expectToBeOnRegisterPage();

      // Attempt to register with the same email - this should fail
      await registerPage.register(uniqueEmail, 'Password123!', 'Duplicate', 'User');

      // Verify error is shown for duplicate email (should not redirect)
      await registerPage.expectRegistrationError();
      await registerPage.expectToBeOnRegisterPage();
    }, 45000);

    it('should validate password confirmation', async () => {
      // Start fresh - clear any authentication state
      await playwrightContext.page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
        // Clear all cookies
        document.cookie.split(';').forEach(function (c) {
          document.cookie = c
            .replace(/^ +/, '')
            .replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
        });
      });

      await registerPage.goto();
      await registerPage.expectToBeOnRegisterPage();

      // Fill form with mismatched passwords
      await registerPage.emailInput.waitFor({ state: 'visible' });
      await registerPage.emailInput.fill(generateUniqueEmail());

      await registerPage.firstNameInput.fill('Test');
      await registerPage.lastNameInput.fill('User');
      await registerPage.passwordInput.fill('Password123!');
      await registerPage.confirmPasswordInput.fill('DifferentPassword123!');

      // Attempt to register - should fail validation
      await registerPage.registerButton.click();

      // Should show validation error and remain on registration page
      await registerPage.expectRegistrationError();
      await registerPage.expectToBeOnRegisterPage();
    }, 30000);
  });
});
