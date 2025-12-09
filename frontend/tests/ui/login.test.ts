import { test, expect } from "@playwright/test";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { HeaderComponent } from "./pages/HeaderComponent";
import { TestUsers } from "./models/TestUsers";

test.describe("Authentication Tests", () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;
  let headerComponent: HeaderComponent;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    headerComponent = new HeaderComponent(page);
  });

  test.afterEach(async () => {
    // Ensure logout after each test
    await loginPage.logout();
  });

  test.describe("Login Functionality", () => {
    test("should redirect to dashboard after successful login", async () => {
      // Login with valid credentials
      await loginPage.loginWithUser(TestUsers.USER);

      // Verify we're redirected to dashboard
      await dashboardPage.expectDashboardLoaded();
    });

    test("should show user as logged in after successful login", async () => {
      // Login with valid credentials
      await loginPage.loginWithUser(TestUsers.USER);

      // Verify user is shown as logged in
      await headerComponent.expectUserLoggedIn();
      // Cleanup - logout for next test
      await loginPage.logout();
    });

    test("should show error message with invalid credentials", async () => {
      // Navigate to login page first
      await loginPage.goto();

      // Login with invalid credentials, expecting an error
      await loginPage.loginExpectingError(
        "invalid-user@email.com",
        "wrong-password",
      );

      // Verify we stay on login page with error message
      await loginPage.expectLoginError();
      await loginPage.expectToBeOnLoginPage();
    });
  });

  test.describe("Logout Functionality", () => {
    test.beforeEach(async () => {
      // Setup: Navigate to login page and login as a precondition
      await loginPage.loginWithUser(TestUsers.USER);
      await dashboardPage.expectDashboardLoaded();
    });

    test("should redirect to login page after logout", async ({ page }) => {
      // Perform logout
      await loginPage.logout();

      // Verify we're redirected to login page
      const finalUrl = await page.url();
      expect(finalUrl).toMatch(/\/login/);
    });

    test("should show user as logged out after logout", async () => {
      // Perform logout
      await loginPage.logout();

      // Verify user is shown as logged out
      await headerComponent.expectUserLoggedOut();
    });
  });
});
