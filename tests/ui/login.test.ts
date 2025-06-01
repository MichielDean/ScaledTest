import { describe, beforeEach, afterEach, it, expect } from '@jest/globals';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { HeaderComponent } from './pages/HeaderComponent';
import { TestUsers } from './models/TestUsers';

// For Jest-Playwright integration
declare const page: any;

describe('Authentication Tests', () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;
  let headerComponent: HeaderComponent;

  beforeEach(async () => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    headerComponent = new HeaderComponent(page);
  });

  afterEach(async () => {
    // Ensure logout after each test
    await loginPage.logout();
  });

  describe('Login Functionality', () => {
    it('should redirect to dashboard after successful login', async () => {
      // Login with valid credentials
      await loginPage.loginWithUser(TestUsers.READONLY);

      // Verify we're redirected to dashboard
      await dashboardPage.expectDashboardLoaded();
    });

    it('should show user as logged in after successful login', async () => {
      // Login with valid credentials
      await loginPage.loginWithUser(TestUsers.READONLY);

      // Verify user is shown as logged in
      await headerComponent.expectUserLoggedIn();
      // Cleanup - logout for next test
      await loginPage.logout();
    });

    it('should show error message with invalid credentials', async () => {
      // Navigate to login page first
      await loginPage.goto();

      // Login with invalid credentials
      await loginPage.login('invalid-user@email.com', 'wrong-password');

      // Verify we stay on login page with error message
      await loginPage.expectLoginError();
      await loginPage.expectToBeOnLoginPage();
    });
  });

  describe('Logout Functionality', () => {
    beforeEach(async () => {
      // Setup: Navigate to login page and login as a precondition
      await loginPage.loginWithUser(TestUsers.READONLY);
      await dashboardPage.expectDashboardLoaded();
    });

    it('should redirect to login page after logout', async () => {
      // Perform logout
      await loginPage.logout();

      // Verify we're redirected to login page
      const finalUrl = await page.url();
      expect(finalUrl).toMatch(/\/login/);
    });

    it('should show user as logged out after logout', async () => {
      // Perform logout
      await loginPage.logout();

      // Verify user is shown as logged out
      await headerComponent.expectUserLoggedOut();
    });
  });
});
