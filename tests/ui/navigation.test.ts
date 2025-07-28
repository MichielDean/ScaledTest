import { describe, beforeEach, afterEach, it } from '@jest/globals';
import { expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { HeaderComponent } from './pages/HeaderComponent';
import { UserManagementPage } from './pages/UserManagementPage';
import { TestUsers } from './models/TestUsers';
import { setupPlaywright } from './playwrightSetup';

describe('Navigation Tests', () => {
  const playwrightContext = setupPlaywright();
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;
  let headerComponent: HeaderComponent;
  let userManagementPage: UserManagementPage;

  beforeEach(async () => {
    loginPage = new LoginPage(playwrightContext.page);
    dashboardPage = new DashboardPage(playwrightContext.page);
    headerComponent = new HeaderComponent(playwrightContext.page);
    userManagementPage = new UserManagementPage(playwrightContext.page);
  });

  afterEach(async () => {
    // Ensure logout after each test
    await loginPage.logout();
  });

  describe('Owner user navigation', () => {
    beforeEach(async () => {
      // Login as owner user for all tests in this group
      await loginPage.loginWithUser(TestUsers.OWNER);
      // Verify we're on the dashboard
      await dashboardPage.expectDashboardLoaded();
    });

    it('should navigate from dashboard to user management page', async () => {
      // Navigate to user management
      await headerComponent.navigateToUserManagement();

      // Verify we're on the user management page
      await userManagementPage.expectPageLoaded();
    });

    it('should navigate from user management back to dashboard', async () => {
      // First navigate to user management
      await headerComponent.navigateToUserManagement();
      await userManagementPage.expectPageLoaded();

      // Then navigate back to dashboard
      await headerComponent.navigateToDashboard();

      // Verify we're back on the dashboard
      await dashboardPage.expectDashboardLoaded();
    });

    it('should successfully logout and redirect to login page', async () => {
      // Perform logout
      await headerComponent.logout();

      // Verify we're redirected to login page
      await loginPage.expectToBeOnLoginPage();
    });
  });

  describe('Unauthenticated user navigation', () => {
    it('should redirect to login page when accessing dashboard', async () => {
      // Try to directly navigate to dashboard
      await dashboardPage.goto();

      // Should be redirected to login page
      await loginPage.expectToBeOnLoginPage();
    });

    it('should redirect to unauthorized page when accessing user management', async () => {
      // Try to directly navigate to user management
      await userManagementPage.goto();

      // Should be redirected to unauthorized page (since admin pages redirect to unauthorized)
      await userManagementPage.expectUnauthorizedPage();
    });
  });

  describe('Maintainer user navigation', () => {
    beforeEach(async () => {
      // Login as maintainer for all tests in this group
      await loginPage.loginWithUser(TestUsers.MAINTAINER);
      // Verify we're on the dashboard
      await dashboardPage.expectDashboardLoaded();
    });

    it('should redirect to teams section when maintainer accesses users section', async () => {
      // Try to navigate directly to user management page
      await userManagementPage.goto();

      // Verify we're redirected to teams section
      await expect(playwrightContext.page).toHaveURL(/\/admin\?section=teams/, { timeout: 10000 });

      // Verify teams section is loaded
      const teamsSection = playwrightContext.page.locator('#teams-section-title');
      await expect(teamsSection).toBeVisible();
    });
  });
});
