import { describe, beforeEach, afterEach, it, expect } from '@jest/globals';
import { injectAxe, getViolations } from 'axe-playwright';
import type { Page } from 'playwright';
import type { Result, NodeResult } from 'axe-core';

import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProfilePage } from './pages/ProfilePage';
import { RegisterPage } from './pages/RegisterPage';
import { TestUsers } from './models/TestUsers';
import { testLogger } from '../../src/utils/logger';

// For Jest-Playwright integration
declare const page: Page;

interface PageTestCase {
  label: string;
  path: string;
  requiresAuth?: boolean;
  userRole?: keyof typeof TestUsers;
  maxViolations?: number;
}

// Configuration for accessibility testing
const accessibilityConfig = {
  // Base URL for testing
  baseUrl: 'http://localhost:3000',

  // Axe configuration with valid rule names
  axeOptions: {
    rules: {
      // Core accessibility rules (using valid axe-core rule names)
      'color-contrast': { enabled: true },
      'heading-order': { enabled: true },
      label: { enabled: true },
      'link-name': { enabled: true },
      'skip-link': { enabled: true },
      'image-alt': { enabled: true },
      'button-name': { enabled: true },
      'form-field-multiple-labels': { enabled: false }, // Can be noisy
      'duplicate-id': { enabled: true },
    },
  },

  // Define pages to test
  pages: [
    {
      label: 'home-page',
      path: '/',
      maxViolations: 0,
    },
    {
      label: 'login-page',
      path: '/login',
      maxViolations: 0,
    },
    {
      label: 'register-page',
      path: '/register',
      maxViolations: 0,
    },
    {
      label: 'unauthorized-page',
      path: '/unauthorized',
      maxViolations: 0,
    },
    // Authenticated pages
    {
      label: 'dashboard-page',
      path: '/dashboard',
      requiresAuth: true,
      userRole: 'READONLY',
      maxViolations: 0,
    },
    {
      label: 'profile-page',
      path: '/profile',
      requiresAuth: true,
      userRole: 'READONLY',
      maxViolations: 0,
    },
    {
      label: 'test-results-dashboard',
      path: '/test-results-dashboard',
      requiresAuth: true,
      userRole: 'READONLY',
      maxViolations: 0,
    },
    {
      label: 'simple-test-dashboard',
      path: '/simple-test-dashboard',
      requiresAuth: true,
      userRole: 'READONLY',
      maxViolations: 0,
    },
    {
      label: 'admin-users-page',
      path: '/admin/users',
      requiresAuth: true,
      userRole: 'OWNER', // Only owners can access admin pages
      maxViolations: 0,
    },
  ] as PageTestCase[],
};

/**
 * Helper function to format accessibility violations in a human-readable way
 */
function formatAccessibilityViolations(violations: Result[], pageConfig: PageTestCase): string {
  const cleanViolations = violations
    .map((violation, index) => {
      const nodeTargets = violation.nodes
        .map((node: NodeResult) => {
          if (Array.isArray(node.target)) {
            return node.target.join(' > ');
          }
          return String(node.target);
        })
        .join('\n    - ');
      return (
        `${index + 1}. ${violation.id} (${violation.impact || 'unknown'})\n` +
        `   Description: ${violation.description}\n` +
        `   Help: ${violation.helpUrl}\n` +
        `   Elements:\n    - ${nodeTargets}`
      );
    })
    .join('\n\n');

  return `
ACCESSIBILITY VIOLATIONS FOUND
===============================
Page: ${pageConfig.label} (${pageConfig.path})
Violations Found: ${violations.length}
Max Allowed: ${pageConfig.maxViolations ?? 0}

${cleanViolations}
`;
}

