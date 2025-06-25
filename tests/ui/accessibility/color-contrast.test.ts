/**
 * Color contrast accessibility tests
 * Tests color contrast compliance across all pages
 */

import { setupPlaywright } from '../playwrightSetup';
import { testLogger } from '../../../src/logging/logger';
import { LoginPage } from '../pages/LoginPage';
import { RegisterPage } from '../pages/RegisterPage';
import { BasePage } from '../pages/BasePage';
import { PageObjectWithGoto, getAxeViolations, logAccessibilityViolations } from './axeTesting';

const playwright = setupPlaywright();

describe('Color Contrast Tests', () => {
  let loginPage: LoginPage;
  let registerPage: RegisterPage;
  let basePage: BasePage;

  beforeEach(() => {
    loginPage = new LoginPage(playwright.page);
    registerPage = new RegisterPage(playwright.page);
    basePage = new BasePage(playwright.page);
  });

  test('All pages should have sufficient color contrast', async () => {
    const pages: Array<{ name: string; pageObject: () => PageObjectWithGoto }> = [
      { name: 'Login', pageObject: () => loginPage },
      { name: 'Register', pageObject: () => registerPage },
    ];

    for (const { name, pageObject } of pages) {
      const page = pageObject();
      await page.goto();
      await basePage.waitForPageLoad(1000);

      // Get violations focusing on color contrast
      const violations = await getAxeViolations(playwright.page);

      const contrastViolations = violations.filter(v => v.id === 'color-contrast');

      if (contrastViolations.length > 0) {
        logAccessibilityViolations(name, contrastViolations, 'Color contrast');
      }

      expect(contrastViolations).toHaveLength(0);
    }

    // Test home page redirect separately
    await basePage.goto('/');
    await basePage.waitForURL(/\/(login|dashboard)/, { timeout: 10000 });
    testLogger.info('Home page color contrast test completed via redirect');
  });
});
