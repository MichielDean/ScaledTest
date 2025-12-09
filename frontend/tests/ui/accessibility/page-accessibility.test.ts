/**
 * Page accessibility tests
 * Tests WCAG compliance for all application pages
 */

import { test, expect } from "@playwright/test";
import { testLogger } from "../testLogger";
import { LoginPage } from "../pages/LoginPage";
import { RegisterPage } from "../pages/RegisterPage";
import { DashboardPage } from "../pages/DashboardPage";
import { ProfilePage } from "../pages/ProfilePage";
import { TestResultsDashboardPage } from "../pages/TestResultsDashboardPage";
import { UserManagementPage } from "../pages/UserManagementPage";
import { UnauthorizedPage } from "../pages/UnauthorizedPage";
import { BasePage } from "../pages/BasePage";
import { TestUsers } from "../models/TestUsers";
import {
  PageObjectWithGoto,
  getAxeViolations,
  logAccessibilityViolations,
} from "./axeTesting";

test.describe("Page Accessibility Tests", () => {
  let loginPage: LoginPage;
  let registerPage: RegisterPage;
  let dashboardPage: DashboardPage;
  let profilePage: ProfilePage;
  let testResultsDashboardPage: TestResultsDashboardPage;
  let unauthorizedPage: UnauthorizedPage;
  let basePage: BasePage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    registerPage = new RegisterPage(page);
    dashboardPage = new DashboardPage(page);
    profilePage = new ProfilePage(page);
    testResultsDashboardPage = new TestResultsDashboardPage(page);
    unauthorizedPage = new UnauthorizedPage(page);
    basePage = new BasePage(page);
  });

  test.describe("Public Pages", () => {
    const publicPages: Array<{
      name: string;
      pageObject: () => PageObjectWithGoto;
    }> = [
      { name: "Login", pageObject: () => loginPage },
      { name: "Register", pageObject: () => registerPage },
    ];

    publicPages.forEach(({ name, pageObject }) => {
      test(`${name} page should be accessible`, async ({ page }) => {
        // Clear authentication state for public pages to prevent redirects
        await page.context().clearCookies();

        // Safely clear storage (handle cases where localStorage access is denied)
        try {
          await page.evaluate(() => {
            localStorage.clear();
            sessionStorage.clear();
          });
        } catch {
          // localStorage access denied - this is acceptable for accessibility testing
          testLogger.debug(
            "localStorage access denied - continuing with accessibility test",
          );
        }

        const pageObj = pageObject();
        await pageObj.goto();
        await basePage.waitForPageLoad(1000);

        const violations = await getAxeViolations(page);

        if (violations.length > 0) {
          logAccessibilityViolations(name, violations);
        }

        expect(violations).toHaveLength(0);
      });
    });

    test("Home page should handle redirect properly", async () => {
      await basePage.goto("/");

      // Wait for redirect to complete (should go to /login or /dashboard)
      await basePage.waitForURL(/\/(login|dashboard)/, { timeout: 10000 });

      // Skip accessibility check on redirect page as it's transient
      testLogger.info("Home page redirected successfully");
    });

    test("Unauthorized page should be accessible", async ({ page }) => {
      await unauthorizedPage.goto();
      await unauthorizedPage.waitForPageLoad();

      const violations = await getAxeViolations(page);

      if (violations.length > 0) {
        logAccessibilityViolations("Unauthorized page", violations);
      }

      expect(violations).toHaveLength(0);
    });
  });

  test.describe("Authenticated Pages", () => {
    test.beforeEach(async ({ page }) => {
      // Login before each test
      const loginPage = new LoginPage(page);
      const dashboardPage = new DashboardPage(page);

      await loginPage.loginWithUser(TestUsers.USER);
      await dashboardPage.expectDashboardLoaded();
    });

    test("Dashboard page should be accessible", async ({ page }) => {
      const dashboardPage = new DashboardPage(page);
      const basePage = new BasePage(page);

      await dashboardPage.goto();
      // Wait longer for dashboard to fully stabilize (data loading, animations, etc.)
      await basePage.waitForPageLoad(3000);

      const violations = await getAxeViolations(page);

      if (violations.length > 0) {
        logAccessibilityViolations("Dashboard page", violations);
      }

      expect(violations).toHaveLength(0);
    });

    test("Profile page should be accessible", async ({ page }) => {
      const profilePage = new ProfilePage(page);
      const basePage = new BasePage(page);

      await profilePage.goto();
      await basePage.waitForPageLoad(1500);

      const violations = await getAxeViolations(page);

      if (violations.length > 0) {
        logAccessibilityViolations("Profile page", violations);
      }

      expect(violations).toHaveLength(0);
    });

    test("Test Results Dashboard should be accessible", async ({ page }) => {
      const testResultsDashboardPage = new TestResultsDashboardPage(page);

      await testResultsDashboardPage.goto();
      await testResultsDashboardPage.waitForPageLoad();

      const violations = await getAxeViolations(page);

      if (violations.length > 0) {
        logAccessibilityViolations("Test Results Dashboard page", violations);
      }

      expect(violations).toHaveLength(0);
    });
  });
});

test.describe("Admin Authenticated Pages", () => {
  test.beforeEach(async ({ page }) => {
    // Login as ADMIN before each test
    const loginPage = new LoginPage(page);
    const dashboardPage = new DashboardPage(page);

    await loginPage.loginWithUser(TestUsers.ADMIN);
    await dashboardPage.expectDashboardLoaded();
  });

  test("Admin pages should be accessible", async ({ page }) => {
    const userManagementPage = new UserManagementPage(page);

    // Navigate to admin page - this should work with admin user
    await userManagementPage.goto();
    await userManagementPage.waitForPageLoad();

    const violations = await getAxeViolations(page);

    if (violations.length > 0) {
      logAccessibilityViolations("Admin page", violations);
    }

    expect(violations).toHaveLength(0);
  });
});
