import { test } from "@playwright/test";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ProfilePage } from "./pages/ProfilePage";
import { HeaderComponent } from "./pages/HeaderComponent";
import { UserManagementPage } from "./pages/UserManagementPage";
import { TestUsers } from "./models/TestUsers";

test.describe("Role-based Access Tests", () => {
  test.describe("Regular User Access", () => {
    test.beforeEach(async ({ page }) => {
      // Login before each test
      const loginPage = new LoginPage(page);
      await loginPage.loginWithUser(TestUsers.USER);

      const dashboardPage = new DashboardPage(page);
      await dashboardPage.expectDashboardLoaded();
    });

    test.afterEach(async ({ page }) => {
      // Logout after each test
      const loginPage = new LoginPage(page);
      await loginPage.logout();
    });

    test("should see correct role assignment", async ({ page }) => {
      const profilePage = new ProfilePage(page);
      await profilePage.goto();
      await profilePage.expectProfileLoaded();
      await profilePage.expectHasRole("User");
    });

    test("should not have admin permissions", async ({ page }) => {
      const dashboardPage = new DashboardPage(page);
      await dashboardPage.goto();
      await dashboardPage.expectNoAdminPermissions();
    });

    test("should not see admin actions on dashboard", async ({ page }) => {
      const dashboardPage = new DashboardPage(page);
      await dashboardPage.goto();
      await dashboardPage.expectAdminActionsNotVisible();
    });

    test("should not have admin menu access", async ({ page }) => {
      const headerComponent = new HeaderComponent(page);
      await headerComponent.expectNoAdminAccess();
    });

    test("should be denied access to user management page", async ({
      page,
    }) => {
      const userManagementPage = new UserManagementPage(page);
      await userManagementPage.goto();
      await userManagementPage.expectUnauthorizedPage();
    });
  });

  test.describe("Admin User Access", () => {
    test.beforeEach(async ({ page }) => {
      // Login before each test
      const loginPage = new LoginPage(page);
      await loginPage.loginWithUser(TestUsers.ADMIN);

      const dashboardPage = new DashboardPage(page);
      await dashboardPage.expectDashboardLoaded();
    });

    test.afterEach(async ({ page }) => {
      // Logout after each test
      const loginPage = new LoginPage(page);
      await loginPage.logout();
    });

    test("should see correct role assignment", async ({ page }) => {
      const profilePage = new ProfilePage(page);
      await profilePage.goto();
      await profilePage.expectProfileLoaded();
      await profilePage.expectHasRole("Admin");
    });

    test("should have full admin permissions", async ({ page }) => {
      const dashboardPage = new DashboardPage(page);
      await dashboardPage.goto();
      // Admins have full admin permissions (manage users)
      await dashboardPage.expectAdminPermissions();
    });

    test("should see admin actions on dashboard", async ({ page }) => {
      const dashboardPage = new DashboardPage(page);
      await dashboardPage.goto();
      await dashboardPage.expectAdminActionsVisible();
    });

    test("should have admin menu access", async ({ page }) => {
      const headerComponent = new HeaderComponent(page);
      await headerComponent.expectAdminAccess();
    });

    test("should have access to user management page", async ({ page }) => {
      const headerComponent = new HeaderComponent(page);
      const userManagementPage = new UserManagementPage(page);

      await headerComponent.navigateToUserManagement();
      await userManagementPage.expectPageLoaded();
    });

    test("should see all users listed in user management", async ({ page }) => {
      const headerComponent = new HeaderComponent(page);
      const userManagementPage = new UserManagementPage(page);

      // Navigate to user management page first
      await headerComponent.navigateToUserManagement();
      await userManagementPage.expectPageLoaded();

      // Then verify users are listed
      await userManagementPage.expectUserListed();
    });
  });
});
