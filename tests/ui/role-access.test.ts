import { describe, beforeAll, afterAll, it } from '@jest/globals';
import { expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProfilePage } from './pages/ProfilePage';
import { HeaderComponent } from './pages/HeaderComponent';
import { UserManagementPage } from './pages/UserManagementPage';
import { TestUsers } from './models/TestUsers';
import { setupPlaywright } from './playwrightSetup';

describe('Role-based Access Tests', () => {
  const playwrightContext = setupPlaywright();
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;
  let profilePage: ProfilePage;
  let headerComponent: HeaderComponent;
  let userManagementPage: UserManagementPage;

  beforeAll(async () => {
    // Initialize page objects once
    loginPage = new LoginPage(playwrightContext.page);
    dashboardPage = new DashboardPage(playwrightContext.page);
    profilePage = new ProfilePage(playwrightContext.page);
    headerComponent = new HeaderComponent(playwrightContext.page);
    userManagementPage = new UserManagementPage(playwrightContext.page);
  });

  afterAll(async () => {
    // Cleanup - no final logout needed since each group handles its own
  });

  describe('Read-only User Access', () => {
    beforeAll(async () => {
      // Login once for all tests in this group
      await loginPage.loginWithUser(TestUsers.READONLY);
      await dashboardPage.expectDashboardLoaded();
    });

    afterAll(async () => {
      // Logout after this group to prepare for next group
      await loginPage.logout();
    });

    it('should see correct role assignment', async () => {
      await profilePage.goto();
      await profilePage.expectProfileLoaded();
      await profilePage.expectHasRole('Read-only');
    });

    it('should not have content editing permissions', async () => {
      // Go back to dashboard for this test
      await dashboardPage.goto();
      await dashboardPage.expectNoEditPermission();
    });

    it('should not see admin actions on dashboard', async () => {
      // Ensure we're on dashboard
      await dashboardPage.goto();
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
    beforeAll(async () => {
      // Login once for all tests in this group
      await loginPage.loginWithUser(TestUsers.MAINTAINER);
      await dashboardPage.expectDashboardLoaded();
    });

    afterAll(async () => {
      // Logout after this group to prepare for next group
      await loginPage.logout();
    });

    it('should see correct role assignments', async () => {
      await profilePage.goto();
      await profilePage.expectProfileLoaded();
      await profilePage.expectHasRole('Read-only');
      await profilePage.expectHasRole('Maintainer');
    });

    it('should have content editing permissions', async () => {
      await dashboardPage.goto();
      await dashboardPage.expectEditPermission();
    });

    it('should not see admin actions on dashboard', async () => {
      await dashboardPage.goto();
      await dashboardPage.expectAdminActionsNotVisible();
    });

    it('should have admin menu access for teams management', async () => {
      await headerComponent.expectAdminAccess();
    });

    it('should be redirected from user management to teams section', async () => {
      // Maintainers can access admin dashboard but should be redirected to teams section
      await userManagementPage.goto();
      // Should be redirected to teams section instead of users
      await expect(userManagementPage.page).toHaveURL(/\/admin\?section=teams/);
    });
  });

  describe('Owner User Access', () => {
    beforeAll(async () => {
      // Login once for all tests in this group
      await loginPage.loginWithUser(TestUsers.OWNER);
      await dashboardPage.expectDashboardLoaded();
    });

    afterAll(async () => {
      // Logout after this group (final cleanup)
      await loginPage.logout();
    });

    it('should see correct role assignments', async () => {
      await profilePage.goto();
      await profilePage.expectProfileLoaded();
      await profilePage.expectHasRole('Read-only');
      await profilePage.expectHasRole('Maintainer');
      await profilePage.expectHasRole('Owner');
    });

    it('should have content editing permissions', async () => {
      await dashboardPage.goto();
      await dashboardPage.expectEditPermission();
    });

    it('should see admin actions on dashboard', async () => {
      await dashboardPage.goto();
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
      await userManagementPage.expectUserListed(TestUsers.READONLY.email);
      await userManagementPage.expectUserListed(TestUsers.MAINTAINER.email);
      await userManagementPage.expectUserListed(TestUsers.OWNER.email);
    });
  });
});
