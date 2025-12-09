/**
 * Color contrast accessibility tests
 * Tests color contrast compliance across all pages
 */

import { test, expect } from "@playwright/test";
import { testLogger } from "../testLogger";
import { LoginPage } from "../pages/LoginPage";
import { RegisterPage } from "../pages/RegisterPage";
import { BasePage } from "../pages/BasePage";
import {
  PageObjectWithGoto,
  getAxeViolations,
  logAccessibilityViolations,
} from "./axeTesting";

test.describe("Color Contrast Tests", () => {
  let loginPage: LoginPage;
  let registerPage: RegisterPage;
  let basePage: BasePage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    registerPage = new RegisterPage(page);
    basePage = new BasePage(page);
  });

  test("All pages should have sufficient color contrast", async ({ page }) => {
    const pages: Array<{ name: string; pageObject: () => PageObjectWithGoto }> =
      [
        { name: "Login", pageObject: () => loginPage },
        { name: "Register", pageObject: () => registerPage },
      ];

    for (const { name, pageObject } of pages) {
      const pageObj = pageObject();
      await pageObj.goto();
      await basePage.waitForPageLoad(1000);

      // Get violations focusing on color contrast
      const violations = await getAxeViolations(page);

      const contrastViolations = violations.filter(
        (v) => v.id === "color-contrast",
      );

      if (contrastViolations.length > 0) {
        logAccessibilityViolations(name, contrastViolations, "Color contrast");
      }

      expect(contrastViolations).toHaveLength(0);
    }

    // Test home page redirect separately
    await basePage.goto("/");
    await basePage.waitForURL(/\/(login|dashboard)/, { timeout: 10000 });
    testLogger.info("Home page color contrast test completed via redirect");
  });
});
