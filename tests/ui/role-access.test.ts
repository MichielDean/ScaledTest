import { describe, beforeEach, afterEach, it, expect } from '@jest/globals';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { HeaderComponent } from './pages/HeaderComponent';
import { UserManagementPage } from './pages/UserManagementPage';
import { TestUsers } from './models/TestUsers';

// For Jest-Playwright integration
declare const page: any;

describe('Role-based Access Tests', () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;
  let headerComponent: HeaderComponent;
  let userManagementPage: UserManagementPage;

  beforeEach(async () => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    headerComponent = new HeaderComponent(page);
    userManagementPage = new UserManagementPage(page);
  });

  afterEach(async () => {
    // Ensure logout after each test
    await loginPage.logout();
  });

  describe('Read-only User Access', () => {
    beforeEach(async () => {
      // Login as readonly user before each test in this group
      await loginPage.loginWithUser(TestUsers.READONLY);

      // Verify we're redirected to dashboard as a common prerequisite
      await dashboardPage.expectDashboardLoaded();
    });

    it('should see correct role assignment', async () => {
      await dashboardPage.expectHasRole('Read-only');
    });

    it('should not have content editing permissions', async () => {
      await dashboardPage.expectNoEditPermission();
    });

    it('should not see admin actions on dashboard', async () => {
      await dashboardPage.expectAdminActionsNotVisible();
    });

    it('should not have admin menu access', async () => {
      await headerComponent.expectNoAdminAccess();
    });

    it('should be denied access to user management page', async () => {
      await userManagementPage.goto();
      await userManagementPage.expectUnauthorizedPage();
    });
  });

  describe('Maintainer User Access', () => {
    beforeEach(async () => {
      // Login as maintainer user before each test in this group
      await loginPage.loginWithUser(TestUsers.MAINTAINER);

      // Verify we're redirected to dashboard as a common prerequisite
      await dashboardPage.expectDashboardLoaded();
    });

    it('should see correct role assignments', async () => {
      await dashboardPage.expectHasRole('Read-only');
      await dashboardPage.expectHasRole('Maintainer');
    });

    it('should have content editing permissions', async () => {
      await dashboardPage.expectEditPermission();
    });

    it('should not see admin actions on dashboard', async () => {
      await dashboardPage.expectAdminActionsNotVisible();
    });

    it('should not have admin menu access', async () => {
      await headerComponent.expectNoAdminAccess();
    });

    it('should be denied access to user management page', async () => {
      await userManagementPage.goto();
      await userManagementPage.expectUnauthorizedPage();
    });
  });

  describe('Owner User Access', () => {
    beforeEach(async () => {
      // Login as owner user before each test in this group
      await loginPage.loginWithUser(TestUsers.OWNER);

      // Verify we're redirected to dashboard as a common prerequisite
      await dashboardPage.expectDashboardLoaded();
    });

    it('should see correct role assignments', async () => {
      await dashboardPage.expectHasRole('Read-only');
      await dashboardPage.expectHasRole('Maintainer');
      await dashboardPage.expectHasRole('Owner');
    });

    it('should have content editing permissions', async () => {
      await dashboardPage.expectEditPermission();
    });

    it('should see admin actions on dashboard', async () => {
      await dashboardPage.expectAdminActionsVisible();
    });

    it('should have admin menu access', async () => {
      await headerComponent.expectAdminAccess();
    });

    it('should have access to user management page', async () => {
      await headerComponent.navigateToUserManagement();
      await userManagementPage.expectPageLoaded();
    });

    it('should see all users listed in user management', async () => {
      // Navigate to user management page first
      await headerComponent.navigateToUserManagement();
      await userManagementPage.expectPageLoaded();

      // Then verify users are listed
      await userManagementPage.expectUserListed(TestUsers.READONLY.username);
      await userManagementPage.expectUserListed(TestUsers.MAINTAINER.username);
      await userManagementPage.expectUserListed(TestUsers.OWNER.username);
    });
  });
});
