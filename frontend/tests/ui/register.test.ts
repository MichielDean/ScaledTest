import { test } from "@playwright/test";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { DashboardPage } from "./pages/DashboardPage";
import { HeaderComponent } from "./pages/HeaderComponent";
import { BasePage } from "./pages/BasePage";

test.describe("Registration Tests", () => {
  let loginPage: LoginPage;
  let registerPage: RegisterPage;
  let dashboardPage: DashboardPage;
  let headerComponent: HeaderComponent;
  let basePage: BasePage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    registerPage = new RegisterPage(page);
    dashboardPage = new DashboardPage(page);
    headerComponent = new HeaderComponent(page);
    basePage = new BasePage(page);
  });

  test.afterEach(async () => {
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

  test.describe("Registration and Auto-Login Flow", () => {
    test("should register a new user and automatically log them in", async ({
      page,
    }) => {
      // Step 1: Start from login page
      await loginPage.goto();
      await basePage.waitForNavigation();

      // Step 2: Click the register link to go to registration page
      await page.locator("#registerLink").click();

      // Verify we're on the registration page
      await registerPage.expectToBeOnRegisterPage();

      // Step 3: Fill out registration form and submit
      const testEmail = generateUniqueEmail();
      const testPassword = "Password123!";
      const testFirstName = "Test";
      const testLastName = "User";

      // Use the register method for better reliability
      await registerPage.register(
        testEmail,
        testPassword,
        testFirstName,
        testLastName,
      );

      // Step 4: Verify we're automatically redirected to the dashboard after registration
      // Wait longer for navigation as registration may take time and role propagation
      await page.waitForURL(/\/dashboard/, {
        timeout: 45000,
      });

      // Step 5: Give a brief moment for the dashboard to fully load after role propagation
      await page.waitForTimeout(2000);

      // Step 6: Verify dashboard is properly loaded
      await dashboardPage.expectDashboardLoaded();

      // Step 7: Verify the user is shown as logged in
      await headerComponent.expectUserLoggedIn();
    });

    test(
      "should show error when registering with an existing email",
      { timeout: 45000 },
      async ({ page }) => {
        // Generate a unique email for this test run to avoid conflicts with previous runs
        const uniqueEmail = `existing-user-${Date.now()}-duplicate@scaledtest.com`;

        // Step 1: First, create a user with this email to ensure it exists
        // Start completely fresh - clear all authentication state
        await page.context().clearCookies();
        await page.evaluate(() => {
          try {
            localStorage.clear();
            sessionStorage.clear();
          } catch (e) {
            // SecurityError when accessing localStorage/sessionStorage - can be ignored
          }
        });

        // Navigate to registration page and register the first user
        await registerPage.goto();
        await registerPage.expectToBeOnRegisterPage();
        await registerPage.register(
          uniqueEmail,
          "Password123!",
          "First",
          "User",
        );

        // Wait for successful registration and redirect to dashboard
        await page.waitForURL(/\/dashboard/, {
          timeout: 15000,
        });

        // Step 2: Now clear authentication and attempt duplicate registration
        await page.context().clearCookies();
        await page.evaluate(() => {
          try {
            localStorage.clear();
            sessionStorage.clear();
          } catch (e) {
            // SecurityError when accessing localStorage/sessionStorage - can be ignored
          }
        });

        // Navigate to registration page again (should not redirect since we cleared auth)
        await registerPage.goto();
        await registerPage.expectToBeOnRegisterPage();

        // Attempt to register with the same email - this should fail
        await registerPage.register(
          uniqueEmail,
          "Password123!",
          "Duplicate",
          "User",
        );

        // Verify error is shown for duplicate email (should not redirect)
        await registerPage.expectRegistrationError();
        await registerPage.expectToBeOnRegisterPage();
      },
    );
  });
});
