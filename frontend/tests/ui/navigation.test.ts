import { test } from "@playwright/test";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { HeaderComponent } from "./pages/HeaderComponent";
import { UserManagementPage } from "./pages/UserManagementPage";
import { TestUsers } from "./models/TestUsers";

test.describe("Navigation Tests", () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;
  let headerComponent: HeaderComponent;
  let userManagementPage: UserManagementPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    headerComponent = new HeaderComponent(page);
    userManagementPage = new UserManagementPage(page);
  });

  test.afterEach(async () => {
    // Ensure logout after each test
    await loginPage.logout();
  });

  test.describe("Admin user navigation", () => {
    test.beforeEach(async () => {
      // Login as admin user for all tests in this group
      await loginPage.loginWithUser(TestUsers.ADMIN);
      // Verify we're on the dashboard
      await dashboardPage.expectDashboardLoaded();
    });

    test("should navigate from dashboard to user management page", async () => {
      // Navigate to user management
      await headerComponent.navigateToUserManagement();

      // Verify we're on the user management page
      await userManagementPage.expectPageLoaded();
    });

    test("should navigate from user management back to dashboard", async () => {
      // First navigate to user management
      await headerComponent.navigateToUserManagement();
      await userManagementPage.expectPageLoaded();

      // Then navigate back to dashboard
      await headerComponent.navigateToDashboard();

      // Verify we're back on the dashboard
      await dashboardPage.expectDashboardLoaded();
    });

    test("should successfully logout and redirect to login page", async () => {
      // Perform logout
      await headerComponent.logout();

      // Verify we're redirected to login page
      await loginPage.expectToBeOnLoginPage();
    });
  });

  test.describe("Unauthenticated user navigation", () => {
    test("should redirect to login page when accessing dashboard", async () => {
      // Try to directly navigate to dashboard
      await dashboardPage.goto();

      // Should be redirected to login page
      await loginPage.expectToBeOnLoginPage();
    });

    test("should redirect to login page when accessing user management", async () => {
      // Try to directly navigate to user management
      await userManagementPage.goto();

      // Should be redirected to login page (since unauthenticated users must login first)
      await loginPage.expectToBeOnLoginPage();
    });
  });

  test.describe("Regular user navigation", () => {
    test.beforeEach(async () => {
      // Login as regular user for all tests in this group
      await loginPage.loginWithUser(TestUsers.USER);
      // Verify we're on the dashboard
      await dashboardPage.expectDashboardLoaded();
    });

    test("should show access denied when user accesses admin sections", async () => {
      // Try to navigate directly to user management page
      await userManagementPage.goto();

      // Verify we get an access denied message (regular users can't access admin functions)
      await userManagementPage.expectAccessDenied();
    });
  });
});
