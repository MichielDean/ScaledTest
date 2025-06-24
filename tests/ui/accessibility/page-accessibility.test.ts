/**
 * Page accessibility tests
 * Tests WCAG compliance for all application pages
 */

import { setupPlaywright } from '../playwrightSetup';
import { testLogger } from '../../../src/logging/logger';
import { LoginPage } from '../pages/LoginPage';
import { RegisterPage } from '../pages/RegisterPage';
import { DashboardPage } from '../pages/DashboardPage';
import { ProfilePage } from '../pages/ProfilePage';
import { TestResultsDashboardPage } from '../pages/TestResultsDashboardPage';
import { UserManagementPage } from '../pages/UserManagementPage';
import { UnauthorizedPage } from '../pages/UnauthorizedPage';
import { BasePage } from '../pages/BasePage';
import { TestUsers } from '../models/TestUsers';
import { PageObjectWithGoto, getAxeViolations, logAccessibilityViolations } from './axeTesting';

const playwright = setupPlaywright();

describe('Page Accessibility Tests', () => {
  let loginPage: LoginPage;
  let registerPage: RegisterPage;
  let dashboardPage: DashboardPage;
  let profilePage: ProfilePage;
  let testResultsDashboardPage: TestResultsDashboardPage;
  let unauthorizedPage: UnauthorizedPage;
  let basePage: BasePage;

  beforeEach(() => {
    loginPage = new LoginPage(playwright.page);
    registerPage = new RegisterPage(playwright.page);
    dashboardPage = new DashboardPage(playwright.page);
    profilePage = new ProfilePage(playwright.page);
    testResultsDashboardPage = new TestResultsDashboardPage(playwright.page);
    unauthorizedPage = new UnauthorizedPage(playwright.page);
    basePage = new BasePage(playwright.page);
  });

  describe('Public Pages', () => {
    const publicPages: Array<{ name: string; pageObject: () => PageObjectWithGoto }> = [
      { name: 'Login', pageObject: () => loginPage },
      { name: 'Register', pageObject: () => registerPage },
    ];

    publicPages.forEach(({ name, pageObject }) => {
      test(`${name} page should be accessible`, async () => {
        const page = pageObject();
        await page.goto();
        await basePage.waitForPageLoad(1000);

        const violations = await getAxeViolations(playwright.page);

        if (violations.length > 0) {
          logAccessibilityViolations(name, violations);
        }

        expect(violations).toHaveLength(0);
      });
    });

    test('Home page should handle redirect properly', async () => {
      await basePage.goto('/');

      // Wait for redirect to complete (should go to /login or /dashboard)
      await basePage.waitForURL(/\/(login|dashboard)/, { timeout: 10000 });

      // Skip accessibility check on redirect page as it's transient
      testLogger.info('Home page redirected successfully');
    });

    test('Unauthorized page should be accessible', async () => {
      await unauthorizedPage.goto();
      await unauthorizedPage.waitForPageLoad();

      const violations = await getAxeViolations(playwright.page);

      if (violations.length > 0) {
        logAccessibilityViolations('Unauthorized page', violations);
      }

      expect(violations).toHaveLength(0);
    });
  });

  describe('Authenticated Pages', () => {
    // Single login for all authenticated tests for performance
    beforeAll(async () => {
      await loginPage.loginWithUser(TestUsers.READONLY);
      await dashboardPage.expectDashboardLoaded();
    });

    const authenticatedPages: Array<{ name: string; pageObject: () => PageObjectWithGoto }> = [
      { name: 'Dashboard', pageObject: () => dashboardPage },
      { name: 'Profile', pageObject: () => profilePage },
    ];

    authenticatedPages.forEach(({ name, pageObject }) => {
      test(`${name} page should be accessible`, async () => {
        const page = pageObject();
        await page.goto();
        await basePage.waitForPageLoad(1500); // Longer wait for authenticated pages

        const violations = await getAxeViolations(playwright.page);

        if (violations.length > 0) {
          logAccessibilityViolations(`${name} page`, violations);
        }

        expect(violations).toHaveLength(0);
      });
    });

    test('Test Results Dashboard should be accessible', async () => {
      await testResultsDashboardPage.goto();
      await testResultsDashboardPage.waitForPageLoad();

      const violations = await getAxeViolations(playwright.page);

      if (violations.length > 0) {
        logAccessibilityViolations('Test Results Dashboard page', violations);
      }

      expect(violations).toHaveLength(0);
    });
  });
});

describe('Admin Authenticated Pages', () => {
  const playwright = setupPlaywright();

  let loginPage: LoginPage;
  let userManagementPage: UserManagementPage;
  let dashboardPage: DashboardPage;

  // Login as OWNER user for admin-only tests
  beforeAll(async () => {
    loginPage = new LoginPage(playwright.page);
    userManagementPage = new UserManagementPage(playwright.page);
    dashboardPage = new DashboardPage(playwright.page);

    await loginPage.loginWithUser(TestUsers.OWNER);
    await dashboardPage.expectDashboardLoaded();
  });

  test('Admin pages should be accessible', async () => {
    // Navigate to admin page - this should work with admin user
    await userManagementPage.goto();
    await userManagementPage.waitForPageLoad();

    const violations = await getAxeViolations(playwright.page);

    if (violations.length > 0) {
      logAccessibilityViolations('Admin page', violations);
    }

    expect(violations).toHaveLength(0);
  });
});
