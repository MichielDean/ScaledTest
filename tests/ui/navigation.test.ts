import { describe, beforeEach, afterEach, it } from '@jest/globals';
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

  describe('Admin user navigation', () => {
    beforeEach(async () => {
      // Login as admin user for all tests in this group
      await loginPage.loginWithUser(TestUsers.ADMIN);
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

    it('should redirect to login page when accessing user management', async () => {
      // Try to directly navigate to user management
      await userManagementPage.goto();

      // Should be redirected to login page (since unauthenticated users must login first)
      await loginPage.expectToBeOnLoginPage();
    });
  });

  describe('Regular user navigation', () => {
    beforeEach(async () => {
      // Login as regular user for all tests in this group
      await loginPage.loginWithUser(TestUsers.USER);
      // Verify we're on the dashboard
      await dashboardPage.expectDashboardLoaded();
    });

    it('should show access denied when user accesses admin sections', async () => {
      // Try to navigate directly to user management page
      await userManagementPage.goto();

      // Verify we get an access denied message (regular users can't access admin functions)
      await userManagementPage.expectAccessDenied();
    });
  });
});