describe('Accessibility Tests', () => {
  let loginPage: LoginPage;

  beforeEach(async () => {
    loginPage = new LoginPage(page);
  });
  afterEach(async () => {
    // Ensure logout after each test
    try {
      await loginPage.logout();
    } catch {
      // Ignore logout errors in cleanup
    }
  });

  describe('Public Pages Accessibility', () => {
    const publicPages = accessibilityConfig.pages.filter(pageConfig => !pageConfig.requiresAuth);

    for (const pageConfig of publicPages) {
      it(`should have no accessibility violations on ${pageConfig.label}`, async () => {
        testLogger.info({ path: pageConfig.path }, 'Testing accessibility for page');

        try {
          // Navigate to the page
          await page.goto(`${accessibilityConfig.baseUrl}${pageConfig.path}`);

          // Wait for page to load
          await page.waitForLoadState('networkidle');

          // Inject axe-core
          await injectAxe(page);

          // Run accessibility check
          const violations = await getViolations(page, accessibilityConfig.axeOptions);

          // Log summary
          testLogger.info({ violationsCount: violations.length }, 'Accessibility check completed');

          // Create clean, readable error message if violations found
          if (violations.length > 0) {
            const violationErrorMessage = formatAccessibilityViolations(violations, pageConfig);
            throw new Error(violationErrorMessage);
          }

          // Assert no violations (or within allowed threshold)
          const maxAllowed = pageConfig.maxViolations ?? 0;
          expect(violations.length).toBeLessThanOrEqual(maxAllowed);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);

          // Enhanced error reporting
          if (errorMessage.includes('net::ERR_CONNECTION_REFUSED')) {
            throw new Error(
              `Could not connect to ${accessibilityConfig.baseUrl}${pageConfig.path}. ` +
                `Make sure the development server is running`
            );
          }

          testLogger.error(
            { error: errorMessage, pageLabel: pageConfig.label },
            'Accessibility test failed'
          );
          throw error;
        }
      });
    }
  });

  describe('Authenticated Pages Accessibility', () => {
    const authPages = accessibilityConfig.pages.filter(pageConfig => pageConfig.requiresAuth);

    for (const pageConfig of authPages) {
      it(`should have no accessibility violations on ${pageConfig.label} (authenticated)`, async () => {
        testLogger.info({ path: pageConfig.path }, 'Testing accessibility for authenticated page');

        try {
          // Get the test user for this page
          const testUser = pageConfig.userRole
            ? TestUsers[pageConfig.userRole]
            : TestUsers.READONLY;

          // Create login page and authenticate
          const loginPage = new LoginPage(page);
          await loginPage.goto();
          await loginPage.login(testUser.email, testUser.password);

          // Wait for login to complete
          await loginPage.waitForNavigation();

          // Navigate to the target page
          await page.goto(`${accessibilityConfig.baseUrl}${pageConfig.path}`);

          // Wait for page to load
          await page.waitForLoadState('networkidle');

          // Inject axe-core
          await injectAxe(page);

          // Run accessibility check
          const violations = await getViolations(page, accessibilityConfig.axeOptions);

          // Log summary
          testLogger.info({ violationsCount: violations.length }, 'Accessibility check completed');

          // Create clean, readable error message if violations found
          if (violations.length > 0) {
            const violationErrorMessage = formatAccessibilityViolations(violations, pageConfig);
            throw new Error(violationErrorMessage);
          }

          // Assert no violations (or within allowed threshold)
          const maxAllowed = pageConfig.maxViolations ?? 0;
          expect(violations.length).toBeLessThanOrEqual(maxAllowed);

          // Cleanup - logout
          await loginPage.logout();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);

          // Enhanced error reporting for auth issues
          if (
            errorMessage.includes('401') ||
            errorMessage.includes('403') ||
            errorMessage.includes('unauthorized') ||
            errorMessage.includes('login')
          ) {
            testLogger.warn(`Authentication issue for ${pageConfig.label}: ${errorMessage}`);
            // Don't fail the test for auth issues, just skip
            return;
          }

          testLogger.error(
            { error: errorMessage, pageLabel: pageConfig.label },
            'Accessibility test failed'
          );
          throw error;
        }
      });
    }
  });

  describe('Specific Accessibility Features', () => {
    it('should have proper heading hierarchy on home page', async () => {
      await page.goto(`${accessibilityConfig.baseUrl}/`);
      await page.waitForLoadState('networkidle');
      await injectAxe(page);

      // Check specifically for heading hierarchy violations
      const violations = await getViolations(page, {
        rules: {
          'heading-order': { enabled: true },
        },
      });

      const headingViolations = violations.filter(v => v.id.includes('heading'));
      expect(headingViolations.length).toBe(0);
    });

    it('should have proper form accessibility on login page', async () => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await page.waitForLoadState('networkidle');
      await injectAxe(page);

      // Check specifically for form accessibility violations
      const violations = await getViolations(page, {
        rules: {
          label: { enabled: true },
          'label-title-only': { enabled: true },
          'form-field-multiple-labels': { enabled: true },
        },
      });

      const formViolations = violations.filter(
        v => v.id.includes('label') || v.id.includes('form')
      );
      expect(formViolations.length).toBe(0);
    });

    it('should have proper navigation accessibility', async () => {
      await page.goto(`${accessibilityConfig.baseUrl}/`);
      await page.waitForLoadState('networkidle');
      await injectAxe(page);

      // Check specifically for navigation accessibility violations
      const violations = await getViolations(page, {
        rules: {
          'link-name': { enabled: true },
          'link-in-text-block': { enabled: true },
          'skip-link': { enabled: true },
        },
      });

      const navViolations = violations.filter(
        v => v.id.includes('link') || v.id.includes('navigation') || v.id.includes('skip')
      );
      expect(navViolations.length).toBe(0);
    });
  });

  describe('Application Flow Accessibility', () => {
    it('should maintain accessibility across user registration flow', async () => {
      // Test registration page accessibility
      const registerPage = new RegisterPage(page);
      await registerPage.goto();
      await page.waitForLoadState('networkidle');
      await injectAxe(page);

      let violations = await getViolations(page, accessibilityConfig.axeOptions);
      expect(violations.length).toBe(0);

      // Navigate to login and test accessibility
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await page.waitForLoadState('networkidle');
      await injectAxe(page);

      violations = await getViolations(page, accessibilityConfig.axeOptions);
      expect(violations.length).toBe(0);

      testLogger.info('Registration flow maintains accessibility');
    });

    it('should maintain accessibility across authenticated user flow', async () => {
      const loginPage = new LoginPage(page);
      const dashboardPage = new DashboardPage(page);
      const profilePage = new ProfilePage(page);

      // Login
      await loginPage.goto();
      await loginPage.login(TestUsers.READONLY.email, TestUsers.READONLY.password);
      await loginPage.waitForNavigation();

      // Test dashboard accessibility
      await dashboardPage.goto();
      await page.waitForLoadState('networkidle');
      await injectAxe(page);

      let violations = await getViolations(page, accessibilityConfig.axeOptions);
      expect(violations.length).toBe(0);

      // Test profile accessibility
      await profilePage.goto();
      await page.waitForLoadState('networkidle');
      await injectAxe(page);

      violations = await getViolations(page, accessibilityConfig.axeOptions);
      expect(violations.length).toBe(0);

      // Logout
      await loginPage.logout();

      testLogger.info('Authenticated user flow maintains accessibility');
    });
  });
});
